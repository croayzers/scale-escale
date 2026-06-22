// ============================================================================
// E-SCALE · GET /api/qr/stats?id=<qr_id>
// ----------------------------------------------------------------------------
// Devuelve las estadísticas detalladas de un QR dinámico de la organización
// del usuario autenticado.
//   - Exige Bearer token.
//   - Verifica PERTENENCIA: el QR debe ser de la company_id del contexto;
//     si no, 404 (nunca se filtran eventos de QR de otra org).
//   - Lee escale.qr_scan_events y agrega en JS:
//       total, byDay (YYYY-MM-DD en hora local del servidor), byDevice,
//       byOs, byBrowser, byCountry, y los últimos 100 escaneos en bruto.
// ============================================================================

const { json, methodNotAllowed, badRequest, serverError } = require('../../lib/http');
const { resolveAuthenticatedContext, findQrCodeForCompany, listQrScanEvents } = require('../../lib/supabase');

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

// Clave de día en hora LOCAL (getFullYear/Month/Date) — nunca toISOString().slice,
// que corre un día en husos con offset positivo.
function dayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function bump(map, key) {
  const k = key || '—';
  map[k] = (map[k] || 0) + 1;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET']);

  try {
    const accessToken = readBearerToken(req);
    if (!accessToken) return json(res, 401, { ok: false, reason: 'unauthenticated' });

    const access = await resolveAuthenticatedContext(accessToken);
    if (!access?.authenticated || !access?.user?.id) {
      return json(res, 401, { ok: false, reason: 'unauthenticated' });
    }
    const companyId = access.organization?.id;
    if (!companyId) return json(res, 403, { ok: false, reason: 'no_organization' });

    const qrId = String(req.query?.id || '').trim();
    if (!qrId) return badRequest(res, 'id requerido.');

    // Pertenencia: si el QR no es de esta org → 404 (no se filtran sus eventos).
    const qr = await findQrCodeForCompany(qrId, companyId);
    if (!qr) return json(res, 404, { ok: false, reason: 'not_found' });

    const events = await listQrScanEvents(qrId);

    const byDay = {};
    const byDevice = {};
    const byOs = {};
    const byBrowser = {};
    const byCountry = {};

    for (const ev of events) {
      bump(byDay, dayKey(ev.scanned_at));
      bump(byDevice, ev.device_type);
      bump(byOs, ev.os);
      bump(byBrowser, ev.browser);
      bump(byCountry, ev.country);
    }

    // Serie diaria ordenada ascendente para la mini-gráfica de barras.
    const byDaySeries = Object.keys(byDay)
      .sort()
      .map((day) => ({ day, count: byDay[day] }));

    return json(res, 200, {
      ok: true,
      qr: {
        id: qr.id,
        code: qr.code,
        title: qr.title,
        type: qr.type,
        target_url: qr.target_url,
        is_active: qr.is_active,
        expires_at: qr.expires_at,
        scan_count: qr.scan_count,
        last_scan_at: qr.last_scan_at,
        created_at: qr.created_at
      },
      stats: {
        total: events.length,
        byDay: byDaySeries,
        byDevice,
        byOs,
        byBrowser,
        byCountry,
        recent: events.slice(0, 100).map((ev) => ({
          scanned_at: ev.scanned_at,
          country: ev.country,
          city: ev.city,
          device_type: ev.device_type,
          os: ev.os,
          browser: ev.browser,
          referrer: ev.referrer,
          lang: ev.lang
        }))
      }
    });
  } catch (error) {
    return serverError(res, error);
  }
};

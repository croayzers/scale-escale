// ============================================================================
// E-SCALE · /api/qr/:action  (router consolidado de QR dinámicos)
// ----------------------------------------------------------------------------
// Unifica los antiguos endpoints create / list / stats / update en una sola
// función serverless (límite de 12 funciones del plan Hobby de Vercel).
//
//   POST   /api/qr/create   → crea un QR dinámico
//   GET    /api/qr/list     → lista los QR de la organización
//   GET    /api/qr/stats    → estadísticas de un QR (?id=)
//   PATCH  /api/qr/update   → edita un QR (también acepta POST)
//
// La acción se toma de req.query.action (Vercel la rellena desde [action].js)
// y, como fallback, de la última parte de la URL. Toda la lógica de negocio,
// validación y verificación de pertenencia es idéntica a la de los handlers
// previos; solo cambia el enrutado.
// ============================================================================

const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const {
  resolveAuthenticatedContext,
  createQrCode,
  listQrCodes,
  findQrCodeForCompany,
  listQrScanEvents,
  updateQrCode
} = require('../../lib/supabase');

const VALID_TYPES = new Set(['url', 'text', 'vcard', 'wifi', 'email', 'phone', 'whatsapp', 'sms', 'pdf', 'file']);
const MAX_EXPIRY_MS = 15 * 24 * 60 * 60 * 1000;

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

// Resuelve la acción: query.action (rewrite de Vercel) o última parte del path.
function readAction(req) {
  const fromQuery = String(req.query?.action || '').trim().toLowerCase();
  if (fromQuery) return fromQuery;
  const path = String(req.url || '').split('?')[0];
  const last = path.split('/').filter(Boolean).pop() || '';
  return last.toLowerCase();
}

// Resuelve usuario + organización a partir del Bearer. Devuelve { companyId, userId }
// o lanza un objeto { _status, _reason } que el caller convierte en respuesta.
async function requireContext(req) {
  const accessToken = readBearerToken(req);
  if (!accessToken) throw { _status: 401, _reason: 'unauthenticated' };

  const access = await resolveAuthenticatedContext(accessToken);
  if (!access?.authenticated || !access?.user?.id) {
    throw { _status: 401, _reason: 'unauthenticated' };
  }
  return { companyId: access.organization?.id || null, userId: access.user.id };
}

// ── Criterio de hora: TODAS las agregaciones temporales son UTC ──────────────
// El server de Vercel corre en UTC; usar getUTC* hace los resultados
// reproducibles e independientes del host. La UI debe ROTULAR estas series como
// hora UTC (byDay, byHour, byWeekday, byMonth, byHourWeekday van todas en UTC).
// (No usamos toISOString().slice porque, aunque ya sería UTC, construimos las
//  claves a mano para que día/hora/semana/mes compartan exactamente el mismo
//  criterio.)
function dayKey(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function monthKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function bump(map, key) {
  const k = key || '—';
  map[k] = (map[k] || 0) + 1;
}

// ── POST /api/qr/create ──────────────────────────────────────────────────────
async function handleCreate(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  const { companyId, userId } = await requireContext(req);
  if (!companyId) return json(res, 403, { ok: false, reason: 'no_organization' });

  const body = await readJsonBody(req);
  const type = String(body.type || 'url').trim();
  if (!VALID_TYPES.has(type)) return badRequest(res, 'Tipo de QR no válido.');

  const targetUrl = String(body.targetUrl || body.target_url || '').trim();
  if (!targetUrl && type !== 'file') return badRequest(res, 'Indica el destino (target_url) del QR dinámico.');
  if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
    return badRequest(res, 'El destino debe empezar por http:// o https://');
  }

  const title = String(body.title || '').trim().slice(0, 160) || null;

  // Para tipo 'file': extraer filePath del body y guardarlo en el payload.
  let payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};
  if (type === 'file') {
    const filePath = String(body.filePath || body.file_path || '').trim();
    if (!filePath) return badRequest(res, 'Indica el path del archivo (filePath).');
    const fileName = String(body.fileName || body.file_name || '').trim().slice(0, 200) || null;
    payload = { ...payload, file_path: filePath, file_name: fileName };
  }

  // Caducidad opcional. Tope duro: 15 días desde ahora.
  let expiresAt = null;
  if (body.expiresAt || body.expires_at) {
    const raw = body.expiresAt || body.expires_at;
    const when = new Date(raw);
    if (Number.isNaN(when.getTime())) return badRequest(res, 'Fecha de caducidad no válida.');
    if (when.getTime() <= Date.now()) return badRequest(res, 'La caducidad debe ser futura.');
    if (when.getTime() > Date.now() + MAX_EXPIRY_MS + 60 * 1000) {
      return badRequest(res, 'La caducidad máxima es de 15 días.');
    }
    expiresAt = when.toISOString();
  } else if (Number.isFinite(Number(body.expiresInDays)) && Number(body.expiresInDays) > 0) {
    const days = Math.min(15, Math.max(1, Math.floor(Number(body.expiresInDays))));
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const created = await createQrCode({
    companyId,
    ownerUserId: userId,
    type,
    title,
    targetUrl: targetUrl || null,
    payload,
    expiresAt
  });

  return json(res, 200, { ok: true, code: created.code, id: created.id || null });
}

// ── GET /api/qr/list ─────────────────────────────────────────────────────────
async function handleList(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET']);

  const { companyId } = await requireContext(req);
  if (!companyId) return json(res, 200, { ok: true, qrCodes: [] });

  const qrCodes = await listQrCodes(companyId);
  return json(res, 200, { ok: true, qrCodes });
}

// ── GET /api/qr/stats?id= ────────────────────────────────────────────────────
async function handleStats(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET']);

  const { companyId } = await requireContext(req);
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
  const byCity = {};
  const bySrc = {};
  // Series temporales (todas en UTC, ver dayKey/monthKey arriba).
  const byHour = new Array(24).fill(0);     // índice = hora 0–23 (UTC)
  const byWeekday = new Array(7).fill(0);   // índice = día semana 0=domingo … 6=sábado (UTC)
  const byMonth = {};                        // 'YYYY-MM' (UTC) → count
  const byHourWeekday = {};                  // '<weekday>-<hour>' → count (heatmap)
  // Únicos = nº de ip_hash NO-null distintos (los null = visitante desconocido,
  // se ignoran del recuento de únicos). ip_hash NUNCA se devuelve al cliente.
  const uniqueIps = new Set();

  for (const ev of events) {
    bump(byDay, dayKey(ev.scanned_at));
    bump(byDevice, ev.device_type);
    bump(byOs, ev.os);
    bump(byBrowser, ev.browser);
    bump(byCountry, ev.country);
    bump(byCity, ev.city);
    // src null → 'directo' (escaneo sin origen físico declarado).
    bump(bySrc, ev.src || 'directo');

    const d = new Date(ev.scanned_at);
    const h = d.getUTCHours();
    const wd = d.getUTCDay();
    byHour[h] += 1;
    byWeekday[wd] += 1;
    bump(byMonth, monthKey(ev.scanned_at));
    byHourWeekday[`${wd}-${h}`] = (byHourWeekday[`${wd}-${h}`] || 0) + 1;

    if (ev.ip_hash) uniqueIps.add(ev.ip_hash);
  }

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
      // Únicos: ip_hash no-null distintos (criterio de privacidad: el hash no sale).
      unique: uniqueIps.size,
      byDay: byDaySeries,
      byDevice,
      byOs,
      byBrowser,
      byCountry,
      byCity,
      bySrc,
      // Series temporales en UTC (ver comentario de dayKey). La UI debe rotular UTC.
      byHour,            // array[24]: índice = hora 0–23 (UTC)
      byWeekday,         // array[7]:  índice = día semana 0=dom … 6=sáb (UTC)
      byMonth,           // { 'YYYY-MM': count } (UTC)
      byHourWeekday,     // { '<weekday>-<hour>': count } p.ej. '1-14' = lunes 14h UTC
      recent: events.slice(0, 100).map((ev) => ({
        scanned_at: ev.scanned_at,
        country: ev.country,
        city: ev.city,
        device_type: ev.device_type,
        os: ev.os,
        browser: ev.browser,
        referrer: ev.referrer,
        lang: ev.lang,
        src: ev.src || null
        // ip_hash NO se expone: solo se usa en servidor para contar unique.
      }))
    }
  });
}

// ── PATCH/POST /api/qr/update ────────────────────────────────────────────────
async function handleUpdate(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'POST') return methodNotAllowed(req, res, ['PATCH', 'POST']);

  const { companyId } = await requireContext(req);
  if (!companyId) return json(res, 403, { ok: false, reason: 'no_organization' });

  const body = await readJsonBody(req);
  const qrId = String(body.id || '').trim();
  if (!qrId) return badRequest(res, 'id requerido.');

  // Verificación de pertenencia ANTES de actualizar.
  const existing = await findQrCodeForCompany(qrId, companyId);
  if (!existing) return json(res, 404, { ok: false, reason: 'not_found' });

  const patch = {};

  if (body.targetUrl !== undefined || body.target_url !== undefined) {
    const target = String(body.targetUrl ?? body.target_url ?? '').trim();
    if (!target) return badRequest(res, 'El destino no puede quedar vacío.');
    if (!/^https?:\/\//i.test(target)) {
      return badRequest(res, 'El destino debe empezar por http:// o https://');
    }
    patch.target_url = target;
  }
  if (body.title !== undefined) {
    patch.title = String(body.title || '').trim().slice(0, 160) || null;
  }
  if (body.isActive !== undefined || body.is_active !== undefined) {
    patch.is_active = Boolean(body.isActive ?? body.is_active);
  }

  // Caducidad: clearExpiry quita la fecha; expiresAt/expiresInDays la fija (≤15d desde creación).
  if (body.clearExpiry === true) {
    patch.expires_at = null;
  } else if (body.expiresAt || body.expires_at || body.expiresInDays != null) {
    const createdMs = existing.created_at ? new Date(existing.created_at).getTime() : Date.now();
    let whenMs;
    if (body.expiresAt || body.expires_at) {
      const when = new Date(body.expiresAt || body.expires_at);
      if (Number.isNaN(when.getTime())) return badRequest(res, 'Fecha de caducidad no válida.');
      whenMs = when.getTime();
    } else {
      const days = Math.min(15, Math.max(1, Math.floor(Number(body.expiresInDays))));
      whenMs = createdMs + days * 24 * 60 * 60 * 1000;
    }
    if (whenMs > createdMs + MAX_EXPIRY_MS + 60 * 1000) {
      return badRequest(res, 'La caducidad máxima es de 15 días desde la creación.');
    }
    patch.expires_at = new Date(whenMs).toISOString();
  }

  if (Object.keys(patch).length === 0) return badRequest(res, 'Nada que actualizar.');

  const updated = await updateQrCode(qrId, companyId, patch);
  if (!updated) return json(res, 404, { ok: false, reason: 'not_found' });

  return json(res, 200, { ok: true, qr: updated });
}

const ROUTES = {
  create: handleCreate,
  list: handleList,
  stats: handleStats,
  update: handleUpdate
};

module.exports = async function handler(req, res) {
  try {
    const action = readAction(req);
    const route = ROUTES[action];
    if (!route) return json(res, 404, { ok: false, reason: 'unknown_action' });
    return await route(req, res);
  } catch (error) {
    // Errores de contexto (auth) viajan como { _status, _reason }.
    if (error && error._status) return json(res, error._status, { ok: false, reason: error._reason });
    return serverError(res, error);
  }
};

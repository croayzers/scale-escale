// ============================================================================
// E-SCALE · POST /api/qr/create
// ----------------------------------------------------------------------------
// Crea un QR DINÁMICO para la organización del usuario autenticado.
//   - Exige Bearer token (Authorization: Bearer <access_token de Supabase>).
//   - resolveAuthenticatedContext() resuelve el usuario y su company_id (org).
//   - Genera un code base62 único (7-8 chars, reintenta si colisiona).
//   - Valida expires_at ≤ 15 días desde ahora (tope duro).
//   - Inserta en escale.qr_codes vía service-role con el company_id del usuario:
//     NUNCA acepta company_id del body (evita crear QR en org ajena).
//   - Devuelve { ok, code, id }.
// ============================================================================

const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const { resolveAuthenticatedContext, createQrCode } = require('../../lib/supabase');

const VALID_TYPES = new Set(['url', 'text', 'vcard', 'wifi', 'email', 'phone', 'whatsapp', 'sms', 'pdf']);
const MAX_EXPIRY_MS = 15 * 24 * 60 * 60 * 1000;

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const accessToken = readBearerToken(req);
    if (!accessToken) return json(res, 401, { ok: false, reason: 'unauthenticated' });

    const access = await resolveAuthenticatedContext(accessToken);
    if (!access?.authenticated || !access?.user?.id) {
      return json(res, 401, { ok: false, reason: 'unauthenticated' });
    }
    const companyId = access.organization?.id;
    if (!companyId) return json(res, 403, { ok: false, reason: 'no_organization' });

    const body = await readJsonBody(req);
    const type = String(body.type || 'url').trim();
    if (!VALID_TYPES.has(type)) return badRequest(res, 'Tipo de QR no válido.');

    const targetUrl = String(body.targetUrl || body.target_url || '').trim();
    if (!targetUrl) return badRequest(res, 'Indica el destino (target_url) del QR dinámico.');
    // El destino se sirve como redirección 302 desde /q/:code: solo http(s).
    if (!/^https?:\/\//i.test(targetUrl)) {
      return badRequest(res, 'El destino debe empezar por http:// o https://');
    }

    const title = String(body.title || '').trim().slice(0, 160) || null;

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
      ownerUserId: access.user.id,
      type,
      title,
      targetUrl,
      payload: (body.payload && typeof body.payload === 'object') ? body.payload : {},
      expiresAt
    });

    return json(res, 200, { ok: true, code: created.code, id: created.id || null });
  } catch (error) {
    return serverError(res, error);
  }
};

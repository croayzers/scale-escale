// ============================================================================
// E-SCALE · PATCH /api/qr/update
// ----------------------------------------------------------------------------
// Edita un QR dinámico (target_url / title / is_active / expires_at) que
// pertenezca a la organización del usuario autenticado.
//   - Exige Bearer token.
//   - Verifica PERTENENCIA: lee el QR filtrando por company_id del contexto
//     antes de actualizar. El PATCH también filtra por company_id → doble
//     barrera contra editar QR de otra org.
//   - expires_at validado a ≤ 15 días desde la creación.
//   - body: { id, targetUrl?, title?, isActive?, expiresAt?|expiresInDays?|clearExpiry? }
// ============================================================================

const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const { resolveAuthenticatedContext, findQrCodeForCompany, updateQrCode } = require('../../lib/supabase');

const MAX_EXPIRY_MS = 15 * 24 * 60 * 60 * 1000;

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'POST') return methodNotAllowed(req, res, ['PATCH', 'POST']);

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
    const qrId = String(body.id || '').trim();
    if (!qrId) return badRequest(res, 'id requerido.');

    // Verificación de pertenencia ANTES de actualizar.
    const existing = await findQrCodeForCompany(qrId, companyId);
    if (!existing) return json(res, 404, { ok: false, reason: 'not_found' });

    const patch = {};

    if (body.targetUrl !== undefined || body.target_url !== undefined) {
      const target = String(body.targetUrl ?? body.target_url ?? '').trim();
      if (!target) return badRequest(res, 'El destino no puede quedar vacío.');
      // El destino se sirve como redirección 302 desde /q/:code: solo http(s).
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
  } catch (error) {
    return serverError(res, error);
  }
};

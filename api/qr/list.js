// ============================================================================
// E-SCALE · GET /api/qr/list
// ----------------------------------------------------------------------------
// Lista los QR DINÁMICOS de la organización del usuario autenticado.
//   - Exige Bearer token.
//   - Filtra SIEMPRE por el company_id resuelto del contexto (nunca del query):
//     un usuario solo ve los QR de su organización.
//   - Devuelve { ok, qrCodes: [...] } con campos de "Mis QR".
// ============================================================================

const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { resolveAuthenticatedContext, listQrCodes } = require('../../lib/supabase');

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
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
    if (!companyId) return json(res, 200, { ok: true, qrCodes: [] });

    const qrCodes = await listQrCodes(companyId);
    return json(res, 200, { ok: true, qrCodes });
  } catch (error) {
    return serverError(res, error);
  }
};

const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const { resolveAuthenticatedContext, listOrgMembers, removeOrgMember } = require('../../lib/supabase');

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    return methodNotAllowed(req, res, ['GET', 'DELETE']);
  }

  try {
    const accessToken = readBearerToken(req);
    if (!accessToken) return json(res, 401, { ok: false, reason: 'auth_required' });

    const access = await resolveAuthenticatedContext(accessToken, {});
    if (!access?.authenticated || !access.organization?.id) {
      return json(res, 403, { ok: false, reason: 'org_required' });
    }

    const orgId = access.organization.id;

    // ── GET: listar miembros activos ──────────────────────────────────────────
    if (req.method === 'GET') {
      const members = await listOrgMembers(orgId);
      return json(res, 200, { ok: true, members, currentUserId: access.user?.id });
    }

    // ── DELETE: eliminar miembro (solo admin/owner) ───────────────────────────
    const role = access.role || 'editor';
    if (!['owner', 'admin'].includes(role)) {
      return json(res, 403, { ok: false, reason: 'insufficient_role' });
    }

    const body = await readJsonBody(req);
    const { userId } = body;
    if (!userId) return badRequest(res, 'userId requerido');
    if (userId === access.user?.id) return badRequest(res, 'No puedes eliminarte a ti mismo');

    await removeOrgMember(orgId, userId);
    return json(res, 200, { ok: true });

  } catch (error) {
    return serverError(res, error);
  }
};

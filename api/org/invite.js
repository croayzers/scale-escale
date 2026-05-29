const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const { resolveAuthenticatedContext, createOrgInvitation, listOrgInvitations, deleteOrgInvitation } = require('../../lib/supabase');
const { sendEmail } = require('../../lib/resend');
const { env } = require('../../lib/env');

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inviteEmailHtml({ inviterName, orgName, invitedEmail, role, appUrl }) {
  const roleLabel = { admin: 'Administrador', editor: 'Editor', viewer: 'Visualizador' }[role] || 'Editor';
  return `
<div style="font-family:'Inter',sans-serif;max-width:560px;color:#1a1a2c">
  <h2 style="margin:0 0 8px;font-size:22px">Invitación a E-scale</h2>
  <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6">
    <strong>${esc(inviterName)}</strong> te ha invitado a colaborar en el equipo
    <strong>${esc(orgName)}</strong> en E-scale como <strong>${esc(roleLabel)}</strong>.
  </p>
  <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">
    Accede con tu cuenta <strong>${esc(invitedEmail)}</strong> y automáticamente
    formarás parte del equipo.
  </p>
  <a href="${esc(appUrl)}" style="display:inline-block;background:#1a1a2c;color:#fff;
    padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
    Acceder a E-scale
  </a>
  <p style="margin:24px 0 0;font-size:11px;color:#aaa">
    Si no esperabas esta invitación puedes ignorar este mensaje.
  </p>
</div>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE' && req.method !== 'GET') {
    return methodNotAllowed(req, res, ['GET', 'POST', 'DELETE']);
  }

  try {
    const accessToken = readBearerToken(req);
    if (!accessToken) return json(res, 401, { ok: false, reason: 'auth_required' });

    const access = await resolveAuthenticatedContext(accessToken, {});
    if (!access?.authenticated || !access.organization?.id) {
      return json(res, 403, { ok: false, reason: 'org_required' });
    }

    const orgId   = access.organization.id;
    const orgName = access.organization.display_name || access.organization.displayName || 'tu empresa';
    const role    = access.role || 'editor';
    if (!['owner', 'admin'].includes(role)) {
      return json(res, 403, { ok: false, reason: 'insufficient_role' });
    }

    // ── GET: listar invitaciones pendientes ───────────────────────────────────
    if (req.method === 'GET') {
      const invitations = await listOrgInvitations(orgId);
      return json(res, 200, { ok: true, invitations });
    }

    const body = await readJsonBody(req);

    // ── DELETE: cancelar invitación ───────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { invitationId } = body;
      if (!invitationId) return badRequest(res, 'invitationId requerido');
      await deleteOrgInvitation(invitationId);
      return json(res, 200, { ok: true });
    }

    // ── POST: crear invitación ────────────────────────────────────────────────
    const { email, invitedRole = 'editor' } = body;
    if (!email || !email.includes('@')) return badRequest(res, 'Email inválido');

    const validRoles = ['admin', 'editor', 'viewer'];
    if (!validRoles.includes(invitedRole)) return badRequest(res, 'Rol inválido');

    const inviterName = access.user?.fullName || access.user?.email || 'Un compañero';
    const invitation  = await createOrgInvitation(orgId, email, invitedRole, access.user?.id, inviterName);

    if (!invitation) {
      return json(res, 200, { ok: false, reason: 'duplicate', msg: 'Ya existe una invitación pendiente para ese email' });
    }

    // Enviar email de invitación
    const appUrl = env('ESCALE_PUBLIC_APP_URL') || 'https://escale.app';
    try {
      await sendEmail({
        to: [email],
        subject: `${inviterName} te invita a E-scale`,
        html: inviteEmailHtml({ inviterName, orgName, invitedEmail: email, role: invitedRole, appUrl }),
        text: `${inviterName} te ha invitado a colaborar en ${orgName} en E-scale.\nAccede con ${email} en ${appUrl}`
      });
    } catch (emailErr) {
      console.warn('[org/invite] Email no enviado:', emailErr.message);
      // No falla el endpoint si el email falla
    }

    return json(res, 200, { ok: true, invitation });

  } catch (error) {
    return serverError(res, error);
  }
};

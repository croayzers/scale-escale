const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const {
  resolveAuthenticatedContext,
  findAuthUserByEmail,
  ensureOrganizationMembership,
  setUserActiveCompany,
  createOrgInvitation,
  listOrgInvitations,
  deleteOrgInvitation,
  listOrgMembers,
  removeOrgMember,
  listOrgFloorPlans,
  saveOrgFloorPlan,
  loadOrgFloorPlanById,
  deleteOrgFloorPlan,
  listOrgTemplates,
  saveOrgTemplate,
  loadOrgTemplateById,
  deleteOrgTemplate,
  listOrgStorageFiles,
  createSignedUploadUrl,
  createSignedViewUrl,
  deleteOrgStorageFile,
} = require('../../lib/supabase');
const { supabaseProjectUrl } = require('../../lib/env');
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
  return `<div style="font-family:'Inter',sans-serif;max-width:560px;color:#1a1a2c">
  <h2 style="margin:0 0 8px;font-size:22px">Invitación a E-scale</h2>
  <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6">
    <strong>${esc(inviterName)}</strong> te ha invitado a colaborar en el equipo
    <strong>${esc(orgName)}</strong> como <strong>${esc(roleLabel)}</strong>.
  </p>
  <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6">
    Accede con tu cuenta <strong>${esc(invitedEmail)}</strong> y automáticamente formarás parte del equipo.
  </p>
  <a href="${esc(appUrl)}" style="display:inline-block;background:#1a1a2c;color:#fff;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">
    Acceder a E-scale
  </a>
  <p style="margin:24px 0 0;font-size:11px;color:#aaa">Si no esperabas esta invitación puedes ignorar este mensaje.</p>
</div>`;
}

async function handleInvite(req, res, access) {
  const orgId   = access.organization.id;
  const orgName = access.organization.display_name || access.organization.displayName || 'tu empresa';
  const role    = access.role || 'editor';
  if (!['owner', 'admin'].includes(role)) return json(res, 403, { ok: false, reason: 'insufficient_role' });

  if (req.method === 'GET') {
    const invitations = await listOrgInvitations(orgId);
    return json(res, 200, { ok: true, invitations });
  }

  const body = await readJsonBody(req);

  if (req.method === 'DELETE') {
    if (!body.invitationId) return badRequest(res, 'invitationId requerido');
    await deleteOrgInvitation(body.invitationId);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST') {
    const { email, invitedRole = 'editor' } = body;
    if (!email || !email.includes('@')) return badRequest(res, 'Email inválido');
    if (!['admin', 'editor', 'viewer'].includes(invitedRole)) return badRequest(res, 'Rol inválido');
    const inviterName = access.user?.fullName || access.user?.email || 'Un compañero';
    const appUrl = env('ESCALE_PUBLIC_APP_URL') || 'https://events.thescaleapps.com';

    // Si el usuario ya tiene cuenta en Supabase, añadirlo directamente a company_members
    const existingUser = await findAuthUserByEmail(email);
    if (existingUser?.id) {
      await ensureOrganizationMembership(orgId, existingUser.id, invitedRole);
      // Actualizar la empresa activa del invitado para que vea esta organización en el Portal y E-Scale
      await setUserActiveCompany(existingUser.id, orgId);
      return json(res, 200, { ok: true, direct: true, appUrl });
    }

    // Usuario nuevo — guardar invitación pendiente (se aplica al hacer login)
    try {
      const invitation = await createOrgInvitation(orgId, email, invitedRole, access.user?.id, inviterName);
      if (!invitation) return json(res, 200, { ok: false, reason: 'duplicate', msg: 'Ya existe una invitación pendiente para ese email' });
      return json(res, 200, { ok: true, invitation, appUrl });
    } catch (invErr) {
      console.error('[handleInvite] Error guardando invitación:', invErr?.message);
      return json(res, 500, { ok: false, reason: 'invite_error', msg: invErr?.message });
    }
  }

  return methodNotAllowed(req, res, ['GET', 'POST', 'DELETE']);
}

async function handleMembers(req, res, access) {
  const orgId = access.organization.id;

  if (req.method === 'GET') {
    const members = await listOrgMembers(orgId);
    return json(res, 200, { ok: true, members, currentUserId: access.user?.id });
  }

  if (req.method === 'DELETE') {
    const role = access.role || 'editor';
    if (!['owner', 'admin'].includes(role)) return json(res, 403, { ok: false, reason: 'insufficient_role' });
    const body = await readJsonBody(req);
    if (!body.userId) return badRequest(res, 'userId requerido');
    if (body.userId === access.user?.id) return badRequest(res, 'No puedes eliminarte a ti mismo');
    await removeOrgMember(orgId, body.userId);
    return json(res, 200, { ok: true });
  }

  return methodNotAllowed(req, res, ['GET', 'DELETE']);
}

async function handlePlans(req, res, access) {
  const orgId = access.organization.id;

  if (req.method === 'GET') {
    if (req.query?.id) {
      const id = String(req.query.id).trim();
      if (!/^[0-9a-f-]{36}$/i.test(id)) return badRequest(res, 'id inválido');
      const plan = await loadOrgFloorPlanById(orgId, id);
      if (!plan) return json(res, 404, { ok: false });
      return json(res, 200, { ok: true, plan });
    }
    const plans = await listOrgFloorPlans(orgId);
    return json(res, 200, { ok: true, plans });
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const { name, ciudad = null, tipo = null, cliente = null, imageDataUrl = null, widthM, lengthM, opacity, venue = null } = body;
    if (!name?.trim()) return badRequest(res, 'name requerido');
    const result = await saveOrgFloorPlan({
      orgId,
      userId: access.user?.id,
      userName: access.user?.fullName || access.user?.email,
      name, venue, ciudad, tipo, cliente, widthM, lengthM, opacity, imageDataUrl,
    });
    if (result?.skipped) return json(res, 200, { ok: true, skipped: true });
    return json(res, 200, { ok: true, plan: result });
  }

  if (req.method === 'DELETE') {
    const body = await readJsonBody(req);
    const id = String(body?.id || '').trim();
    if (!id) return badRequest(res, 'id requerido');
    await deleteOrgFloorPlan(orgId, id);
    return json(res, 200, { ok: true });
  }

  return methodNotAllowed(req, res, ['GET', 'POST', 'DELETE']);
}

async function handleTemplates(req, res, access) {
  const orgId = access.organization.id;

  if (req.method === 'GET') {
    if (req.query?.id) {
      const tpl = await loadOrgTemplateById(orgId, String(req.query.id).trim());
      if (!tpl) return json(res, 404, { ok: false });
      return json(res, 200, { ok: true, template: tpl });
    }
    const kind = req.query?.kind || null;
    const templates = await listOrgTemplates(orgId, kind);
    return json(res, 200, { ok: true, templates });
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const { name, kind, data } = body;
    if (!name?.trim() || !kind || !data) return badRequest(res, 'name, kind y data requeridos');
    const result = await saveOrgTemplate({
      orgId, userId: access.user?.id,
      userName: access.user?.fullName || access.user?.email,
      name, kind, data
    });
    if (result?.skipped) return json(res, 200, { ok: true, skipped: true });
    return json(res, 200, { ok: true, template: result });
  }

  if (req.method === 'DELETE') {
    const body = await readJsonBody(req);
    const id = String(body?.id || '').trim();
    if (!id) return badRequest(res, 'id requerido');
    await deleteOrgTemplate(orgId, id);
    return json(res, 200, { ok: true });
  }

  return methodNotAllowed(req, res, ['GET', 'POST', 'DELETE']);
}

async function handleFiles(req, res, access) {
  const orgId = access.organization.id;

  if (req.method === 'GET') {
    const files = await listOrgStorageFiles(orgId);
    return json(res, 200, { ok: true, files });
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const subAction = body?.action || '';

    if (subAction === 'sign-upload') {
      const { filename } = body;
      if (!filename) return badRequest(res, 'filename requerido');
      const result = await createSignedUploadUrl(orgId, filename);
      if (!result) return json(res, 500, { ok: false, error: 'No se pudo crear URL firmada' });
      const base = supabaseProjectUrl();
      const fullUrl = result.signedURL.startsWith('http')
        ? result.signedURL
        : `${base}/storage/v1${result.signedURL}`;
      return json(res, 200, { ok: true, signedURL: fullUrl, path: result.path });
    }

    if (subAction === 'sign-view') {
      const { path } = body;
      if (!path) return badRequest(res, 'path requerido');
      if (!path.startsWith(`${orgId}/`)) return json(res, 403, { ok: false, error: 'Acceso denegado' });
      const url = await createSignedViewUrl(path, 3600);
      return json(res, 200, { ok: true, url });
    }

    return badRequest(res, 'action desconocida');
  }

  if (req.method === 'DELETE') {
    const body = await readJsonBody(req);
    const { path } = body;
    if (!path) return badRequest(res, 'path requerido');
    if (!path.startsWith(`${orgId}/`)) return json(res, 403, { ok: false, error: 'Acceso denegado' });
    await deleteOrgStorageFile(path);
    return json(res, 200, { ok: true });
  }

  return methodNotAllowed(req, res, ['GET', 'POST', 'DELETE']);
}

module.exports = async function handler(req, res) {
  const action = req.query?.action || req.url?.split('/').pop()?.split('?')[0];
  try {
    const accessToken = readBearerToken(req);
    if (!accessToken) return json(res, 401, { ok: false, reason: 'auth_required' });
    let access;
    try {
      access = await resolveAuthenticatedContext(accessToken, {});
    } catch (authErr) {
      console.error('[org] resolveAuthenticatedContext error:', authErr?.message || authErr);
      return json(res, 500, { ok: false, reason: 'auth_error', message: authErr?.message });
    }
    if (!access?.authenticated) return json(res, 401, { ok: false, reason: 'auth_required' });
    if (!access.organization?.id) return json(res, 403, { ok: false, reason: 'org_required', message: 'El usuario no pertenece a ninguna organización aún.' });

    if (action === 'invite')     return await handleInvite(req, res, access);
    if (action === 'members')    return await handleMembers(req, res, access);
    if (action === 'plans')      return await handlePlans(req, res, access);
    if (action === 'templates')  return await handleTemplates(req, res, access);
    if (action === 'files')      return await handleFiles(req, res, access);
    return json(res, 404, { ok: false, error: 'unknown_action' });
  } catch (error) {
    return serverError(res, error);
  }
};

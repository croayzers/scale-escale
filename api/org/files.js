const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const {
  resolveAuthenticatedContext,
  listOrgStorageFiles,
  createSignedUploadUrl,
  createSignedViewUrl,
  deleteOrgStorageFile,
} = require('../../lib/supabase');
const { supabaseProjectUrl } = require('../../lib/env');

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.end();
  }

  const token = readBearerToken(req);
  if (!token) return json(res, 401, { ok: false, error: 'Token requerido' });

  let access;
  try {
    access = await resolveAuthenticatedContext(token);
    if (!access?.organization?.id) return json(res, 401, { ok: false, error: 'Sin acceso a organización' });
  } catch (err) {
    return json(res, 401, { ok: false, error: 'Auth inválida' });
  }

  const orgId = access.organization.id;

  if (req.method === 'GET') {
    try {
      const files = await listOrgStorageFiles(orgId);
      return json(res, 200, { ok: true, files });
    } catch (err) {
      return serverError(res, err);
    }
  }

  if (req.method === 'POST') {
    let body;
    try { body = await readJsonBody(req); } catch { return badRequest(res, 'JSON inválido'); }

    const action = body?.action || req.query?.action || '';

    if (action === 'sign-upload') {
      const { filename, mimeType } = body;
      if (!filename) return badRequest(res, 'filename requerido');
      try {
        const result = await createSignedUploadUrl(orgId, filename);
        if (!result) return json(res, 500, { ok: false, error: 'No se pudo crear URL firmada' });
        const base = supabaseProjectUrl();
        const fullUrl = result.signedURL.startsWith('http')
          ? result.signedURL
          : `${base}/storage/v1${result.signedURL}`;
        return json(res, 200, { ok: true, signedURL: fullUrl, path: result.path });
      } catch (err) {
        return serverError(res, err);
      }
    }

    if (action === 'sign-view') {
      const { path } = body;
      if (!path) return badRequest(res, 'path requerido');
      // Verificar que el path pertenece a esta org
      if (!path.startsWith(`${orgId}/`)) return json(res, 403, { ok: false, error: 'Acceso denegado' });
      try {
        const url = await createSignedViewUrl(path, 3600);
        return json(res, 200, { ok: true, url });
      } catch (err) {
        return serverError(res, err);
      }
    }

    return badRequest(res, 'action desconocida');
  }

  if (req.method === 'DELETE') {
    let body;
    try { body = await readJsonBody(req); } catch { return badRequest(res, 'JSON inválido'); }
    const { path } = body;
    if (!path) return badRequest(res, 'path requerido');
    if (!path.startsWith(`${orgId}/`)) return json(res, 403, { ok: false, error: 'Acceso denegado' });
    try {
      await deleteOrgStorageFile(path);
      return json(res, 200, { ok: true });
    } catch (err) {
      return serverError(res, err);
    }
  }

  return methodNotAllowed(req, res, ['GET', 'POST', 'DELETE', 'OPTIONS']);
};

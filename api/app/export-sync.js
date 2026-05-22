const { json, methodNotAllowed, readJsonBody, serverError, badRequest } = require('../../lib/http');
const {
  resolveAuthenticatedContext,
  syncOrganizationProfile,
  uploadExportAttachment,
  insertExportJob,
  insertExportLines,
  insertAuditEvent
} = require('../../lib/supabase');

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const body = await readJsonBody(req);
    const company = body.company || {};
    const exportPayload = body.export || {};
    if (!exportPayload.exportType) {
      return badRequest(res, 'Export payload is required.');
    }

    const accessToken = readBearerToken(req);
    if (!accessToken) {
      return json(res, 200, {
        ok: false,
        skipped: true,
        reason: 'auth_required'
      });
    }

    const access = await resolveAuthenticatedContext(accessToken, company);
    if (!access?.authenticated || !access.organization?.id) {
      return json(res, 200, {
        ok: false,
        skipped: true,
        reason: access?.reason || 'auth_required'
      });
    }

    const organization = await syncOrganizationProfile(access.organization.id, company);

    let attachmentPath = '';
    if (body.attachment?.dataUrl && body.attachment?.filename) {
      attachmentPath = await uploadExportAttachment(
        organization?.id || access.organization.id,
        body.attachment.filename,
        body.attachment.dataUrl
      );
    }

    const exportJob = await insertExportJob({
      organizationId: organization?.id || access.organization.id,
      exportPayload,
      attachmentPath,
      createdByUserId: access.user?.id || null
    });

    await insertExportLines(exportJob?.id, exportPayload.inventoryLines || []);
    await insertAuditEvent(
      organization?.id || access.organization.id,
      'export_synced',
      {
        exportType: exportPayload.exportType,
        filename: exportPayload.filename || '',
        storagePath: attachmentPath,
        source: access.source || 'membership'
      },
      access.user?.id || null
    );

    return json(res, 200, {
      ok: true,
      exportJobId: exportJob?.id || '',
      storagePath: attachmentPath,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    return serverError(res, error);
  }
};

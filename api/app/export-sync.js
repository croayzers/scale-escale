const { json, methodNotAllowed, readJsonBody, serverError, badRequest } = require('../lib/http');
const {
  upsertOrganization,
  uploadExportAttachment,
  insertExportJob,
  insertExportLines,
  insertAuditEvent
} = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const body = await readJsonBody(req);
    const company = body.company || {};
    const exportPayload = body.export || {};
    if (!exportPayload.exportType) {
      return badRequest(res, 'Export payload is required.');
    }

    const sync = await upsertOrganization(company);
    if (!sync?.ok || !sync.organization?.id) {
      return json(res, 200, {
        ok: false,
        skipped: true,
        reason: 'cloud_sync_not_configured'
      });
    }

    let attachmentPath = '';
    if (body.attachment?.dataUrl && body.attachment?.filename) {
      attachmentPath = await uploadExportAttachment(
        sync.organization.id,
        body.attachment.filename,
        body.attachment.dataUrl
      );
    }

    const exportJob = await insertExportJob({
      organizationId: sync.organization.id,
      exportPayload,
      attachmentPath
    });

    await insertExportLines(exportJob?.id, exportPayload.inventoryLines || []);
    await insertAuditEvent(sync.organization.id, 'export_synced', {
      exportType: exportPayload.exportType,
      filename: exportPayload.filename || '',
      storagePath: attachmentPath
    });

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

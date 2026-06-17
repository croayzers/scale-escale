const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../lib/http');
const { sendEmail } = require('../lib/resend');

async function handleSendExport(body, res) {
  const recipients = Array.isArray(body.to) ? body.to.filter(Boolean) : [];
  if (!recipients.length) return badRequest(res, 'Missing recipient.');

  const result = await sendEmail({
    to: recipients,
    subject: body.subject || 'E-scale PDF',
    text: body.text || 'Adjuntamos tu PDF.',
    html: body.html || '<p>Adjuntamos tu PDF.</p>',
    attachment: body.attachment || null
  });

  return json(res, 200, { ok: true, messageId: result.id });
}

async function handleSendShare(body, res) {
  const recipients = Array.isArray(body.to) ? body.to.filter(Boolean) : [];
  if (!recipients.length) return badRequest(res, 'Missing recipients.');

  const result = await sendEmail({
    to: [process.env.ESCALE_RESEND_FROM_EMAIL],
    bcc: recipients,
    subject: body.subject || 'E-scale planning',
    text: body.text || 'Adjuntamos tu planning.',
    html: body.html || '<p>Adjuntamos tu planning.</p>',
    attachment: body.attachment || null
  });

  return json(res, 200, { ok: true, messageId: result.id, recipientCount: recipients.length });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const body   = await readJsonBody(req);
    const action = req.url?.split('?')[0].split('/').pop();

    if (action === 'send-export')   return await handleSendExport(body, res);
    if (action === 'send-share')    return await handleSendShare(body, res);
    return badRequest(res, 'Unknown email action');
  } catch (error) {
    return serverError(res, error);
  }
};

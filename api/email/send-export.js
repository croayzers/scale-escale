const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const { sendEmail } = require('../../lib/resend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const body = await readJsonBody(req);
    const recipients = Array.isArray(body.to) ? body.to.filter(Boolean) : [];
    if (!recipients.length) return badRequest(res, 'Missing recipient.');

    const result = await sendEmail({
      to: recipients,
      subject: body.subject || 'E-scale PDF',
      text: body.text || 'Adjuntamos tu PDF.',
      html: body.html || '<p>Adjuntamos tu PDF.</p>',
      attachment: body.attachment || null
    });

    return json(res, 200, {
      ok: true,
      messageId: result.id
    });
  } catch (error) {
    return serverError(res, error);
  }
};

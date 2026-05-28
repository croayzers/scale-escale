const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../lib/http');
const { sendEmail } = require('../lib/resend');

const FEEDBACK_TO = 'Rafa27x26@gmail.com';

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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

async function handleSendFeedback(body, res) {
  const type    = String(body.type    || '').trim();
  const message = String(body.message || '').trim();

  if (!type)    return badRequest(res, 'Falta el tipo de consulta.');
  if (!message) return badRequest(res, 'El mensaje no puede estar vacío.');

  const { company, name, email, plan, logo } = body.meta || {};

  const html = `
<div style="font-family:'Inter',sans-serif;max-width:600px;color:#1a1a2c">
  <h2 style="margin:0 0 4px;font-size:20px">📬 Feedback E-scale</h2>
  <p style="margin:0 0 16px;color:#888;font-size:13px">Nuevo mensaje recibido desde la app</p>
  <table style="border-collapse:collapse;width:100%;margin-bottom:16px">
    <tr><td style="padding:4px 12px 4px 0;color:#888;font-size:12px;white-space:nowrap">Tipo</td><td style="font-weight:600;font-size:14px">${esc(type)}</td></tr>
  </table>
  <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px"/>
  <p style="color:#555;font-size:12px;margin:0 0 6px;letter-spacing:.04em;text-transform:uppercase">Mensaje del usuario</p>
  <div style="background:#f5f3ee;border-left:3px solid #2563eb;border-radius:6px;padding:14px 16px;font-size:14px;white-space:pre-wrap;line-height:1.6">${esc(message)}</div>
  <hr style="border:none;border-top:3px solid #f0f0f0;margin:24px 0 16px"/>
  <p style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#bbb;margin:0 0 8px;font-weight:700">Datos internos · solo visible para admin</p>
  <table style="border-collapse:collapse;font-size:12px;color:#666;width:100%">
    ${company ? `<tr><td style="padding:3px 16px 3px 0;color:#aaa">Empresa</td><td>${esc(company)}</td></tr>` : ''}
    ${name    ? `<tr><td style="padding:3px 16px 3px 0;color:#aaa">Nombre</td><td>${esc(name)}</td></tr>`    : ''}
    ${email   ? `<tr><td style="padding:3px 16px 3px 0;color:#aaa">Email</td><td>${esc(email)}</td></tr>`    : ''}
    ${plan    ? `<tr><td style="padding:3px 16px 3px 0;color:#aaa">Plan</td><td>${esc(plan)}</td></tr>`      : ''}
    ${logo    ? `<tr><td style="padding:3px 16px 3px 0;color:#aaa">Logo</td><td style="font-size:11px">${esc(logo)}</td></tr>` : ''}
  </table>
</div>`;

  const text = [
    `[E-scale Feedback] ${type}`, '',
    message, '',
    '---',
    company ? `Empresa: ${company}` : '',
    name    ? `Nombre:  ${name}`    : '',
    email   ? `Email:   ${email}`   : '',
    plan    ? `Plan:    ${plan}`    : '',
    logo    ? `Logo:    ${logo}`    : '',
  ].filter(l => l !== undefined).join('\n');

  await sendEmail({ to: [FEEDBACK_TO], subject: `[E-scale] ${type}`, html, text });
  return json(res, 200, { ok: true });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const body   = await readJsonBody(req);
    const action = req.url?.split('?')[0].split('/').pop();

    if (action === 'send-export')   return await handleSendExport(body, res);
    if (action === 'send-share')    return await handleSendShare(body, res);
    if (action === 'send-feedback') return await handleSendFeedback(body, res);

    return badRequest(res, 'Unknown email action');
  } catch (error) {
    return serverError(res, error);
  }
};

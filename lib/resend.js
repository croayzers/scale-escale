const { env } = require('./env');

function attachmentToResend(attachment) {
  if (!attachment?.filename || !attachment?.dataUrl) return null;
  const match = String(attachment.dataUrl).match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return null;

  return {
    filename: attachment.filename,
    content: match[1]
  };
}

async function sendEmail({ to = [], bcc = [], subject, text, html, attachment }) {
  const apiKey = env('ESCALE_RESEND_API_KEY');
  const from = env('ESCALE_RESEND_FROM_EMAIL');
  if (!apiKey || !from) throw new Error('Resend no esta configurado.');

  const payload = {
    from,
    to,
    bcc,
    subject,
    text,
    html
  };

  const resendAttachment = attachmentToResend(attachment);
  if (resendAttachment) payload.attachments = [resendAttachment];

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Resend email send failed.');
  }

  return data;
}

module.exports = {
  sendEmail
};

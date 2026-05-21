function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(req, res, methods) {
  res.setHeader('Allow', methods.join(', '));
  return json(res, 405, {
    ok: false,
    error: `Method ${req.method} not allowed.`
  });
}

function badRequest(res, error) {
  return json(res, 400, {
    ok: false,
    error
  });
}

function serverError(res, error) {
  return json(res, 500, {
    ok: false,
    error: error?.message || 'Unexpected server error.'
  });
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = {
  json,
  methodNotAllowed,
  badRequest,
  serverError,
  readJsonBody
};

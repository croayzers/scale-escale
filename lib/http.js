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
  // El detalle (incluido texto crudo de PostgREST con nombres de tablas/constraints)
  // se loguea server-side; al cliente solo va un mensaje genérico.
  console.error('[api] serverError:', error?.message || error);
  return json(res, 500, {
    ok: false,
    error: 'Error interno del servidor.'
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

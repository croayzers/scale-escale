const { json, methodNotAllowed, badRequest, serverError } = require('../../lib/http');
const { searchFloorPlans, hasSupabaseServiceRole } = require('../../lib/supabase');

const MAX_Q_LENGTH = 120;
const MAX_RESULTS  = 24;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET']);

  // ── Guard: Supabase no configurado ─────────────────────────────────────────
  if (!hasSupabaseServiceRole()) {
    return json(res, 503, { ok: false, error: 'floor_plan_library_unavailable', results: [] });
  }

  // ── Validar parámetro q ────────────────────────────────────────────────────
  const raw = String(req.query?.q ?? '').trim();
  if (!raw) return badRequest(res, 'El parámetro q es obligatorio.');
  if (raw.length > MAX_Q_LENGTH) return badRequest(res, `q no puede superar ${MAX_Q_LENGTH} caracteres.`);

  // Escapar wildcards para que no rompan la query ilike
  const q = raw.replace(/[%_]/g, '\\$&');

  try {
    const results = await searchFloorPlans(q, MAX_RESULTS);
    return json(res, 200, { ok: true, results });

  } catch (error) {
    console.error('[plans/search]', error.message);
    return serverError(res, error);
  }
};

const { json, methodNotAllowed, badRequest, serverError } = require('../../lib/http');
const { searchFloorPlans, getFloorPlanFilters, hasSupabaseServiceRole } = require('../../lib/supabase');

const MAX_Q_LENGTH = 120;
const MAX_RESULTS  = 24;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET']);

  if (!hasSupabaseServiceRole()) {
    return json(res, 503, { ok: false, error: 'floor_plan_library_unavailable', results: [], cities: [], types: [] });
  }

  // ── Modo filtros: devuelve ciudades y tipos distintos ──────────────────────
  if (req.query?.mode === 'filters') {
    try {
      const { cities, types } = await getFloorPlanFilters();
      return json(res, 200, { ok: true, cities, types });
    } catch (error) {
      console.error('[plans/search?mode=filters]', error.message);
      return serverError(res, error);
    }
  }

  // ── Modo búsqueda ──────────────────────────────────────────────────────────
  const rawQ    = String(req.query?.q    ?? '').trim();
  const rawCity = String(req.query?.city ?? '').trim();
  const rawType = String(req.query?.type ?? '').trim();

  if (!rawQ && !rawCity && !rawType) {
    return badRequest(res, 'Indica al menos un filtro: q, city o type.');
  }
  if (rawQ.length > MAX_Q_LENGTH) {
    return badRequest(res, `q no puede superar ${MAX_Q_LENGTH} caracteres.`);
  }

  const q    = rawQ.replace(/[%_]/g, '\\$&');
  const city = rawCity.slice(0, 100);
  const type = rawType.slice(0, 80);

  try {
    const results = await searchFloorPlans(q, MAX_RESULTS, { city, type });
    return json(res, 200, { ok: true, results });
  } catch (error) {
    console.error('[plans/search]', error.message);
    return serverError(res, error);
  }
};

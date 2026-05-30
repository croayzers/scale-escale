const { json, methodNotAllowed, badRequest, serverError } = require('../../lib/http');
const {
  searchCommunityFloorPlans,
  getCommunityFloorPlanFilters,
  loadCommunityFloorPlan,
  hasSupabaseServiceRole,
} = require('../../lib/supabase');

const MAX_Q_LENGTH = 120;
const MAX_RESULTS  = 24;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET']);

  if (!hasSupabaseServiceRole()) {
    return json(res, 503, { ok: false, error: 'service_unavailable', results: [] });
  }

  // ── Cargar imagen de un plano concreto ──────────────────────────────────────
  if (req.query?.id) {
    const id = String(req.query.id).trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return badRequest(res, 'id inválido');
    try {
      const plan = await loadCommunityFloorPlan(id);
      if (!plan) return json(res, 404, { ok: false, error: 'not_found' });
      return json(res, 200, { ok: true, plan });
    } catch (error) {
      console.error('[plans/community?id]', error.message);
      return serverError(res, error);
    }
  }

  // ── Filtros disponibles ─────────────────────────────────────────────────────
  if (req.query?.mode === 'filters') {
    try {
      const { cities, types } = await getCommunityFloorPlanFilters();
      return json(res, 200, { ok: true, cities, types });
    } catch (error) {
      console.error('[plans/community?mode=filters]', error.message);
      return serverError(res, error);
    }
  }

  // ── Búsqueda / listado ──────────────────────────────────────────────────────
  const rawQ    = String(req.query?.q    ?? '').trim();
  const rawCity = String(req.query?.city ?? '').trim();
  const rawType = String(req.query?.type ?? '').trim();

  if (rawQ.length > MAX_Q_LENGTH) {
    return badRequest(res, `q no puede superar ${MAX_Q_LENGTH} caracteres.`);
  }

  const q    = rawQ.replace(/[%_]/g, '\\$&');
  const city = rawCity.slice(0, 100);
  const type = rawType.slice(0, 80);

  try {
    const results = await searchCommunityFloorPlans(q, MAX_RESULTS, { city, type });
    return json(res, 200, { ok: true, results });
  } catch (error) {
    console.error('[plans/community]', error.message);
    return serverError(res, error);
  }
};

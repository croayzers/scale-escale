const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { getFloorPlanFilters, hasSupabaseServiceRole } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(req, res, ['GET']);

  if (!hasSupabaseServiceRole()) {
    return json(res, 503, { ok: false, error: 'floor_plan_library_unavailable', cities: [], types: [] });
  }

  try {
    const { cities, types } = await getFloorPlanFilters();
    return json(res, 200, { ok: true, cities, types });
  } catch (error) {
    console.error('[plans/filters]', error.message);
    return serverError(res, error);
  }
};

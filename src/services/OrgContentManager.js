/* ─────────────────────────────────────────────────────────
   ORG CONTENT MANAGER — Planos y plantillas compartidos
   entre miembros de la misma organización via Supabase.
   ───────────────────────────────────────────────────────── */

import { AuthManager } from './AuthManager.js';
import { AppState } from '../core/AppState.js';

const T_PLANS     = 'org_floor_plans';
const T_TEMPLATES = 'org_templates';

/* ─── Accesos ───────────────────────────────────────────── */

function _db()      { return AuthManager.getSupabaseClient?.() ?? null; }
function _orgId()   { return AppState.company?.organizationId || null; }
function _userId()  { return AppState.company?.authUserId || null; }
function _name()    { return AppState.company?.authDisplayName || AppState.company?.authEmail || null; }
export  function canSync() { return Boolean(_db() && _orgId()); }

function _toast(msg, kind = 'info') {
  document.dispatchEvent(new CustomEvent('escale:toast', { detail: { msg, kind } }));
}

/* ════════════════════════════════════════════════════════
   PLANOS (org_floor_plans)
   ════════════════════════════════════════════════════════ */

/**
 * Guarda el plano actual en la nube.
 * Devuelve { skipped: true } si ya existe uno con el mismo nombre.
 */
export async function saveFloorPlan({ name, imageDataUrl, widthM, lengthM, opacity, ciudad = null, tipo = null }) {
  if (!canSync()) return null;
  const trimName = name.trim();

  // Deduplicación
  const { data: dup } = await _db()
    .from(T_PLANS)
    .select('id')
    .eq('organization_id', _orgId())
    .eq('name', trimName)
    .maybeSingle();
  if (dup) return { skipped: true };

  const { data, error } = await _db()
    .from(T_PLANS)
    .insert({
      organization_id:          _orgId(),
      created_by_user_id:       _userId(),
      created_by_display_name:  _name(),
      name:                     trimName,
      venue:                    AppState.company?.venue || null,
      ciudad,
      tipo,
      width_m:                  widthM,
      length_m:                 lengthM,
      opacity:                  opacity,
      image_data_url:           imageDataUrl,
    })
    .select('id, name, ciudad, tipo, width_m, length_m, opacity, created_by_display_name, created_at')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Lista los planos de la organización (sin imagen para ir ligero). */
export async function listFloorPlans() {
  if (!canSync()) return [];
  const { data, error } = await _db()
    .from(T_PLANS)
    .select('id, name, venue, ciudad, tipo, width_m, length_m, opacity, created_by_display_name, created_at')
    .eq('organization_id', _orgId())
    .order('created_at', { ascending: false });
  return error ? [] : (data ?? []);
}

/** Carga la imagen + datos de un plano específico. */
export async function loadFloorPlan(id) {
  if (!canSync()) return null;
  const { data, error } = await _db()
    .from(T_PLANS)
    .select('id, name, width_m, length_m, opacity, image_data_url')
    .eq('id', id)
    .eq('organization_id', _orgId())
    .single();
  return error ? null : data;
}

/** Elimina un plano (solo el creador). */
export async function deleteFloorPlan(id) {
  if (!canSync()) return;
  await _db().from(T_PLANS).delete().eq('id', id).eq('organization_id', _orgId());
}

/* ════════════════════════════════════════════════════════
   PLANTILLAS (org_templates)
   ════════════════════════════════════════════════════════ */

/**
 * Guarda una plantilla en la nube.
 * Devuelve { skipped: true } si ya existe una con el mismo nombre y tipo.
 */
export async function saveTemplate({ name, kind, data }) {
  if (!canSync()) return null;
  const trimName = name.trim();

  // Deduplicación por nombre + tipo
  const { data: dup } = await _db()
    .from(T_TEMPLATES)
    .select('id')
    .eq('organization_id', _orgId())
    .eq('kind', kind)
    .eq('name', trimName)
    .maybeSingle();
  if (dup) return { skipped: true };

  const { data: row, error } = await _db()
    .from(T_TEMPLATES)
    .insert({
      organization_id:          _orgId(),
      created_by_user_id:       _userId(),
      created_by_display_name:  _name(),
      name:                     trimName,
      kind,
      data,
    })
    .select('id, name, kind, created_by_display_name, created_at')
    .single();

  if (error) throw new Error(error.message);
  return row;
}

/** Lista plantillas de la organización por tipo ('base' | 'planning'). */
export async function listTemplates(kind) {
  if (!canSync()) return [];
  const { data, error } = await _db()
    .from(T_TEMPLATES)
    .select('id, name, kind, created_by_display_name, created_at')
    .eq('organization_id', _orgId())
    .eq('kind', kind)
    .order('created_at', { ascending: false });
  return error ? [] : (data ?? []);
}

/** Carga los datos completos de una plantilla. */
export async function loadTemplate(id) {
  if (!canSync()) return null;
  const { data, error } = await _db()
    .from(T_TEMPLATES)
    .select('id, name, kind, data')
    .eq('id', id)
    .eq('organization_id', _orgId())
    .single();
  return error ? null : data;
}

/** Elimina una plantilla (solo el creador). */
export async function deleteTemplate(id) {
  if (!canSync()) return;
  await _db().from(T_TEMPLATES).delete().eq('id', id).eq('organization_id', _orgId());
}

export const OrgContentManager = {
  canSync,
  saveFloorPlan,
  listFloorPlans,
  loadFloorPlan,
  deleteFloorPlan,
  saveTemplate,
  listTemplates,
  loadTemplate,
  deleteTemplate,
};

window.OrgContentManager = OrgContentManager;

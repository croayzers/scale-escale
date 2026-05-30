/* ─────────────────────────────────────────────────────────
   ORG CONTENT MANAGER — Planos y plantillas compartidos
   entre miembros de la misma organización.
   Las operaciones de org_floor_plans se enrutan al servidor
   (/api/org/plans) usando service role key para evitar RLS.
   ───────────────────────────────────────────────────────── */

import { AuthManager } from './AuthManager.js';
import { AppState } from '../core/AppState.js';

const T_TEMPLATES = 'org_templates';

/* ─── Accesos ───────────────────────────────────────────── */
function _db()     { return AuthManager.getSupabaseClient?.() ?? null; }
function _orgId()  { return AppState.company?.organizationId || null; }
function _userId() { return AppState.company?.authUserId || null; }
function _name()   { return AppState.company?.authDisplayName || AppState.company?.authEmail || null; }

export function canSync() { return Boolean(_db() && _orgId()); }

async function _getToken() {
  const db = _db();
  if (!db) return null;
  try {
    const { data } = await db.auth.getSession();
    return data?.session?.access_token || null;
  } catch { return null; }
}

function _toast(msg, kind = 'info') {
  document.dispatchEvent(new CustomEvent('escale:toast', { detail: { msg, kind } }));
}

/* ════════════════════════════════════════════════════════
   PLANOS — server-side (bypass RLS)
   ════════════════════════════════════════════════════════ */

export async function listFloorPlans() {
  const token = await _getToken();
  if (!token) return [];
  try {
    const res = await fetch('/api/org/plans', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (!res.ok) { console.error('[OrgContentManager] listFloorPlans HTTP', res.status); return []; }
    const data = await res.json();
    return data.plans ?? [];
  } catch (err) {
    console.error('[OrgContentManager] listFloorPlans:', err);
    return [];
  }
}

export async function saveFloorPlan({ name, imageDataUrl, widthM, lengthM, opacity, ciudad = null, tipo = null }) {
  const token = await _getToken();
  if (!token) return null;
  const res = await fetch('/api/org/plans', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      name: name.trim(),
      ciudad,
      tipo,
      imageDataUrl,
      widthM,
      lengthM,
      opacity,
      venue: AppState.company?.venue || null,
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.skipped) return { skipped: true };
  return data.plan || null;
}

export async function loadFloorPlan(id) {
  const token = await _getToken();
  if (!token) return null;
  try {
    const res = await fetch(`/api/org/plans?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.plan || null;
  } catch { return null; }
}

export async function deleteFloorPlan(id) {
  const token = await _getToken();
  if (!token) return;
  await fetch('/api/org/plans', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
}

/* ════════════════════════════════════════════════════════
   PLANTILLAS — sigue usando el cliente Supabase
   ════════════════════════════════════════════════════════ */

export async function saveTemplate({ name, kind, data }) {
  if (!canSync()) return null;
  const trimName = name.trim();
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
      organization_id:         _orgId(),
      created_by_user_id:      _userId(),
      created_by_display_name: _name(),
      name: trimName,
      kind,
      data,
    })
    .select('id, name, kind, created_by_display_name, created_at')
    .single();
  if (error) throw new Error(error.message);
  return row;
}

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

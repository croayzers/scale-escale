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

export function canSync() { return Boolean(_db()); }

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

export async function saveFloorPlan({ name, imageDataUrl, widthM, lengthM, opacity, ciudad = null, tipo = null, cliente = null, venue = null }) {
  const token = await _getToken();
  if (!token) throw new Error('Sesión no disponible. Vuelve a iniciar sesión.');
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
      cliente,
      venue,
      imageDataUrl,
      widthM,
      lengthM,
      opacity,
    })
  });
  if (!res.ok) {
    // Surface el error real (status + reason/error del servidor) en lugar de tragárselo.
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.message || body?.error || body?.reason || '';
    } catch { /* respuesta no-JSON (p.ej. 413 de Vercel) */ }
    if (res.status === 413) detail = detail || 'La imagen del plano es demasiado grande.';
    if (res.status === 403) detail = detail || 'No perteneces a ninguna organización.';
    if (res.status === 401) detail = detail || 'Sesión expirada.';
    throw new Error(detail ? `${detail} (HTTP ${res.status})` : `HTTP ${res.status}`);
  }
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
    const plan = data.plan || null;
    // Poblar plan.meta con los datos guardados en Supabase
    if (plan && AppState.plan) {
      AppState.plan.meta = {
        nombre:  plan.name    || '',
        ciudad:  plan.ciudad  || '',
        tipo:    plan.tipo    || '',
        cliente: plan.cliente || '',
        lugar:   plan.venue   || '',
      };
    }
    return plan;
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
   PLANTILLAS — server-side via /api/org/templates (bypass RLS)
   ════════════════════════════════════════════════════════ */

async function _templateFetch(method, params = {}, body = null) {
  const token = await _getToken();
  if (!token) return null;
  let url = '/api/org/templates';
  const qs = new URLSearchParams(params).toString();
  if (qs) url += '?' + qs;
  const opts = { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) return null;
  return res.json();
}

export async function saveTemplate({ name, kind, data }) {
  const token = await _getToken();
  if (!token) return null;
  const res = await _templateFetch('POST', {}, { name, kind, data });
  if (!res?.ok) return null;
  if (res.skipped) return { skipped: true };
  return res.template || null;
}

export async function listTemplates(kind) {
  const token = await _getToken();
  if (!token) return [];
  const res = await _templateFetch('GET', kind ? { kind } : {});
  return res?.templates ?? [];
}

export async function loadTemplate(id) {
  const token = await _getToken();
  if (!token) return null;
  const res = await _templateFetch('GET', { id });
  return res?.template ?? null;
}

export async function deleteTemplate(id) {
  const token = await _getToken();
  if (!token) return;
  await _templateFetch('DELETE', {}, { id });
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

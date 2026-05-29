/* ─────────────────────────────────────────────────────────
   SAVED GROUP LIBRARY — Grupos guardados en nube (Supabase)
   con fallback a localStorage cuando no hay conexión.
   ───────────────────────────────────────────────────────── */

import { AppState } from './AppState.js';
import { AuthManager } from '../services/AuthManager.js';

const STORAGE_KEY  = 'escale_saved_groups';
const TABLE        = 'saved_groups';
let _groups        = null; // caché en memoria

/* ─── Helpers de acceso ─────────────────────────────────── */

function _client()  { return AuthManager.getSupabaseClient?.() ?? null; }
function _orgId()   { return AppState.company?.organizationId || null; }
function _userId()  { return AppState.company?.authUserId || null; }
function _userName(){ return AppState.company?.authDisplayName || AppState.company?.authEmail || null; }
function _useCloud(){ return Boolean(_client() && _orgId()); }

function _toast(msg, kind = 'info') {
  document.dispatchEvent(new CustomEvent('escale:toast', { detail: { msg, kind } }));
}

function _emit() {
  document.dispatchEvent(new CustomEvent('escale:saved-groups-changed'));
}

/* ─── Serialización: DB row → objeto interno ────────────── */

function _fromRow(row) {
  return {
    id:            row.id,
    name:          row.name,
    createdAt:     row.created_at,
    thumbnail:     row.thumbnail_svg || '',
    itemCount:     row.item_count,
    itemTemplates: row.item_templates || [],
    createdBy:     row.created_by_user_id,
    createdByName: row.created_by_display_name || null,
  };
}

/* ─── LOAD ──────────────────────────────────────────────── */

async function load() {
  if (_useCloud()) {
    try {
      const { data, error } = await _client()
        .from(TABLE)
        .select('*')
        .eq('organization_id', _orgId())
        .order('created_at', { ascending: false });

      if (!error && data) {
        _groups = data.map(_fromRow);
        // Sincronizar localStorage como caché offline
        _persistLocal();
        return _groups;
      }
      console.warn('[SavedGroupLibrary] Supabase load error:', error?.message);
    } catch (err) {
      console.warn('[SavedGroupLibrary] Supabase unreachable:', err.message);
    }
  }
  // Fallback: localStorage
  _loadLocal();
  return _groups;
}

function _loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _groups = raw ? JSON.parse(raw) : [];
  } catch {
    _groups = [];
  }
}

function _persistLocal() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_groups)); } catch {}
}

/* ─── GET ───────────────────────────────────────────────── */

function getAll() {
  if (!_groups) _loadLocal();
  return _groups;
}

function getById(id) {
  return getAll().find(g => g.id === id) || null;
}

/* ─── SAVE CURRENT SELECTION ────────────────────────────── */

async function saveCurrentSelection(name) {
  const ids = [...AppState.selectedIds];
  if (ids.length < 2) {
    _toast('Selecciona 2 o más elementos para guardar como grupo', 'warning');
    return null;
  }

  const items = ids.map(id => AppState.items.find(i => i.id === id)).filter(Boolean);
  const cx    = items.reduce((s, i) => s + i.x, 0) / items.length;
  const cz    = items.reduce((s, i) => s + i.z, 0) / items.length;

  const itemTemplates = items.map(item => {
    const clone = JSON.parse(JSON.stringify(item));
    delete clone.id; delete clone._mesh; delete clone._group;
    delete clone.groupId; delete clone.savedGroupId; delete clone.groupClosed;
    clone._relX = item.x - cx;
    clone._relZ = item.z - cz;
    return clone;
  });

  const thumbnail = generateThumbnailSVG(itemTemplates);

  if (_useCloud()) {
    try {
      const { data, error } = await _client()
        .from(TABLE)
        .insert({
          organization_id:          _orgId(),
          created_by_user_id:       _userId(),
          created_by_display_name:  _userName(),
          name:                     name.trim(),
          item_count:               itemTemplates.length,
          thumbnail_svg:            thumbnail,
          item_templates:           itemTemplates,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      const def = _fromRow(data);
      _groups = [def, ...(getAll())];
      _persistLocal();
      _emit();
      _toast(`Grupo "${def.name}" guardado · ${itemTemplates.length} elementos`, 'success');
      return def;
    } catch (err) {
      console.error('[SavedGroupLibrary] Error guardando en nube:', err.message);
      _toast('Error al guardar en la nube, guardando localmente', 'warning');
    }
  }

  // Fallback local
  const def = {
    id:            'sg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name:          name.trim(),
    createdAt:     new Date().toISOString(),
    thumbnail,
    itemCount:     itemTemplates.length,
    itemTemplates,
    createdBy:     null,
    createdByName: null,
  };
  _groups = [def, ...(getAll())];
  _persistLocal();
  _emit();
  _toast(`Grupo "${def.name}" guardado · ${itemTemplates.length} elementos`, 'success');
  return def;
}

/* ─── DELETE ────────────────────────────────────────────── */

async function deleteSavedGroup(id) {
  if (_useCloud()) {
    try {
      const { error } = await _client()
        .from(TABLE)
        .delete()
        .eq('id', id)
        .eq('organization_id', _orgId());
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error('[SavedGroupLibrary] Error eliminando en nube:', err.message);
      _toast('Error al eliminar en la nube', 'warning');
      return;
    }
  }
  _groups = getAll().filter(g => g.id !== id);
  _persistLocal();
  _emit();
}

/* ─── RENAME ────────────────────────────────────────────── */

async function renameSavedGroup(id, newName) {
  const trimmed = newName.trim();
  if (_useCloud()) {
    try {
      const { error } = await _client()
        .from(TABLE)
        .update({ name: trimmed })
        .eq('id', id)
        .eq('organization_id', _orgId());
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error('[SavedGroupLibrary] Error renombrando en nube:', err.message);
      _toast('Error al renombrar en la nube', 'warning');
      return;
    }
  }
  const def = getById(id);
  if (def) def.name = trimmed;
  _persistLocal();
  _emit();
}

/* ─── THUMBNAIL SVG ─────────────────────────────────────── */

function generateThumbnailSVG(itemTemplates) {
  if (!itemTemplates.length) return '';

  const xs = itemTemplates.map(i => i._relX);
  const zs = itemTemplates.map(i => i._relZ);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const rangeX = Math.max(maxX - minX, 0.5);
  const rangeZ = Math.max(maxZ - minZ, 0.5);

  const pad = 10, vw = 100, vh = 100, usable = vw - pad * 2;
  const scale = usable / Math.max(rangeX, rangeZ);

  const toSvg = (rx, rz) => ({
    sx: pad + (rx - minX) * scale + (usable - rangeX * scale) / 2,
    sz: pad + (rz - minZ) * scale + (usable - rangeZ * scale) / 2,
  });

  const shapes = itemTemplates.map(item => {
    const { sx, sz } = toSvg(item._relX, item._relZ);
    const t = item.type || '';
    const fill = item.color || '#1a1a1c';

    if (t === 'mesa' || t.startsWith('mesa') || t === 'table') {
      const d = Math.min(item.dims?.diameter || 1.8, rangeX * 0.35) * scale * 0.4;
      return `<circle cx="${sx.toFixed(1)}" cy="${sz.toFixed(1)}" r="${Math.max(d, 3).toFixed(1)}" fill="${fill}" opacity="0.8"/>`;
    }
    if (t.startsWith('silla') || t === 'chair' || t === 'seat') {
      const s = Math.max(scale * 0.18, 2.5);
      return `<rect x="${(sx-s).toFixed(1)}" y="${(sz-s).toFixed(1)}" width="${(s*2).toFixed(1)}" height="${(s*2).toFixed(1)}" fill="${fill}" opacity="0.7"/>`;
    }
    if (t === 'zone') {
      const w = Math.max((item.dims?.width || 3) * scale * 0.25, 8);
      const h = Math.max((item.dims?.length || 3) * scale * 0.25, 8);
      return `<rect x="${(sx-w/2).toFixed(1)}" y="${(sz-h/2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="${fill}" stroke-width="1.2" stroke-dasharray="3,2" opacity="0.6"/>`;
    }
    if (t === 'carpa' || t === 'structure') {
      const w = Math.max((item.dims?.width || 6) * scale * 0.18, 6);
      const h = Math.max((item.dims?.length || 6) * scale * 0.18, 6);
      return `<rect x="${(sx-w/2).toFixed(1)}" y="${(sz-h/2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" opacity="0.25" stroke="${fill}" stroke-width="1"/>`;
    }
    if (t.includes('bar') || t.includes('buffet')) {
      const w = Math.max(scale * 0.5, 8), h = Math.max(scale * 0.12, 2);
      return `<rect x="${(sx-w/2).toFixed(1)}" y="${(sz-h/2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" opacity="0.75"/>`;
    }
    return `<circle cx="${sx.toFixed(1)}" cy="${sz.toFixed(1)}" r="3" fill="${fill}" opacity="0.6"/>`;
  }).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}"><rect width="${vw}" height="${vh}" fill="rgba(10,10,11,0.04)" rx="4"/>${shapes}</svg>`;
}

export const SavedGroupLibrary = {
  load,
  getAll,
  getById,
  saveCurrentSelection,
  deleteSavedGroup,
  renameSavedGroup,
  generateThumbnailSVG,
};

window.SavedGroupLibrary = SavedGroupLibrary;

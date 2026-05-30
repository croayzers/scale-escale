/* ─────────────────────────────────────────────────────────
   CONTEXT SPAWN MENU
   Clic derecho en canvas vacío → menú flotante con los 3
   últimos tipos de elemento usados. Spawn en coordenada 3D exacta.
   ───────────────────────────────────────────────────────── */

import { AppState }             from '../core/AppState.js';
import { createItemFromCatalog } from '../schemas/SchemaItemFactory.js';

const LS_KEY = 'escale_recent_spawn';
const MAX    = 3;

let _spawnPoint = null; // THREE.Vector3 — punto exacto en Y=0

/* ════════════════════════════════════════════════════════
   HISTORIAL
   ════════════════════════════════════════════════════════ */
function _load()        { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function _save(arr)     { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }

export function pushToHistory(type) {
  if (!type) return;
  const arr = _load().filter(t => t !== type); // evita duplicados
  arr.unshift(type);
  _save(arr.slice(0, MAX));
}

/* ════════════════════════════════════════════════════════
   LOOKUP EN CATÁLOGO
   ════════════════════════════════════════════════════════ */
function _findDef(type) {
  return (window.__ESCALE_CATALOG__ || []).find(d => d.type === type) ?? null;
}

/* ════════════════════════════════════════════════════════
   MOSTRAR / OCULTAR
   ════════════════════════════════════════════════════════ */
export function show(clientX, clientY, groundPoint) {
  const recent = _load();
  if (!recent.length) return;

  _spawnPoint = groundPoint;
  const menu    = document.getElementById('ctx-spawn-menu');
  const itemsEl = document.getElementById('ctx-spawn-items');
  if (!menu || !itemsEl) return;

  itemsEl.innerHTML = '';
  let rendered = 0;
  recent.forEach(type => {
    const def = _findDef(type);
    if (!def) return;
    const btn = document.createElement('button');
    btn.className = 'ctx-spawn-item';
    btn.type = 'button';
    btn.innerHTML = `
      <i data-lucide="${def.icon || 'box'}" style="width:13px;height:13px;flex-shrink:0;opacity:.7"></i>
      <span>${def.name || type}</span>`;
    btn.addEventListener('click', () => { _spawn(type); hide(); });
    itemsEl.appendChild(btn);
    rendered++;
  });

  if (!rendered) return;

  menu.classList.remove('hidden');
  if (window.lucide) lucide.createIcons({ nodes: [menu] });

  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.min(clientX, window.innerWidth  - w - 12)}px`;
  menu.style.top  = `${Math.min(clientY, window.innerHeight - h - 12)}px`;
}

export function hide() {
  document.getElementById('ctx-spawn-menu')?.classList.add('hidden');
  _spawnPoint = null;
}

export function isVisible() {
  return !document.getElementById('ctx-spawn-menu')?.classList.contains('hidden');
}

/* ════════════════════════════════════════════════════════
   SPAWN
   ════════════════════════════════════════════════════════ */
function _spawn(type) {
  if (!_spawnPoint) return;
  const def = _findDef(type);
  if (!def) return;
  const item = createItemFromCatalog(def, {
    x: _spawnPoint.x,
    y: 0,
    z: _spawnPoint.z,
  });
  AppState.add(item);
  pushToHistory(type);
}

/* ════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════ */
export function init() {
  document.addEventListener('click', e => {
    const menu = document.getElementById('ctx-spawn-menu');
    if (menu && !menu.contains(e.target)) hide();
  });

  document.getElementById('ctx-spawn-catalog')?.addEventListener('click', () => {
    hide();
    document.getElementById('btn-catalog')?.click();
  });
}

export const ContextSpawnMenu = { init, show, hide, isVisible, pushToHistory };

/* ─────────────────────────────────────────────────────────
   LAYER MANAGER — Layer system: visibility, lock, assignment
   ───────────────────────────────────────────────────────── */

import { AppState } from './AppState.js';

const DEFAULT_LAYERS = [
  { id: 'material', name: 'Material', visible: true, locked: false, color: '#16a34a' },
  { id: 'personal', name: 'Personal', visible: true, locked: false, color: '#2563eb' },
  { id: 'base',     name: 'Base',     visible: true, locked: false, color: '#6b7280' },
];

let layers = JSON.parse(JSON.stringify(DEFAULT_LAYERS));
let activeLayerId = 'material';
let _sceneManager = null;
let _activeCtxMenu = null;

async function bindSceneManager() {
  if (!_sceneManager) {
    const mod = await import('../scene/SceneManager.js');
    _sceneManager = mod.SceneManager;
  }
}

/* ─── Layer queries ─── */
function getLayer(layerId) {
  return layers.find(l => l.id === layerId) || null;
}

function getItemLayer(item) {
  if (!item) return null;
  return getLayer(item.layerId || 'material');
}

function isItemVisible(item) {
  const layer = getItemLayer(item);
  return !layer || layer.visible !== false;
}

function isItemEditable(item) {
  if (!item || item.locked) return false;
  const layer = getItemLayer(item);
  return !layer || !layer.locked;
}

/* ─── Layer mutations ─── */
function setLayerName(layerId, name) {
  const layer = getLayer(layerId);
  if (!layer) return;
  const trimmed = String(name).trim();
  if (trimmed) layer.name = trimmed;
  refreshLayerPanel();
}

function setLayerColor(layerId, color) {
  const layer = getLayer(layerId);
  if (!layer) return;
  layer.color = color;
  refreshLayerPanel();
}

function setActiveLayer(layerId) {
  if (!getLayer(layerId)) return;
  activeLayerId = layerId;
  refreshLayerPanel();
}

async function setLayerVisibility(layerId, visible) {
  const layer = getLayer(layerId);
  if (!layer) return;
  layer.visible = visible;
  await bindSceneManager();
  // Toggle Three.js group visibility for all items in this layer
  AppState.items.forEach(item => {
    if ((item.layerId || 'material') === layerId) {
      const group = _sceneManager?.meshes?.get(item.id);
      if (group) group.visible = visible;
    }
  });
  refreshLayerPanel();
  _sceneManager?.highlightSelection();
}

function setLayerLocked(layerId, locked) {
  const layer = getLayer(layerId);
  if (!layer) return;
  layer.locked = locked;
  refreshLayerPanel();
  _sceneManager?.highlightSelection();
}

async function moveSelectedToLayer(layerId) {
  if (!getLayer(layerId)) return;
  await bindSceneManager();
  AppState.pushHistory();
  [...AppState.selectedIds].forEach(id => {
    const item = AppState.items.find(i => i.id === id);
    if (!item) return;
    item.layerId = layerId;
    _sceneManager?.rebuild(item);
  });
  refreshLayerPanel();
}

/* ─── Lock flash & toast ─── */
function flashLockWarning(layerId) {
  const btn = document.querySelector(`.layer-lock-btn[data-layer-id="${layerId}"]`);
  if (!btn) return;
  btn.classList.add('layer-lock-blink');
  clearTimeout(btn._blinkTimer);
  btn._blinkTimer = setTimeout(() => btn.classList.remove('layer-lock-blink'), 10000);
}

function showLockedLayerToast(msg) {
  let c = document.getElementById('escale-toast');
  if (!c) {
    c = document.createElement('div');
    c.id = 'escale-toast';
    c.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:300;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:6px;';
    document.body.appendChild(c);
  }
  const t = document.createElement('div');
  t.style.cssText = 'background:rgba(185,28,28,0.95);color:#fff;padding:10px 20px;border-radius:10px;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:0.04em;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.15);opacity:0;transform:translateY(8px);transition:opacity 0.3s,transform 0.3s;pointer-events:none;white-space:nowrap;max-width:90vw;text-align:center;';
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; setTimeout(() => t.remove(), 350); }, 4000);
}

/* ─── Layer context menu ─── */
function _closeLayerCtxMenu() {
  if (_activeCtxMenu) { _activeCtxMenu.remove(); _activeCtxMenu = null; }
}

function _showLayerContextMenu(layerId, x, y) {
  _closeLayerCtxMenu();
  const layer = getLayer(layerId);
  if (!layer) return;

  const menu = document.createElement('div');
  menu.className = 'layer-ctx-menu';
  // Keep within viewport
  const vw = window.innerWidth, vh = window.innerHeight;
  const mw = 192, mh = 100;
  const left = Math.min(x, vw - mw - 8);
  const top  = Math.min(y, vh - mh - 8);
  menu.style.cssText = `position:fixed;left:${left}px;top:${top}px;z-index:9999`;
  menu.innerHTML = `
    <div class="layer-ctx-title">Editar capa</div>
    <label class="layer-ctx-field">
      <span class="layer-ctx-label">Nombre</span>
      <input class="layer-ctx-input" type="text" value="${layer.name}" maxlength="32" spellcheck="false"/>
    </label>
    <label class="layer-ctx-field">
      <span class="layer-ctx-label">Color</span>
      <input class="layer-ctx-color" type="color" value="${layer.color}"/>
    </label>
  `;
  document.body.appendChild(menu);
  _activeCtxMenu = menu;

  const nameInput  = menu.querySelector('.layer-ctx-input');
  const colorInput = menu.querySelector('.layer-ctx-color');

  setTimeout(() => nameInput?.select(), 10);

  nameInput?.addEventListener('change', () => setLayerName(layerId, nameInput.value));
  nameInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { setLayerName(layerId, nameInput.value); _closeLayerCtxMenu(); }
    if (e.key === 'Escape') _closeLayerCtxMenu();
    e.stopPropagation();
  });
  colorInput?.addEventListener('input', () => setLayerColor(layerId, colorInput.value));

  setTimeout(() => {
    function onDown(e) { if (!menu.contains(e.target)) { _closeLayerCtxMenu(); document.removeEventListener('mousedown', onDown); } }
    function onKey(e) { if (e.key === 'Escape') { _closeLayerCtxMenu(); document.removeEventListener('keydown', onKey); } }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
  }, 0);
}

/* ─── Spawn hook: apply layer visibility after item creation ─── */
async function applyLayerStateToItem(item) {
  await bindSceneManager();
  const layer = getItemLayer(item);
  if (layer && !layer.visible) {
    const group = _sceneManager?.meshes?.get(item.id);
    if (group) group.visible = false;
  }
}

/* ─── Panel HTML ─── */
function buildLayerPanelHTML() {
  return `
    <div class="layer-panel-header">
      <span class="layer-panel-title">Capas</span>
    </div>
    <div class="layer-list">
      ${layers.map(layer => `
        <div class="layer-item ${layer.id === activeLayerId ? 'active' : ''}" data-layer-id="${layer.id}">
          <button class="layer-vis-btn" data-action="toggle-vis" data-layer-id="${layer.id}"
            title="${layer.visible ? 'Ocultar capa' : 'Mostrar capa'}" aria-label="${layer.visible ? 'Ocultar' : 'Mostrar'}">
            <i data-lucide="${layer.visible ? 'eye' : 'eye-off'}" class="w-3.5 h-3.5"></i>
          </button>
          <span class="layer-color-dot" style="background:${layer.color}"></span>
          <button class="layer-name-btn" data-action="set-active" data-layer-id="${layer.id}"
            title="Activar capa">${layer.name}</button>
          <button class="layer-lock-btn" data-action="toggle-lock" data-layer-id="${layer.id}"
            title="${layer.locked ? 'Desbloquear capa' : 'Bloquear capa'}" aria-label="${layer.locked ? 'Desbloquear' : 'Bloquear'}">
            <i data-lucide="${layer.locked ? 'lock' : 'unlock'}" class="w-3.5 h-3.5"></i>
          </button>
          <button class="layer-edit-btn" data-action="edit" data-layer-id="${layer.id}"
            title="Editar capa" aria-label="Editar capa">
            <i data-lucide="settings" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `).join('')}
    </div>
    <div class="layer-panel-footer">
      <button class="layer-move-btn" id="layer-move-selection" title="Mover selección a capa activa">
        <i data-lucide="move-right" class="w-3.5 h-3.5"></i>
        <span>Mover aquí</span>
      </button>
    </div>`;
}

function togglePanel() {
  const panel = document.getElementById('layer-panel');
  if (!panel) return;
  const isHidden = panel.style.display === 'none' || panel.style.display === '';
  panel.style.display = isHidden ? 'block' : 'none';
  document.getElementById('btn-layers-toggle')?.classList.toggle('is-active', isHidden);
}

function refreshLayerPanel() {
  const panel = document.getElementById('layer-panel');
  if (!panel) return;
  const wasVisible = panel.style.display !== 'none' && panel.style.display !== '';
  panel.innerHTML = buildLayerPanelHTML();
  if (!wasVisible) panel.style.display = 'none';
  if (window.lucide) lucide.createIcons();
  panel.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const action  = el.dataset.action;
      const layerId = el.dataset.layerId;
      if (action === 'toggle-vis') {
        const layer = getLayer(layerId);
        if (layer) setLayerVisibility(layerId, !layer.visible);
      } else if (action === 'toggle-lock') {
        const layer = getLayer(layerId);
        if (layer) setLayerLocked(layerId, !layer.locked);
      } else if (action === 'set-active') {
        setActiveLayer(layerId);
      } else if (action === 'edit') {
        const itemEl = document.querySelector(`.layer-item[data-layer-id="${layerId}"]`);
        if (itemEl) {
          const rect = itemEl.getBoundingClientRect();
          _showLayerContextMenu(layerId, rect.right + 6, rect.top);
        }
      }
    });
  });

  panel.querySelectorAll('.layer-item').forEach(el => {
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      _showLayerContextMenu(el.dataset.layerId, e.clientX, e.clientY);
    });
  });

  document.getElementById('layer-move-selection')?.addEventListener('click', () => {
    moveSelectedToLayer(activeLayerId);
  });
}

function init() {
  refreshLayerPanel();
  document.getElementById('btn-layers-toggle')?.addEventListener('click', togglePanel);
  import('../scene/SelectionManager.js').then(({ SelectionManager }) => {
    SelectionManager.bindLayerManager(LayerManager);
  });
}

function reset() {
  layers = JSON.parse(JSON.stringify(DEFAULT_LAYERS));
  activeLayerId = 'material';
}

/* ─── Persistence helpers ─── */
function exportState() {
  return { layers: JSON.parse(JSON.stringify(layers)), activeLayerId };
}

function importState(state) {
  if (!state) return;
  if (Array.isArray(state.layers)) layers = state.layers;
  if (state.activeLayerId) activeLayerId = state.activeLayerId;
  refreshLayerPanel();
}

export const LayerManager = {
  init,
  reset,
  togglePanel,
  get layers()        { return layers; },
  get activeLayerId() { return activeLayerId; },
  getLayer,
  getItemLayer,
  isItemVisible,
  isItemEditable,
  setActiveLayer,
  setLayerName,
  setLayerColor,
  setLayerVisibility,
  setLayerLocked,
  moveSelectedToLayer,
  applyLayerStateToItem,
  flashLockWarning,
  showLockedLayerToast,
  refreshLayerPanel,
  exportState,
  importState
};

window.LayerManager = LayerManager;

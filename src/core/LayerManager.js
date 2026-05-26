/* ─────────────────────────────────────────────────────────
   LAYER MANAGER — Layer system: visibility, lock, assignment
   ───────────────────────────────────────────────────────── */

import { AppState } from './AppState.js';

const DEFAULT_LAYERS = [
  { id: 'principal',   name: 'Principal',   visible: true, locked: false, color: '#2563eb' },
  { id: 'carpas',      name: 'Carpas',      visible: true, locked: false, color: '#92400e' },
  { id: 'decoracion',  name: 'Decoración',  visible: true, locked: false, color: '#16a34a' },
];

let layers = JSON.parse(JSON.stringify(DEFAULT_LAYERS));
let activeLayerId = 'principal';
let _sceneManager = null;

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
  return getLayer(item.layerId || 'principal');
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
    if ((item.layerId || 'principal') === layerId) {
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

function refreshLayerPanel() {
  const panel = document.getElementById('layer-panel');
  if (!panel) return;
  panel.innerHTML = buildLayerPanelHTML();
  panel.style.display = '';
  if (window.lucide) lucide.createIcons();
  panel.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const action    = el.dataset.action;
      const layerId   = el.dataset.layerId;
      if (action === 'toggle-vis') {
        const layer = getLayer(layerId);
        if (layer) setLayerVisibility(layerId, !layer.visible);
      } else if (action === 'toggle-lock') {
        const layer = getLayer(layerId);
        if (layer) setLayerLocked(layerId, !layer.locked);
      } else if (action === 'set-active') {
        setActiveLayer(layerId);
      }
    });
  });
  document.getElementById('layer-move-selection')?.addEventListener('click', () => {
    moveSelectedToLayer(activeLayerId);
  });
}

function init() {
  refreshLayerPanel();
  // Bind SelectionManager ← LayerManager reference (breaks potential circular dep)
  import('../scene/SelectionManager.js').then(({ SelectionManager }) => {
    SelectionManager.bindLayerManager(LayerManager);
  });
}

function reset() {
  layers = JSON.parse(JSON.stringify(DEFAULT_LAYERS));
  activeLayerId = 'principal';
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
  get layers()        { return layers; },
  get activeLayerId() { return activeLayerId; },
  getLayer,
  getItemLayer,
  isItemVisible,
  isItemEditable,
  setActiveLayer,
  setLayerVisibility,
  setLayerLocked,
  moveSelectedToLayer,
  applyLayerStateToItem,
  refreshLayerPanel,
  exportState,
  importState
};

window.LayerManager = LayerManager;

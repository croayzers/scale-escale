/* ─────────────────────────────────────────────────────────
   INTERACTION MANAGER — Raycaster, drag, rotación, menú click derecho
   ───────────────────────────────────────────────────────── */

import { AppState }     from '../core/AppState.js';
import { SceneManager } from './SceneManager.js';
import { UIManager }    from '../ui/UIManager.js';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let dragging = null;
let mouseDown = false;
let mouseDownPos = null;
let mouseDownTime = 0;

// Rotación con tecla R
let rotating = null;
let rKeyDown = false;

function init() {
  const canvas = document.getElementById('scene-canvas');

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', onContextMenu);

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('click', e => {
    const ctx = document.getElementById('context-menu');
    if (ctx && !ctx.contains(e.target)) ctx.classList.remove('visible');
  });

  // Tracking del ratón para iniciar rotación al pulsar R
  document.addEventListener('mousemove', e => {
    window._lastMousePos = { x: e.clientX, y: e.clientY };
  });
}

function setPointer(e) {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

function getIntersectedItem() {
  raycaster.setFromCamera(pointer, SceneManager.activeCam);
  const meshArray = [];
  SceneManager.meshes.forEach((g) => {
    g.traverse(child => {
      if (child.isMesh && child.userData.baseColor !== undefined) {
        meshArray.push(child);
      }
    });
  });
  const intersects = raycaster.intersectObjects(meshArray, false);
  if (intersects.length === 0) return null;

  const resolveItem = (mesh) => {
    let obj = mesh;
    while (obj && (!obj.userData || obj.userData.id === undefined)) obj = obj.parent;
    return obj ? AppState.items.find(i => i.id === obj.userData.id) : null;
  };

  // Prioridad: mesa/buffet por encima de carpas (contenedor grande)
  let firstNonCarpa = null;
  let firstCarpa = null;
  for (const hit of intersects) {
    const item = resolveItem(hit.object);
    if (!item) continue;
    if (item.type !== 'carpa' && !firstNonCarpa) firstNonCarpa = item;
    if (item.type === 'carpa' && !firstCarpa) firstCarpa = item;
    if (firstNonCarpa) break;
  }
  return firstNonCarpa || firstCarpa;
}

function getDragPoint() {
  raycaster.setFromCamera(pointer, SceneManager.activeCam);
  const point = new THREE.Vector3();
  raycaster.ray.intersectPlane(SceneManager.dragPlane, point);
  return point;
}

function updateCursorReadout() {
  const p = getDragPoint();
  if (p) {
    document.getElementById('status-cursor').textContent =
      `X: ${p.x.toFixed(2)}m · Z: ${p.z.toFixed(2)}m`;
  }
}

/* ─── DOWN ─── */
function onPointerDown(e) {
  if (e.button !== 0) return;
  setPointer(e);
  mouseDown = true;
  mouseDownPos = { x: e.clientX, y: e.clientY };
  mouseDownTime = Date.now();

  // Modo calibración (deferido — PlanManager llega en Entrega 2)
  if (AppState.calibration.active && window.PlanManager) {
    const point = getDragPoint();
    if (!point) return;
    window.PlanManager.handleCalibrationClick(point);
    return;
  }

  const item = getIntersectedItem();
  if (item) {
    if (e.ctrlKey || e.metaKey) {
      AppState.duplicate(item.id);
      return;
    }
    AppState.select(item.id);
    const point = getDragPoint();
    if (point) {
      AppState.pushHistory();
      dragging = {
        id: item.id,
        offsetX: item.x - point.x,
        offsetZ: item.z - point.z
      };
      SceneManager.setControlsEnabled(false);
    }
  } else {
    AppState.deselect();
  }
}

/* ─── MOVE ─── */
function onPointerMove(e) {
  setPointer(e);
  updateCursorReadout();

  if (rotating) {
    const newRotY = rotating.startRotY + (e.clientX - rotating.anchorX) * 0.012;
    rotating.lastX = e.clientX;
    rotating.lastY = e.clientY;
    SceneManager.rotateItem(rotating.id, newRotY);
    return;
  }

  if (dragging) {
    const point = getDragPoint();
    if (!point) return;
    let newX = point.x + dragging.offsetX;
    let newZ = point.z + dragging.offsetZ;
    if (AppState.snap.enabled) {
      const s = AppState.snap.spacing;
      newX = Math.round(newX / s) * s;
      newZ = Math.round(newZ / s) * s;
    }
    SceneManager.moveItem(dragging.id, newX, newZ);
  }
}

/* ─── UP ─── */
function onPointerUp(e) {
  mouseDown = false;
  if (dragging) {
    dragging = null;
    SceneManager.setControlsEnabled(true);
    UIManager.refresh();
  }
}

/* ─── Click derecho ─── */
function onContextMenu(e) {
  e.preventDefault();
  setPointer(e);
  const item = getIntersectedItem();
  if (!item) {
    hideContextMenu();
    return;
  }
  AppState.select(item.id);
  showContextMenu(e.clientX, e.clientY, item);
}

function showContextMenu(x, y, item) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  menu.innerHTML = buildContextMenuHTML(item);
  menu.classList.add('visible');

  const w = menu.offsetWidth, h = menu.offsetHeight;
  const px = Math.min(x, window.innerWidth - w - 10);
  const py = Math.min(y, window.innerHeight - h - 10);
  menu.style.left = px + 'px';
  menu.style.top = py + 'px';

  if (window.lucide) lucide.createIcons();

  menu.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      handleContextAction(el.dataset.action, el.dataset.value, item.id);
      if (!el.dataset.keepOpen) hideContextMenu();
    });
  });
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) menu.classList.remove('visible');
}

function buildContextMenuHTML(item) {
  if (item.type === 'mesa') {
    const isPresi = item.subtype === 'presi';

    const roundControls = !isPresi ? `
        <div class="mt-2">
          <div class="ctx-label">Sillas (4–12)</div>
          <div class="flex items-center gap-2">
            <button data-action="chairs" data-value="-1" data-keep-open="1" class="icon-btn" style="width:30px;height:30px"><i data-lucide="minus" class="w-3 h-3"></i></button>
            <div class="flex-1 text-center mono text-sm">${item.chairs}</div>
            <button data-action="chairs" data-value="+1" data-keep-open="1" class="icon-btn" style="width:30px;height:30px"><i data-lucide="plus" class="w-3 h-3"></i></button>
          </div>
        </div>
        <div class="mt-3">
          <div class="ctx-label">Diámetro</div>
          <div class="pill-group">
            <div data-action="diameter" data-value="1.6" class="pill ${item.dims.diameter===1.6?'active':''}">1.6m</div>
            <div data-action="diameter" data-value="1.8" class="pill ${item.dims.diameter===1.8?'active':''}">1.8m</div>
            <div data-action="diameter" data-value="2.0" class="pill ${item.dims.diameter===2.0?'active':''}">2.0m</div>
          </div>
        </div>
    ` : '';

    const presiControls = isPresi ? `
        <div class="mt-2">
          <div class="ctx-label">Dimensiones</div>
          <div class="text-[11px] mono px-2 py-1.5" style="background:rgba(10,10,11,0.04)">2.00m × 1.20m · ${item.chairs}p</div>
        </div>
        <div class="mt-3">
          <div class="ctx-label">Sillas Extremos</div>
          <div class="space-y-1">
            <label class="flex items-center gap-2 text-[12px] cursor-pointer hover:bg-black/5 px-2 py-1.5">
              <input type="checkbox" data-action="endhead" ${item.endHead !== false ? 'checked' : ''} data-keep-open="1"/>
              <span>Cabecera (+X)</span>
            </label>
            <label class="flex items-center gap-2 text-[12px] cursor-pointer hover:bg-black/5 px-2 py-1.5">
              <input type="checkbox" data-action="endfoot" ${item.endFoot !== false ? 'checked' : ''} data-keep-open="1"/>
              <span>Pie (−X)</span>
            </label>
          </div>
        </div>
    ` : '';

    return `
      <div class="ctx-section">
        <div class="ctx-label">Mesa · ID ${item.id}</div>
        ${roundControls}
        ${presiControls}
        <div class="mt-3">
          <div class="ctx-label">Tipo</div>
          <div class="pill-group">
            <div data-action="subtype" data-value="standard" class="pill ${item.subtype==='standard'?'active':''}">Estándar</div>
            <div data-action="subtype" data-value="napoleon" class="pill ${item.subtype==='napoleon'?'active':''}">Napoleón</div>
            <div data-action="subtype" data-value="presi" class="pill ${item.subtype==='presi'?'active':''}">Presi.</div>
          </div>
        </div>
        <div class="ctx-divider"></div>
        <div data-action="duplicate" class="ctx-item"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar (+2m X)</div>
        <div data-action="delete" class="ctx-item" style="color:#b91c1c"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</div>
      </div>
    `;
  }

  if (item.type === 'buffet') {
    const categories = [
      { v: 'arroces', l: 'Arroces' }, { v: 'feria', l: 'Feria' },
      { v: 'quesos', l: 'Quesos' },   { v: 'italiano', l: 'Italiano' },
      { v: 'huevos', l: 'Huevos' },   { v: 'jamon', l: 'Jamón' },
    ];
    return `
      <div class="ctx-section">
        <div class="ctx-label">Buffet · ID ${item.id}</div>
        <div class="mt-2">
          <div class="ctx-label">Longitud</div>
          <div class="pill-group">
            <div data-action="length" data-value="1.8" class="pill ${item.dims.length===1.8?'active':''}">1.8m</div>
            <div data-action="length" data-value="3.6" class="pill ${item.dims.length===3.6?'active':''}">3.6m</div>
            <div data-action="length" data-value="5.5" class="pill ${item.dims.length===5.5?'active':''}">5.5m</div>
          </div>
        </div>
        <div class="mt-3">
          <div class="ctx-label">Categoría</div>
          <div class="grid grid-cols-2 gap-1">
            ${categories.map(c => `<div data-action="bufftype" data-value="${c.v}" class="pill ${item.subtype===c.v?'active':''}">${c.l}</div>`).join('')}
          </div>
        </div>
        <div class="ctx-divider"></div>
        <div data-action="duplicate" class="ctx-item"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar (+2m X)</div>
        <div data-action="delete" class="ctx-item" style="color:#b91c1c"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</div>
      </div>
    `;
  }

  if (item.type === 'carpa') {
    const postsOn = item.posts?.enabled !== false;
    const colsOn  = item.columns?.enabled === true;
    return `
      <div class="ctx-section">
        <div class="ctx-label" style="color:#6b4423">Carpa · ID ${item.id}</div>
        <div class="mt-2">
          <div class="ctx-label">Dimensiones rápidas</div>
          <div class="pill-group">
            <div data-action="carpa-preset" data-value="6x3" class="pill ${item.dims.length===6 && item.dims.width===3?'active':''}">6×3</div>
            <div data-action="carpa-preset" data-value="8x4" class="pill ${item.dims.length===8 && item.dims.width===4?'active':''}">8×4</div>
            <div data-action="carpa-preset" data-value="10x5" class="pill ${item.dims.length===10 && item.dims.width===5?'active':''}">10×5</div>
            <div data-action="carpa-preset" data-value="12x6" class="pill ${item.dims.length===12 && item.dims.width===6?'active':''}">12×6</div>
          </div>
        </div>
        <div class="mt-3">
          <div class="ctx-label">Estructura</div>
          <label class="flex items-center gap-2 text-[12px] cursor-pointer hover:bg-black/5 px-2 py-1.5">
            <input type="checkbox" data-action="carpa-toggle-posts" ${postsOn ? 'checked' : ''} data-keep-open="1"/>
            <span>Habilitar postes perimetrales</span>
          </label>
          <label class="flex items-center gap-2 text-[12px] cursor-pointer hover:bg-black/5 px-2 py-1.5">
            <input type="checkbox" data-action="carpa-toggle-cols" ${colsOn ? 'checked' : ''} data-keep-open="1"/>
            <span>Habilitar columnas internas</span>
          </label>
        </div>
        <div class="ctx-divider"></div>
        <div data-action="duplicate" class="ctx-item"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar (+2m X)</div>
        <div data-action="delete" class="ctx-item" style="color:#b91c1c"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</div>
      </div>
    `;
  }
}

function refreshContextMenu(id) {
  const updated = AppState.items.find(i => i.id === id);
  if (!updated) return;
  const ev = document.getElementById('context-menu');
  const rect = ev.getBoundingClientRect();
  showContextMenu(rect.left, rect.top, updated);
}

function handleContextAction(action, value, id) {
  const item = AppState.items.find(i => i.id === id);
  if (!item) return;

  switch (action) {
    case 'chairs': {
      const delta = parseInt(value, 10);
      const newCount = Math.max(4, Math.min(12, item.chairs + delta));
      AppState.update(id, { chairs: newCount });
      refreshContextMenu(id);
      break;
    }
    case 'diameter':
      AppState.update(id, { dims: { ...item.dims, diameter: parseFloat(value) } });
      break;
    case 'subtype': {
      const patch = { subtype: value };
      if (value === 'presi') {
        patch.dims = { length: 2.0, width: 1.2 };
        patch.endHead = true;
        patch.endFoot = true;
        patch.chairs = 10;
      } else if (item.subtype === 'presi') {
        patch.dims = { diameter: 1.8 };
        patch.chairs = 8;
        patch.endHead = undefined;
        patch.endFoot = undefined;
      }
      AppState.update(id, patch);
      refreshContextMenu(id);
      break;
    }
    case 'endhead': {
      const newVal = !(item.endHead !== false);
      const newCount = 8 + (newVal ? 1 : 0) + (item.endFoot !== false ? 1 : 0);
      AppState.update(id, { endHead: newVal, chairs: newCount });
      refreshContextMenu(id);
      break;
    }
    case 'endfoot': {
      const newVal = !(item.endFoot !== false);
      const newCount = 8 + (item.endHead !== false ? 1 : 0) + (newVal ? 1 : 0);
      AppState.update(id, { endFoot: newVal, chairs: newCount });
      refreshContextMenu(id);
      break;
    }
    case 'length':
      AppState.update(id, { dims: { ...item.dims, length: parseFloat(value) } });
      break;
    case 'bufftype':
      AppState.update(id, { subtype: value });
      break;
    case 'duplicate':
      AppState.duplicate(id);
      break;
    case 'delete':
      AppState.remove(id);
      break;
    case 'carpa-preset': {
      const [L, W] = value.split('x').map(parseFloat);
      AppState.update(id, { dims: { ...item.dims, length: L, width: W } });
      refreshContextMenu(id);
      break;
    }
    case 'carpa-toggle-posts': {
      const newVal = !(item.posts?.enabled !== false);
      AppState.update(id, { posts: { ...item.posts, enabled: newVal } });
      refreshContextMenu(id);
      break;
    }
    case 'carpa-toggle-cols': {
      const currentCols = item.columns || { enabled: false, rows: 1, cols: 2, diameter: 0.15 };
      const newVal = !currentCols.enabled;
      AppState.update(id, { columns: { ...currentCols, enabled: newVal } });
      refreshContextMenu(id);
      break;
    }
  }
}

function onKeyDown(e) {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    AppState.undo();
    return;
  }

  if (e.key.toLowerCase() === 'r' && !rKeyDown) {
    rKeyDown = true;
    if (AppState.selectedId !== null) {
      const item = AppState.items.find(i => i.id === AppState.selectedId);
      if (item) {
        AppState.pushHistory();
        const lastMouse = window._lastMousePos || { x: window.innerWidth/2, y: window.innerHeight/2 };
        rotating = {
          id: item.id,
          anchorX: lastMouse.x,
          lastX: lastMouse.x,
          lastY: lastMouse.y,
          startRotY: item.rotY || 0
        };
        SceneManager.setControlsEnabled(false);
        document.getElementById('status-mode').textContent = AppState.camera === 'iso'
          ? 'ISO · ROTANDO…' : 'TOP · ROTANDO…';
      }
    }
    return;
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selectedId !== null) {
    AppState.remove(AppState.selectedId);
  }

  if (e.key === 'Escape') {
    AppState.deselect();
    hideContextMenu();
    window.PlanManager?.cancelCalibration?.();
  }
}

function onKeyUp(e) {
  if (e.key.toLowerCase() === 'r') {
    rKeyDown = false;
    if (rotating) {
      const item = AppState.items.find(i => i.id === rotating.id);
      if (item) {
        UIManager.refresh();
        if (AppState.selectedId === item.id) UIManager.showDetail?.(item);
      }
      rotating = null;
      SceneManager.setControlsEnabled(true);
      document.getElementById('status-mode').textContent =
        AppState.camera === 'iso' ? 'ISO · 45°' : 'TOP · CENITAL';
    }
  }
}

export const InteractionManager = { init };

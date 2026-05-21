/* ─────────────────────────────────────────────────────────
   INTERACTION MANAGER — drag, rotación, menú, box-select, lock
   ───────────────────────────────────────────────────────── */

import { AppState }     from '../core/AppState.js';
import { SceneManager } from './SceneManager.js';
import { UIManager }    from '../ui/UIManager.js';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let dragging = null;          // { ids:[], offsets:{id:{x,z}} } o single legacy
let mouseDown = false;
let mouseDownPos = null;
let mouseDownTime = 0;
let boxSelecting = null;      // { startX, startY, additive }

let rKeyDown = false;
let shiftDown = false;

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
      if (child.isMesh && child.userData.baseColor !== undefined) meshArray.push(child);
    });
  });
  const intersects = raycaster.intersectObjects(meshArray, false);
  if (intersects.length === 0) return null;

  const resolveItem = (mesh) => {
    let obj = mesh;
    while (obj && (!obj.userData || obj.userData.id === undefined)) obj = obj.parent;
    return obj ? AppState.items.find(i => i.id === obj.userData.id) : null;
  };

  let firstNonCarpa = null, firstCarpa = null;
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
  if (p) document.getElementById('status-cursor').textContent =
    `X: ${p.x.toFixed(2)}m · Z: ${p.z.toFixed(2)}m`;
}

/* ─── Proyección item.x,z → pantalla (para box-select) ─── */
function itemToScreen(item) {
  const v = new THREE.Vector3(item.x, 0, item.z);
  v.project(SceneManager.activeCam);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight
  };
}

/* ─── BOX SELECT overlay ─── */
function ensureBoxOverlay() {
  let el = document.getElementById('box-select');
  if (!el) {
    el = document.createElement('div');
    el.id = 'box-select';
    el.style.cssText = 'position:fixed;border:1.5px dashed #d4ff3a;background:rgba(212,255,58,0.10);pointer-events:none;z-index:50;display:none';
    document.body.appendChild(el);
  }
  return el;
}
function updateBoxOverlay(x1, y1, x2, y2) {
  const el = ensureBoxOverlay();
  const x = Math.min(x1, x2), y = Math.min(y1, y2);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.width = Math.abs(x2 - x1) + 'px';
  el.style.height = Math.abs(y2 - y1) + 'px';
  el.style.display = 'block';
}
function hideBoxOverlay() {
  const el = document.getElementById('box-select');
  if (el) el.style.display = 'none';
}

function onPointerDown(e) {
  if (e.button !== 0) return;
  setPointer(e);
  mouseDown = true;
  mouseDownPos = { x: e.clientX, y: e.clientY };
  mouseDownTime = Date.now();

  if (AppState.calibration.active && window.PlanManager) {
    const point = getDragPoint();
    if (point) window.PlanManager.handleCalibrationClick(point);
    return;
  }

// Modo mover plano
  if (SceneManager.isPlanMoving()) {
    const point = getDragPoint();
    if (point) SceneManager.startPlanMove(point);
    return;
  }

  const item = getIntersectedItem();

  // Click en vacío + Shift → empezar box-select
  if (!item && shiftDown) {
    boxSelecting = { startX: e.clientX, startY: e.clientY, additive: true };
    return;
  }

  if (item) {
    if (item.locked) {
      // seleccionable pero no movible/duplicable
      AppState.select(item.id, shiftDown);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !shiftDown) {
      AppState.duplicate(item.id);
      return;
    }
    AppState.select(item.id, shiftDown);

    const point = getDragPoint();
    if (point && AppState.selectedIds.size > 0) {
      AppState.pushHistory();
      const ids = [...AppState.selectedIds].filter(id => {
        const it = AppState.items.find(x => x.id === id);
        return it && !it.locked;
      });
      const offsets = {};
      ids.forEach(id => {
        const it = AppState.items.find(x => x.id === id);
        offsets[id] = { x: it.x - point.x, z: it.z - point.z };
      });
      dragging = { ids, offsets };
      SceneManager.setControlsEnabled(false);
    }
  } else {
    AppState.deselect();
  }
}

function onPointerMove(e) {
  setPointer(e);
  updateCursorReadout();

  if (SceneManager.isPlanMoving()) {
    const point = getDragPoint();
    if (point) SceneManager.updatePlanMove(point);
    return;
  }

  if (boxSelecting) {
    updateBoxOverlay(boxSelecting.startX, boxSelecting.startY, e.clientX, e.clientY);
    return;
  }

  if (dragging) {
    const point = getDragPoint();
    if (!point) return;
    dragging.ids.forEach(id => {
      const off = dragging.offsets[id];
      let nx = point.x + off.x, nz = point.z + off.z;
      if (AppState.snap.enabled) {
        const s = AppState.snap.spacing;
        nx = Math.round(nx / s) * s;
        nz = Math.round(nz / s) * s;
      }
      SceneManager.moveItem(id, nx, nz);
    });
  }
}

function onPointerUp(e) {
  mouseDown = false;
  if (SceneManager.isPlanMoving()) {
    SceneManager.endPlanMove();
    return;
  }

  if (boxSelecting) {
    const x1 = Math.min(boxSelecting.startX, e.clientX);
    const x2 = Math.max(boxSelecting.startX, e.clientX);
    const y1 = Math.min(boxSelecting.startY, e.clientY);
    const y2 = Math.max(boxSelecting.startY, e.clientY);
    if (x2 - x1 > 4 && y2 - y1 > 4) {
      const hits = [];
      AppState.items.forEach(it => {
        const p = itemToScreen(it);
        if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) hits.push(it.id);
      });
      if (hits.length) AppState.selectMany(hits, boxSelecting.additive);
    }
    boxSelecting = null;
    hideBoxOverlay();
    return;
  }

  if (dragging) {
    dragging = null;
    SceneManager.setControlsEnabled(true);
    UIManager.refresh();
  }
}

function onContextMenu(e) {
  e.preventDefault();
  setPointer(e);
  const item = getIntersectedItem();
  if (!item) { hideContextMenu(); return; }
  if (AppState.selectedIds.size <= 1) AppState.select(item.id);
  showContextMenu(e.clientX, e.clientY, item);
}

function showContextMenu(x, y, item) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  menu.innerHTML = buildContextMenuHTML(item);
  menu.classList.add('visible');
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.min(x, window.innerWidth - w - 10) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - h - 10) + 'px';
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
  const lockItem = `
    <div data-action="togglelock" class="ctx-item">
      <i data-lucide="${item.locked ? 'lock' : 'unlock'}" class="w-3.5 h-3.5"></i>
      ${item.locked ? 'Desbloquear' : 'Bloquear'}
    </div>
  `;

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
        </div>` : '';
    const presiControls = isPresi ? `
        <div class="mt-2">
          <div class="ctx-label">Dimensiones</div>
          <div class="grid grid-cols-2 gap-1 mb-2">
            <div data-action="presi-preset" data-value="2.0x1.2" class="pill ${item.dims.length===2.0&&item.dims.width===1.2?'active':''}">2.0×1.2</div>
            <div data-action="presi-preset" data-value="2.5x1.2" class="pill ${item.dims.length===2.5&&item.dims.width===1.2?'active':''}">2.5×1.2</div>
            <div data-action="presi-preset" data-value="3.0x1.5" class="pill ${item.dims.length===3.0&&item.dims.width===1.5?'active':''}">3.0×1.5</div>
            <div data-action="presi-preset" data-value="4.0x1.5" class="pill ${item.dims.length===4.0&&item.dims.width===1.5?'active':''}">4.0×1.5</div>
          </div>
          <div class="text-[10.5px] mono px-2 py-1.5" style="background:rgba(10,10,11,0.04)">${item.dims.length.toFixed(2)}m × ${item.dims.width.toFixed(2)}m · ${item.chairs}p</div>
        </div>
        <div class="mt-3">
          <div class="ctx-label">Sillas extremos</div>
          <label class="flex items-center gap-2 text-[12px] cursor-pointer hover:bg-black/5 px-2 py-1.5">
            <input type="checkbox" data-action="endhead" ${item.endHead !== false ? 'checked' : ''} data-keep-open="1"/>
            <span>Cabecera (+X)</span>
          </label>
          <label class="flex items-center gap-2 text-[12px] cursor-pointer hover:bg-black/5 px-2 py-1.5">
            <input type="checkbox" data-action="endfoot" ${item.endFoot !== false ? 'checked' : ''} data-keep-open="1"/>
            <span>Pie (−X)</span>
          </label>
        </div>` : '';

    return `
      <div class="ctx-section">
        <div class="ctx-label">Mesa · ID ${item.id}${item.locked ? ' · 🔒' : ''}</div>
        ${roundControls}${presiControls}
        <div class="mt-3">
          <div class="ctx-label">Tipo</div>
          <div class="pill-group">
            <div data-action="subtype" data-value="standard" class="pill ${item.subtype==='standard'?'active':''}">Estándar</div>
            <div data-action="subtype" data-value="napoleon" class="pill ${item.subtype==='napoleon'?'active':''}">Napoleón</div>
            <div data-action="subtype" data-value="presi" class="pill ${item.subtype==='presi'?'active':''}">Presi.</div>
          </div>
        </div>
        <div class="ctx-divider"></div>
        ${lockItem}
        <div data-action="duplicate" class="ctx-item"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</div>
        <div data-action="delete" class="ctx-item" style="color:#b91c1c"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</div>
      </div>`;
  }

  if (item.type === 'buffet') {
    const cats = [
      ['arroces','Arroces'],['feria','Feria'],['quesos','Quesos'],
      ['italiano','Italiano'],['huevos','Huevos'],['jamon','Jamón']
    ];
    return `
      <div class="ctx-section">
        <div class="ctx-label">Buffet · ID ${item.id}${item.locked ? ' · 🔒' : ''}</div>
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
            ${cats.map(([v,l]) => `<div data-action="bufftype" data-value="${v}" class="pill ${item.subtype===v?'active':''}">${l}</div>`).join('')}
          </div>
        </div>
        <div class="ctx-divider"></div>
        ${lockItem}
        <div data-action="duplicate" class="ctx-item"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</div>
        <div data-action="delete" class="ctx-item" style="color:#b91c1c"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</div>
      </div>`;
  }

  if (item.type === 'carpa') {
    const postsOn = item.posts?.enabled !== false;
    const colsOn  = item.columns?.enabled === true;
    return `
      <div class="ctx-section">
        <div class="ctx-label" style="color:#6b4423">Carpa · ID ${item.id}${item.locked ? ' · 🔒' : ''}</div>
        <div class="mt-2">
          <div class="ctx-label">Dimensiones</div>
          <div class="pill-group">
            <div data-action="carpa-preset" data-value="6x3" class="pill ${item.dims.length===6&&item.dims.width===3?'active':''}">6×3</div>
            <div data-action="carpa-preset" data-value="8x4" class="pill ${item.dims.length===8&&item.dims.width===4?'active':''}">8×4</div>
            <div data-action="carpa-preset" data-value="10x5" class="pill ${item.dims.length===10&&item.dims.width===5?'active':''}">10×5</div>
            <div data-action="carpa-preset" data-value="12x6" class="pill ${item.dims.length===12&&item.dims.width===6?'active':''}">12×6</div>
          </div>
        </div>
        <div class="mt-3">
          <label class="flex items-center gap-2 text-[12px] cursor-pointer hover:bg-black/5 px-2 py-1.5">
            <input type="checkbox" data-action="carpa-toggle-posts" ${postsOn?'checked':''} data-keep-open="1"/>
            <span>Postes perimetrales</span>
          </label>
          <label class="flex items-center gap-2 text-[12px] cursor-pointer hover:bg-black/5 px-2 py-1.5">
            <input type="checkbox" data-action="carpa-toggle-cols" ${colsOn?'checked':''} data-keep-open="1"/>
            <span>Columnas internas</span>
          </label>
        </div>
        <div class="ctx-divider"></div>
        ${lockItem}
        <div data-action="duplicate" class="ctx-item"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</div>
        <div data-action="delete" class="ctx-item" style="color:#b91c1c"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</div>
      </div>`;
  }

  const titleMap = {
    arbusto:    { label: 'Arbusto',         color: '#3e7a3a' },
    arbol:      { label: 'Árbol',           color: '#2f6a3f' },
    cableLuces: { label: 'Cable con Luces', color: '#c89000' },
    room:       { label: '4 Paredes',       color: 'var(--ink)' },
  };
  const meta = titleMap[item.type];
  if (meta) {
    return `
      <div class="ctx-section">
        <div class="ctx-label" style="color:${meta.color}">${meta.label} · ID ${item.id}${item.locked ? ' · 🔒' : ''}</div>
        <div class="text-[10.5px] px-2 py-1.5 mt-2 mb-1" style="color:var(--muted);background:rgba(10,10,11,0.04)">Editable en panel derecho</div>
        <div class="ctx-divider"></div>
        ${lockItem}
        <div data-action="duplicate" class="ctx-item"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</div>
        <div data-action="delete" class="ctx-item" style="color:#b91c1c"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</div>
      </div>`;
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
    case 'togglelock':
      AppState.toggleLock(id);
      refreshContextMenu(id);
      break;
    case 'chairs': {
      const delta = parseInt(value, 10);
      AppState.update(id, { chairs: Math.max(4, Math.min(12, item.chairs + delta)) });
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
        patch.endHead = true; patch.endFoot = true; patch.chairs = 10;
      } else if (item.subtype === 'presi') {
        patch.dims = { diameter: 1.8 }; patch.chairs = 8;
        patch.endHead = undefined; patch.endFoot = undefined;
      }
      AppState.update(id, patch);
      refreshContextMenu(id);
      break;
    }
    case 'presi-preset': {
      const [L, W] = value.split('x').map(parseFloat);
      AppState.update(id, { dims: { length: L, width: W } });
      refreshContextMenu(id);
      break;
    }
    case 'endhead': {
      const newVal = !(item.endHead !== false);
      const newCount = 8 + (newVal?1:0) + (item.endFoot!==false?1:0);
      AppState.update(id, { endHead: newVal, chairs: newCount });
      refreshContextMenu(id);
      break;
    }
    case 'endfoot': {
      const newVal = !(item.endFoot !== false);
      const newCount = 8 + (item.endHead!==false?1:0) + (newVal?1:0);
      AppState.update(id, { endFoot: newVal, chairs: newCount });
      refreshContextMenu(id);
      break;
    }
    case 'length': AppState.update(id, { dims: { ...item.dims, length: parseFloat(value) } }); break;
    case 'bufftype': AppState.update(id, { subtype: value }); break;
    case 'duplicate': AppState.duplicate(id); break;
    case 'delete': AppState.remove(id); break;
    case 'carpa-preset': {
      const [L, W] = value.split('x').map(parseFloat);
      AppState.update(id, { dims: { ...item.dims, length: L, width: W } });
      refreshContextMenu(id);
      break;
    }
    case 'carpa-toggle-posts': {
      AppState.update(id, { posts: { ...item.posts, enabled: !(item.posts?.enabled !== false) } });
      refreshContextMenu(id);
      break;
    }
    case 'carpa-toggle-cols': {
      const cur = item.columns || { enabled:false, rows:1, cols:2, diameter:0.15 };
      AppState.update(id, { columns: { ...cur, enabled: !cur.enabled } });
      refreshContextMenu(id);
      break;
    }
  }
}

function onKeyDown(e) {
  if (e.key === 'Shift') shiftDown = true;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); AppState.undo(); return; }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    AppState.selectMany(AppState.items.map(i => i.id));
    return;
  }

  if (e.key.toLowerCase() === 'r' && !rKeyDown) {
    rKeyDown = true;
    rotateSelectionStep();
    return;
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selectedIds.size > 0) {
    [...AppState.selectedIds].forEach(id => {
      const it = AppState.items.find(i => i.id === id);
      if (it && !it.locked) AppState.remove(id);
    });
  }

  if (e.key === 'Escape') {
    AppState.deselect();
    hideContextMenu();
    window.PlanManager?.cancelCalibration?.();
  }
}

function onKeyUp(e) {
  if (e.key === 'Shift') shiftDown = false;
  if (e.key.toLowerCase() === 'r') {
    rKeyDown = false;
  }
}

function rotateSelectionStep() {
  if (AppState.selectedIds.size === 0) return;

  const ids = [...AppState.selectedIds].filter(id => {
    const item = AppState.items.find(entry => entry.id === id);
    return item && !item.locked;
  });

  if (!ids.length) return;

  const step = Math.PI / 12;
  AppState.pushHistory();

  ids.forEach(id => {
    const item = AppState.items.find(entry => entry.id === id);
    if (!item) return;
    const nextRot = (item.rotY || 0) + step;
    SceneManager.rotateItem(id, nextRot);
  });

  UIManager.refresh();
  if (AppState.selectedIds.size === 1 && AppState.selectedId !== null) {
    const item = AppState.items.find(entry => entry.id === AppState.selectedId);
    if (item) UIManager.showDetail?.(item);
  }
}

export const InteractionManager = { init };

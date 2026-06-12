/* ─────────────────────────────────────────────────────────
   INTERACTION MANAGER — drag, rotación, menú, box-select, lock
   ───────────────────────────────────────────────────────── */

import { AppState }          from '../core/AppState.js';
import { SceneManager }      from './SceneManager.js';
import { UIManager }         from '../ui/UIManager.js';
import { CatalogModal }      from '../ui/CatalogModal.js';
import { ZoneManager }       from '../ui/ZoneManager.js';
import { SelectionManager }  from './SelectionManager.js';
import { GroupManager }      from '../core/GroupManager.js';
import { CollabManager }     from '../services/CollabManager.js';
import { SavedGroupPlacer }  from '../core/SavedGroupPlacer.js';
import { SavedGroupLibrary } from '../core/SavedGroupLibrary.js';
import { MeasureManager }    from '../ui/MeasureManager.js';
import { PredictiveArray }  from '../ui/PredictiveArray.js';
import { ContextSpawnMenu } from '../ui/ContextSpawnMenu.js';

function isViewer() { return CollabManager.localRole === 'viewer'; }

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let dragging = null;          // { ids:[], offsets:{id:{x,z}} } o single legacy
let mouseDown = false;
let mouseDownPos = null;
let pendingClickItem = null;
let mouseDownTime = 0;
let boxSelecting = null;      // { startX, startY, additive }

let rKeyDown = false;
let bKeyDown = false;
let shiftDown = false;
let altDown = false;
const wasdKeys = { w: false, a: false, s: false, d: false };
let placementIndicator = null;
let copiedItemTemplate = null;
let copiedGroupTemplates = null; // multi-selección: array con posiciones relativas
let placementPreviewVisible = false;
let groupPlacementPreviewVisible = false;
let formatModeActive = false;
let _ctxAdvancedOpen = false;

const _activePointers = new Set();
let _longPressTimer = null;

function init() {
  const canvas = document.getElementById('scene-canvas');
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('dblclick', () => {
    if (ZoneManager.isPlacementActive()) ZoneManager.handleCanvasDoubleClick();
  });

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  // Cerrar en pointerdown (al pulsar), no en click: así arrastrar para seleccionar
  // texto dentro de un input y soltar fuera del menú no lo cierra. Solo cierra si
  // la pulsación empieza fuera del menú.
  document.addEventListener('pointerdown', e => {
    const ctx = document.getElementById('context-menu');
    if (ctx && ctx.classList.contains('visible') && !ctx.contains(e.target)) {
      ctx.classList.remove('visible');
    }
  });
  document.getElementById('context-menu')?.addEventListener('click', e => {
    e.stopPropagation();
  });
  document.addEventListener('mousemove', e => {
    window._lastMousePos = { x: e.clientX, y: e.clientY };
    setPointer(e);
    if (CatalogModal.hasPendingPlacement()) {
      updatePlacementIndicator(e.clientX, e.clientY);
      syncPlacementPreview(e.clientX, e.clientY);
    }
    if (SavedGroupPlacer.hasPendingGroupPlacement()) {
      updatePlacementIndicator(e.clientX, e.clientY);
      syncGroupPlacementPreview(e.clientX, e.clientY);
    }
    // Hover: detectar item bajo cursor cuando no hay drag ni placement activo
    if (!dragging && !boxSelecting
        && !CatalogModal.hasPendingPlacement()
        && !SavedGroupPlacer.hasPendingGroupPlacement()
        && !ZoneManager.isPlacementActive()) {
      const hovered = getIntersectedItem();
      SceneManager.setHoveredItem(hovered?.id ?? null);
    } else {
      SceneManager.setHoveredItem(null);
    }
  });
  document.getElementById('scene-canvas')?.addEventListener('mouseleave', () => {
    SceneManager.setHoveredItem(null);
  });
  document.addEventListener('pointerdown', onPlacementDocumentPointerDown, true);
  document.addEventListener('escale:catalog-placement-start', onPlacementStart);
  document.addEventListener('escale:catalog-placement-end', onPlacementEnd);
  document.addEventListener('escale:group-placement-start', onPlacementStart);
  document.addEventListener('escale:group-placement-end', onPlacementEnd);
  document.addEventListener('escale:item-settings-menu', event => {
    const item = AppState.items.find(entry => entry.id === Number(event.detail?.itemId));
    if (!item) return;
    if (!AppState.selectedIds.has(item.id) || AppState.selectedIds.size !== 1) {
      AppState.select(item.id);
    }
    showContextMenu(event.detail?.x || window.innerWidth / 2, event.detail?.y || window.innerHeight / 2, item);
  });
  document.addEventListener('escale:zones-ui-changed', () => {
    syncPlacementCursor();
    updateCursorReadout();
  });
  syncPlacementCursor();

  // ── WASD loop: mueve el elemento seleccionado en 2D, o desplaza la cámara ─────
  (function tickWASD() {
    requestAnimationFrame(tickWASD);
    if (!wasdKeys.w && !wasdKeys.a && !wasdKeys.s && !wasdKeys.d) return;
    const activeTag = document.activeElement?.tagName;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(activeTag) || document.activeElement?.isContentEditable) return;
    const controls = SceneManager.activeControls;
    const cam = SceneManager.activeCam;
    if (!controls || !cam) return;
    const fwd = (wasdKeys.w ? 1 : 0) - (wasdKeys.s ? 1 : 0);
    const str = (wasdKeys.d ? 1 : 0) - (wasdKeys.a ? 1 : 0);

    // En vista 2D con elementos seleccionados (no bloqueados) → WASD mueve los items.
    if (AppState.camera === 'top' && AppState.selectedIds.size > 0 && !isViewer()) {
      const ids = [...AppState.selectedIds].filter(id => {
        const it = AppState.items.find(x => x.id === id);
        return it && !it.locked && it.type !== 'zone';
      });
      if (ids.length) {
        const step = 0.02 / Math.max(0.3, cam.zoom ?? 1);
        const dxItem = str * step;
        const dzItem = -fwd * step;
        ids.forEach(id => {
          const it = AppState.items.find(x => x.id === id);
          if (it) SceneManager.moveItem(id, it.x + dxItem, it.z + dzItem);
        });
        return;
      }
    }

    let delta;
    if (AppState.camera === 'top') {
      const speed = 0.05 / Math.max(0.3, cam.zoom ?? 1);
      delta = new THREE.Vector3(str * speed, 0, -fwd * speed);
    } else {
      const toTarget = new THREE.Vector3().subVectors(controls.target, cam.position);
      toTarget.y = 0;
      if (toTarget.lengthSq() < 0.0001) return;
      const dist = cam.position.distanceTo(controls.target);
      const speed = Math.max(0.015, dist * 0.005);
      toTarget.normalize();
      const right = new THREE.Vector3().crossVectors(toTarget, new THREE.Vector3(0, 1, 0)).normalize();
      delta = new THREE.Vector3()
        .addScaledVector(toTarget, fwd * speed)
        .addScaledVector(right, str * speed);
    }
    controls.target.add(delta);
    cam.position.add(delta);
  })();

  // ── Protección contra cierre/recarga accidental cuando hay items en el plano ──
  window.addEventListener('beforeunload', e => {
    if (AppState.items.length > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
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
      if (!child.isMesh) return;
      if (child.userData.isTopStroke || child.userData.isPlacementPreview) return;
      // Incluir cualquier mesh que pertenezca a un item (rootId asignado por ensureInteractiveGroup)
      if (child.userData.rootId !== undefined || child.userData.isMain === true || child.userData.baseColor !== undefined) {
        meshArray.push(child);
      }
    });
  });
  const intersects = raycaster.intersectObjects(meshArray, false);
  if (intersects.length === 0) return null;

  const resolveItem = (mesh) => {
    let obj = mesh;
    while (obj && (!obj.userData || (obj.userData.id === undefined && obj.userData.rootId === undefined))) obj = obj.parent;
    const resolvedId = obj?.userData?.id ?? obj?.userData?.rootId;
    return resolvedId !== undefined ? AppState.items.find(i => i.id === resolvedId) : null;
  };

  let firstNonCarpa = null, firstCarpa = null;
  for (const hit of intersects) {
    const item = resolveItem(hit.object);
    // Las zonas deshabilitadas siguen siendo seleccionables (para abrir su menú de
    // modificación); no se mueven porque están bloqueadas. El resto de items
    // deshabilitados sí se ignoran.
    if (!item || (item.disabled && item.type !== 'zone')) continue;
    if (!String(item.type || '').startsWith('carpa') && !firstNonCarpa) firstNonCarpa = item;
    if (String(item.type || '').startsWith('carpa') && !firstCarpa) firstCarpa = item;
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

function _pointInZonePoly(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, zi = points[i].z, xj = points[j].x, zj = points[j].z;
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

function getSnapConfigForPoint(x, z) {
  const zones = AppState.items.filter(item => item.type === 'zone');
  for (const zone of zones) {
    const cfg = zone.gridConfig;
    if (!cfg || cfg.enabled === false || cfg.snapEnabled === false) continue;
    const step = Math.max(0.05, cfg.majorSize || 0.25);
    // Zona poligonal: snap si el punto cae dentro del polígono.
    if (Array.isArray(zone.points) && zone.points.length >= 3) {
      if (_pointInZonePoly(x, z, zone.points)) {
        return { stepX: step, stepZ: step, originX: 0, originZ: 0 };
      }
      continue;
    }
    const L = zone.dims?.length || 4;
    const W = zone.dims?.width || 4;
    const halfL = L / 2;
    const halfW = W / 2;
    if (Math.abs(x - zone.x) <= halfL && Math.abs(z - zone.z) <= halfW) {
      return {
        stepX: step,
        stepZ: step,
        originX: zone.x - halfL,
        originZ: zone.z - halfW
      };
    }
  }
  const spacing = AppState.grid?.subSize ?? AppState.snap.spacing;
  return {
    stepX: spacing,
    stepZ: spacing,
    originX: AppState.grid?.offsetX ?? 0,
    originZ: AppState.grid?.offsetZ ?? 0
  };
}

function applySnap(point) {
  if (!point) return null;
  const next = point.clone();
  if (AppState.snap.enabled && !altDown) {
    const { stepX, stepZ, originX, originZ } = getSnapConfigForPoint(next.x, next.z);
    next.x = originX + Math.round((next.x - originX) / stepX) * stepX;
    next.z = originZ + Math.round((next.z - originZ) / stepZ) * stepZ;
  }
  return next;
}

function resolvePlacementPoint(clientX, clientY) {
  const placement = SceneManager.screenToPlacement(clientX, clientY);
  if (!placement) return null;
  if (!placement.stacked) {
    const snapped = applySnap(new THREE.Vector3(placement.x, placement.y || 0, placement.z));
    if (!snapped) return null;
    placement.x = snapped.x;
    placement.z = snapped.z;
  }
  return placement;
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
    el.style.cssText = 'position:fixed;border:1.5px solid rgba(59,130,246,0.7);background:rgba(59,130,246,0.08);border-radius:3px;pointer-events:none;z-index:50;display:none';
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

function syncPlacementCursor() {
  const canvas = document.getElementById('scene-canvas');
  const active = CatalogModal.hasPendingPlacement() || ZoneManager.isPlacementActive() || SavedGroupPlacer.hasPendingGroupPlacement();
  document.body.classList.toggle('placement-pending', active);
  if (canvas) {
    canvas.style.cursor = CatalogModal.hasPendingPlacement() || SavedGroupPlacer.hasPendingGroupPlacement()
      ? 'copy'
      : ZoneManager.isPlacementActive()
        ? 'crosshair'
        : '';
  }
}

function onPlacementStart(event) {
  const label = event.detail?.label || event.detail?.definition?.name || 'Elemento seleccionado';
  if (!label) return;
  placementPreviewVisible = false;
  syncPlacementCursor();
  const indicator = ensurePlacementIndicator();
  indicator.classList.remove('hidden');
  document.getElementById('placement-indicator-title').textContent = label;
  document.getElementById('placement-indicator-hint').textContent = event.detail?.sticky
    ? 'Haz click para clonar · Esc o clic derecho cancelan'
    : 'Haz click en el destino · Esc cancela';
  const mousePos = window._lastMousePos || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  updatePlacementIndicator(mousePos.x, mousePos.y);
  syncPlacementPreview(mousePos.x, mousePos.y);
  updateCursorReadout();
}

function onPlacementEnd() {
  placementPreviewVisible = false;
  groupPlacementPreviewVisible = false;
  SceneManager.clearPlacementPreview();
  SceneManager.clearMultiPlacementPreview();
  syncPlacementCursor();
  hidePlacementIndicator();
  updateCursorReadout();
}


function ensurePlacementIndicator() {
  if (placementIndicator) return placementIndicator;
  placementIndicator = document.createElement('div');
  placementIndicator.id = 'placement-indicator';
  placementIndicator.className = 'placement-indicator hidden';
  placementIndicator.innerHTML = `
    <span class="placement-indicator-box" aria-hidden="true"></span>
    <div class="placement-indicator-copy">
      <strong id="placement-indicator-title">Elemento seleccionado</strong>
      <small id="placement-indicator-hint">Haz click en el destino · Esc cancela</small>
    </div>
  `;
  document.body.appendChild(placementIndicator);
  return placementIndicator;
}

function hidePlacementIndicator() {
  if (!placementIndicator) return;
  placementIndicator.classList.add('hidden');
}

function updatePlacementIndicator(clientX, clientY) {
  const indicator = ensurePlacementIndicator();
  indicator.classList.remove('hidden');
  indicator.style.left = `${clientX + 18}px`;
  indicator.style.top = `${clientY + 18}px`;
}

function syncPlacementPreview(clientX, clientY) {
  const placement = resolvePlacementPoint(clientX, clientY);
  if (!placement) return;

  if (!placementPreviewVisible) {
    const previewItem = CatalogModal.createPendingItem({
      x: placement.x,
      y: placement.y,
      z: placement.z
    });
    if (!previewItem) return;
    SceneManager.setPlacementPreview(previewItem);
    placementPreviewVisible = true;
    return;
  }

  SceneManager.updatePlacementPreview(placement.x, placement.z, placement.y);
}

function syncGroupPlacementPreview(clientX, clientY) {
  const placement = resolvePlacementPoint(clientX, clientY);
  if (!placement) return;
  const def = SavedGroupPlacer.getPendingGroupPlacement();
  if (!def?.itemTemplates?.length) return;

  if (!groupPlacementPreviewVisible) {
    SceneManager.setMultiPlacementPreview(def.itemTemplates, placement.x, placement.z);
    groupPlacementPreviewVisible = true;
    return;
  }
  SceneManager.updateMultiPlacementPreview(placement.x, placement.z);
}

function isUiClickTarget(target) {
  return Boolean(target?.closest?.(
    '#catalog-modal, #dock, #header-mac, #inventory-panel, #context-menu, ' +
    '#company-modal, #welcome-modal, #settings-modal, #export-modal, #share-modal, #plans-modal, #detail-panel, ' +
    '#export-preview-modal, #share-preview-modal, #saved-group-panel, #sg-card-menu, .modal-bg, button, input, select, textarea, label'
  ));
}

function placePendingItemAt(clientX, clientY) {
  const point = resolvePlacementPoint(clientX, clientY);
  if (!point) return false;
  const item = CatalogModal.createPendingItem({ x: point.x, y: point.y, z: point.z });
  if (!item) return false;

  const placed = AppState.add(item);
  if (!CatalogModal.shouldKeepPlacementActive()) CatalogModal.clearPendingPlacement();
  AppState.select(placed.id);
  document.body.classList.add('has-items');
  return true;
}

function copySelectedItem() {
  // Multi-selección: copiar conjunto con posiciones relativas al centroide
  if (AppState.selectedIds.size > 1) {
    const items = [...AppState.selectedIds]
      .map(id => AppState.items.find(i => i.id === id))
      .filter(i => i && i.type !== 'zone'); // las zonas no se duplican
    const cx = items.reduce((s, i) => s + i.x, 0) / items.length;
    const cz = items.reduce((s, i) => s + i.z, 0) / items.length;
    copiedGroupTemplates = items.map(item => {
      const clone = JSON.parse(JSON.stringify(item));
      delete clone.id;
      delete clone._mesh;
      delete clone._group;
      clone.locked = false;
      clone._relX = item.x - cx;
      clone._relZ = item.z - cz;
      return clone;
    });
    copiedItemTemplate = null;
    return true;
  }
  // Un solo item
  copiedGroupTemplates = null;
  if (AppState.selectedId === null) return false;
  const item = AppState.items.find(entry => entry.id === AppState.selectedId);
  if (!item) return false;
  copiedItemTemplate = JSON.parse(JSON.stringify(item));
  delete copiedItemTemplate.id;
  copiedItemTemplate.locked = false;
  return true;
}

function activateCopiedPlacement() {
  // Multi-selección: usar SavedGroupPlacer para colocar el conjunto
  if (copiedGroupTemplates) {
    SavedGroupPlacer.activatePlacement({
      id: 'clipboard',
      name: `${copiedGroupTemplates.length} elementos copiados`,
      itemTemplates: copiedGroupTemplates,
    });
    return true;
  }
  // Un solo item
  if (!copiedItemTemplate) return false;
  CatalogModal.setPendingItemTemplate(copiedItemTemplate, {
    source: 'clipboard',
    sticky: true,
    label: copiedItemTemplate.catalogName || copiedItemTemplate.labelText || copiedItemTemplate.type || 'Copia'
  });
  return true;
}

function onPlacementDocumentPointerDown(e) {
  // Grupo guardado pendiente de colocación
  if (SavedGroupPlacer.hasPendingGroupPlacement()) {
    if (e.button !== 0 || isUiClickTarget(e.target)) return;
    const point = resolvePlacementPoint(e.clientX, e.clientY);
    if (point) {
      SavedGroupPlacer.placeGroupAt({ x: point.x, z: point.z });
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  if (!CatalogModal.hasPendingPlacement()) return;
  if (e.button !== 0) return;
  if (isUiClickTarget(e.target)) return;
  if (placePendingItemAt(e.clientX, e.clientY)) {
    e.preventDefault();
    e.stopPropagation();
  }
}

function updateCursorReadout() {
  const mousePos = window._lastMousePos;
  const point = mousePos
    ? (CatalogModal.hasPendingPlacement()
        ? resolvePlacementPoint(mousePos.x, mousePos.y)
        : applySnap(SceneManager.screenToGround(mousePos.x, mousePos.y)))
    : applySnap(getDragPoint());
  if (!point) return;
  const suffix = CatalogModal.hasPendingPlacement()
    ? ` · Colocar: ${CatalogModal.getPendingPlacement()?.label || CatalogModal.getPendingDefinition()?.name || 'Item'}`
    : '';
  document.getElementById('status-cursor').textContent =
    `X: ${point.x.toFixed(2)}m · Z: ${point.z.toFixed(2)}m${suffix}`;
}

function onPointerDown(e) {
  _activePointers.add(e.pointerId);
  if (_activePointers.size >= 2) { dragging = null; mouseDown = false; return; }
  if (e.button !== 0) return;
  if (e.pointerType === 'touch') {
    _longPressTimer = setTimeout(() => {
      _longPressTimer = null;
      pendingClickItem = null;
      setPointer(e);
      const item = getIntersectedItem();
      if (item) { AppState.select(item.id); showContextMenu(e.clientX, e.clientY, item); }
    }, 500);
  }
  setPointer(e);
  mouseDown = true;
  mouseDownPos = { x: e.clientX, y: e.clientY };
  mouseDownTime = Date.now();

  if (MeasureManager.isActive()) {
    const point = getDragPoint();
    if (point) MeasureManager.handleClick(point);
    return;
  }

  // Interacción con anotaciones existentes (selección / drag handle)
  if (!isViewer()) {
    const point = getDragPoint();
    if (MeasureManager.handleInteractionPointerDown(point)) {
      SceneManager.setControlsEnabled(false);
      return;
    }
    // Clic sobre fantasmas predictivos
    if (PredictiveArray.isActive() && PredictiveArray.handleInteractionPointerDown(point)) return;
  }

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

  if (ZoneManager.isPlacementActive()) {
    if (isViewer()) return;
    const point = getDragPoint();
    if (point) ZoneManager.handleCanvasPointerDown(point);
    return;
  }

  if (CatalogModal.hasPendingPlacement()) {
    if (isViewer()) return;
    syncPlacementPreview(e.clientX, e.clientY);
    placePendingItemAt(e.clientX, e.clientY);
    return;
  }

  const item = getIntersectedItem();

  // ── Herramienta formato activa: click copia formato del item ──
  if (formatModeActive && item) {
    SelectionManager.copyItemFormat(item);
    AppState.select(item.id);
    return;
  }

  // Click en vacío + Shift → empezar box-select (bloquear cámara para evitar pan en ISO)
  if (!item && shiftDown) {
    boxSelecting = { startX: e.clientX, startY: e.clientY, additive: true };
    SceneManager.setControlsEnabled(false);
    return;
  }

  if (item) {
    if (isViewer()) {
      AppState.select(item.id);
      return;
    }
    if (bKeyDown && !shiftDown) {
      AppState.select(item.id);
      AppState.toggleLock(item.id);
      return;
    }
    if (item.locked) {
      AppState.select(item.id, shiftDown);
      return;
    }
    {
      const lm = window.LayerManager;
      if (lm) {
        const itemLayer = lm.getItemLayer(item);
        if (itemLayer && itemLayer.locked) {
          AppState.select(item.id, shiftDown);
          if (!shiftDown) pendingClickItem = item;
          lm.flashLockWarning(itemLayer.id);
          lm.showLockedLayerToast(
            `Elemento bloqueado · Pertenece a la capa "${itemLayer.name}"`
          );
          return;
        }
      }
    }
    if ((e.ctrlKey || e.metaKey) && !shiftDown) {
      AppState.duplicate(item.id);
      return;
    }
    // Grupo: si el item pertenece a un grupo y Shift no está pulsado,
    // expandir la selección a todos los miembros del grupo antes del drag.
    const groupExpanded = GroupManager.handleGroupClick(item, shiftDown);
    if (!groupExpanded) {
      if (shiftDown) {
        // Shift+click: añadir o quitar de la selección
        AppState.select(item.id, true);
      } else if (!AppState.selectedIds.has(item.id)) {
        // Click en item no seleccionado: seleccionar solo este
        AppState.select(item.id, false);
      }
      // Click en item ya seleccionado (sin Shift): conservar toda la selección para drag
    }
    if (!shiftDown) pendingClickItem = item;

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
  if (_activePointers.size >= 2) return;
  if (_longPressTimer && mouseDownPos) {
    if (Math.abs(e.clientX - mouseDownPos.x) > 8 || Math.abs(e.clientY - mouseDownPos.y) > 8) {
      clearTimeout(_longPressTimer); _longPressTimer = null;
    }
  }
  setPointer(e);
  updateCursorReadout();

  if (MeasureManager.isDraggingHandle()) {
    const point = getDragPoint();
    MeasureManager.handleInteractionPointerMove(point, e);
    return;
  }

  if (MeasureManager.isActive()) {
    const point = getDragPoint();
    MeasureManager.handleMouseMove(point, e.clientX, e.clientY, e.shiftKey);
    return;
  }

  if (SceneManager.isPlanMoving()) {
    const point = getDragPoint();
    if (point) SceneManager.updatePlanMove(point);
    return;
  }

  if (ZoneManager.isPlacementActive()) {
    const point = getDragPoint();
    if (point) ZoneManager.handleCanvasPointerMove(point);
    return;
  }

  if (boxSelecting) {
    updateBoxOverlay(boxSelecting.startX, boxSelecting.startY, e.clientX, e.clientY);
    return;
  }

  if (CatalogModal.hasPendingPlacement()) {
    updatePlacementIndicator(e.clientX, e.clientY);
    syncPlacementPreview(e.clientX, e.clientY);
    return;
  }

  if (dragging && !isViewer()) {
    const point = getDragPoint();
    if (!point) return;
    dragging.ids.forEach(id => {
      const off = dragging.offsets[id];
      let nx = point.x + off.x, nz = point.z + off.z;
      if (AppState.snap.enabled && !altDown) {
        const { stepX, stepZ, originX, originZ } = getSnapConfigForPoint(nx, nz);
        nx = originX + Math.round((nx - originX) / stepX) * stepX;
        nz = originZ + Math.round((nz - originZ) / stepZ) * stepZ;
      }
      SceneManager.moveItem(id, nx, nz);
    });
  }
}

function onPointerUp(e) {
  _activePointers.delete(e.pointerId);
  clearTimeout(_longPressTimer); _longPressTimer = null;
  const wasMeasureDragging = MeasureManager.isDraggingHandle();
  MeasureManager.handleInteractionPointerUp();
  if (wasMeasureDragging) SceneManager.setControlsEnabled(true);
  if (_activePointers.size >= 1) { dragging = null; mouseDown = false; return; }
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
    SceneManager.setControlsEnabled(true);
    return;
  }

  if (dragging) {
    dragging = null;
    SceneManager.setControlsEnabled(true);
    UIManager.refresh();
  }

  if (pendingClickItem) {
    const dx = Math.abs(e.clientX - (mouseDownPos?.x ?? e.clientX));
    const dy = Math.abs(e.clientY - (mouseDownPos?.y ?? e.clientY));
    const item = pendingClickItem;
    pendingClickItem = null;
    if (dx < 5 && dy < 5 && !isViewer()) {
      // Click limpio sin drag: mostrar settings del item clickado.
      // La selección múltiple se preserva (no se estrecha).
      showContextMenu(e.clientX, e.clientY, item);
    }
  }
}

function onPointerCancel(e) {
  _activePointers.delete(e.pointerId);
  clearTimeout(_longPressTimer); _longPressTimer = null;
  if (dragging) { dragging = null; SceneManager.setControlsEnabled(true); }
  mouseDown = false;
  pendingClickItem = null;
  boxSelecting = null; hideBoxOverlay();
}

function onContextMenu(e) {
  e.preventDefault();
  clearTimeout(_longPressTimer); _longPressTimer = null;
  if (MeasureManager.isActive()) {
    MeasureManager.cancel();
    return;
  }
  if (ZoneManager.isPlacementActive()) {
    ZoneManager.cancelPlacement();
    syncPlacementCursor();
    return;
  }
  if (CatalogModal.hasPendingPlacement()) {
    CatalogModal.clearPendingPlacement();
    return;
  }
  setPointer(e);
  const item = getIntersectedItem();
  if (!item) {
    hideContextMenu();
    // Raycast al suelo Y=0 y mostrar menú de spawn rápido
    raycaster.setFromCamera(pointer, SceneManager.activeCam);
    const ground = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(SceneManager.dragPlane, ground)) {
      ContextSpawnMenu.show(e.clientX, e.clientY, ground);
    }
    return;
  }
  ContextSpawnMenu.hide();
  if (AppState.selectedIds.size <= 1) AppState.select(item.id);
  showContextMenu(e.clientX, e.clientY, item);
}

function showContextMenu(x, y, item) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;
  document.dispatchEvent(new CustomEvent('escale:scene-overlay-open', {
    detail: { kind: 'context', key: `item-${item.id}` }
  }));
  menu.innerHTML = buildContextMenuHTML(item);
  menu.classList.add('visible');
  if (!window.matchMedia('(pointer: coarse)').matches) {
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.min(x, window.innerWidth - w - 10) + 'px';
    menu.style.top  = Math.min(y, window.innerHeight - h - 10) + 'px';
  } else {
    menu.style.left = '';
    menu.style.top  = '';
  }
  if (window.lucide) lucide.createIcons();
  const advDetails = menu.querySelector('.ctx-advanced');
  if (advDetails) advDetails.addEventListener('toggle', () => { _ctxAdvancedOpen = advDetails.open; });
  menu.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      handleContextAction(el.dataset.action, el.dataset.value, item.id);
      if (!el.dataset.keepOpen) hideContextMenu();
    });
  });
  // Sync dual color inputs (swatch ↔ hex text) for all color fields
  ['color', 'roofColor', 'accentColor', 'lightColor'].forEach(fieldName => {
    const swatch = menu.querySelector(`input[type="color"][data-field="${fieldName}"]`);
    const hex = menu.querySelector(`input.ctx-color-hex[data-field="${fieldName}"]`);
    if (swatch && hex) {
      swatch.addEventListener('input', () => { hex.value = swatch.value; });
      hex.addEventListener('input', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) swatch.value = hex.value;
      });
    }
  });

  menu.querySelectorAll('[data-field]').forEach(el => {
    const saveField = () => {
      const value = el.type === 'checkbox' ? el.checked : el.value;
      handleContextField(el.dataset.field, value, item.id);
    };
    el.addEventListener('change', saveField);
    if (el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'color') el.addEventListener('input', saveField);
  });
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) menu.classList.remove('visible');
}

const TYPE_LABELS = {
  mesa: 'Mesa redonda',
  mesaRect: 'Mesa rectangular',
  mesaCocktail: 'Mesa cocktail',
  mesaImperial: 'Mesa imperial',
  mesaCurva: 'Mesa curva',
  mesaSerpentina: 'Mesa serpentina',
  sillaCatering: 'Silla',
  sillaLineal: 'Lineal de sillas',
  buffet: 'Buffet',
  carritoBuf: 'Carrito buffet',
  buffetCarro: 'Buffet carro',
  barraLibre: 'Barra libre',
  carpa: 'Carpa clasica',
  carpaCuadrada: 'Carpa cuadrada',
  carpaStar: 'Carpa star',
  carpaPabellon: 'Carpa pabellon',
  carpaTransparente: 'Carpa transparente',
  carpaBeduina: 'Carpa beduina',
  carpaSailcloth: 'Carpa sailcloth',
  carpaTipi: 'Carpa tipi',
  carpaDomo: 'Carpa domo',
  zone: 'Zona',
  poste: 'Poste',
  room: '4 Paredes',
  arbusto: 'Arbusto',
  arbol: 'Arbol',
  cableLuces: 'Cable con luces',
  ambiente: 'Ambiente',
  pergola: 'Pérgola',
  schemaProp: 'Elemento',
  schemaSurface: 'Superficie',
  ceilingProp: 'Colgante de techo',
  text2d: 'Texto'
};

const DIM_LABELS = {
  length: 'Largo',
  width: 'Ancho',
  height: 'Alto',
  diameter: 'Diametro',
  size: 'Tamano',
  depth: 'Fondo',
  seatHeight: 'Asiento',
  totalHeight: 'Alto total',
  ridgeRise: 'Cumbrera',
  peakRise: 'Pico',
  cornerHeight: 'Esquina',
  peakHeight: 'Pico',
  eaveHeight: 'Alero',
  sideDrop: 'Caida',
  modSpacing: 'Modulo',
  radioInt: 'Radio int.',
  anchoTab: 'Ancho tablero',
  anguloDeg: 'Angulo',
  alto: 'Alto',
  thickness: 'Grosor',
  crownWidth: 'Copa',
  roofHeight: 'Grosor techo',
  modSpacing: 'Módulo postes',
  floorHeight: 'Altura del suelo',
  doorWidth: 'Ancho puerta',
  doorHeight: 'Alto puerta',
  peakHeight: 'Altura pico',
  curveRadius: 'Radio curv.'
};

const DIRECT_NUM_LABELS = {
  count: 'Cantidad',
  gap: 'Separacion',
  spacing: 'Separacion',
  chairSep: 'Sep. sillas',
  cubiteras: 'Cubiteras',
  cubSep: 'Sep. cubiteras',
  height: 'Alto',
  peaks: 'Picos'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function formatNum(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function contextTitle(item) {
  const base = item.catalogName || item.name || TYPE_LABELS[item.type] || item.type || 'Item';
  const sub = item.subtype ? ` · ${item.subtype}` : '';
  return `${base}${sub} · ID ${item.id}`;
}

function isSeatEditable(item) {
  return ['mesa', 'mesaRect', 'mesaImperial', 'mesaCurva', 'mesaSerpentina', 'sillaCatering', 'sillaLineal'].includes(item.type)
    || (typeof item.chairs === 'number' && item.chairs > 0);
}

function isTableLike(item) {
  return ['mesa', 'mesaRect', 'mesaImperial', 'mesaCurva', 'mesaSerpentina'].includes(item.type);
}

function guestsToText(guests = []) {
  return guests
    .map(guest => `${guest.name || ''}${guest.email ? `, ${guest.email}` : ''}`.trim())
    .filter(Boolean)
    .join('\n');
}

function parseGuestsText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const angle = line.match(/^(.*?)\s*<([^>]+)>$/);
      if (angle) return { name: angle[1].trim(), email: angle[2].trim() };

      const parts = line.split(/[;,]/).map(part => part.trim()).filter(Boolean);
      const maybeEmailIndex = parts.findIndex(part => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part));
      if (maybeEmailIndex >= 0) {
        const email = parts[maybeEmailIndex];
        const name = parts.filter((_, index) => index !== maybeEmailIndex).join(' ').trim() || email;
        return { name, email };
      }

      return { name: line, email: '' };
    });
}

function tableAssignmentHTML(item) {
  if (!isTableLike(item)) return '';

  return `
    <div class="ctx-block">
      <div class="ctx-label">Invitados y mesa</div>
      <label class="ctx-field ctx-field-full">
        <span>Nombre mesa</span>
        <input data-field="tableName" class="ctx-input" type="text" value="${escapeAttr(item.tableName || '')}" placeholder="Mesa 1"/>
      </label>
      <label class="ctx-field ctx-field-full">
        <span>Invitados (nombre, email)</span>
        <textarea data-field="guestsText" class="ctx-input ctx-textarea" rows="4" placeholder="Ana Garcia, ana@email.com&#10;Marc Ruiz, marc@email.com">${escapeHtml(guestsToText(item.guests))}</textarea>
      </label>
    </div>`;
}

function getSubtypeOptions(item) {
  if (item.type === 'mesa') {
    return [
      ['standard', 'Estandar'],
      ['napoleon', 'Napoleon'],
      ['presi', 'Presidencial']
    ];
  }
  if (item.type === 'sillaCatering' || item.type === 'sillaLineal') {
    return [
      ['plegable', 'Plegable'],
      ['chiavari', 'Chiavari'],
      ['tiffany', 'Tiffany'],
      ['tolix', 'Tolix']
    ];
  }
  return [];
}

function typeControlHTML(item) {
  const options = getSubtypeOptions(item);
  if (!options.length) {
    return `
      <div class="ctx-readonly">
        <span>Tipo</span>
        <strong>${escapeHtml(TYPE_LABELS[item.type] || item.type || 'Item')}</strong>
      </div>`;
  }

  return `
    <label class="ctx-field ctx-field-full">
      <span>Tipo</span>
      <select data-field="subtype" class="ctx-input">
        ${options.map(([value, label]) => `
          <option value="${escapeAttr(value)}" ${item.subtype === value ? 'selected' : ''}>${escapeHtml(label)}</option>
        `).join('')}
      </select>
    </label>`;
}

function fieldBounds(field) {
  const name = field.split('.').pop();
  if (['chairs', 'count', 'cubiteras', 'peaks'].includes(name)) return { min: 0, max: 500, step: 1 };
  if (['rows', 'cols'].includes(name)) return { min: 1, max: 20, step: 1 };
  if (name === 'anguloDeg') return { min: 1, max: 360, step: 1 };
  if (name === 'diameter') return { min: 0.04, max: 30, step: 0.01 };
  if (name === 'thickness') return { min: 0.02, max: 2, step: 0.01 };
  if (name === 'seatHeight' || name === 'totalHeight') return { min: 0.1, max: 3, step: 0.01 };
  if (name === 'chairOffset') return { min: 0, max: 0.80, step: 0.05 };
  return { min: 0, max: 200, step: 0.1 };
}

function numberFieldHTML(field, label, value) {
  const b = fieldBounds(field);
  return `
    <label class="ctx-field">
      <span>${escapeHtml(label)}</span>
      <input data-field="${escapeAttr(field)}" class="ctx-input" type="number"
        min="${b.min}" max="${b.max}" step="${b.step}" value="${escapeAttr(formatNum(value))}"/>
    </label>`;
}

function checkboxFieldHTML(field, label, checked) {
  return `
    <label class="ctx-check">
      <input data-field="${escapeAttr(field)}" type="checkbox" ${checked ? 'checked' : ''}/>
      <span>${escapeHtml(label)}</span>
    </label>`;
}

function dimensionFieldsHTML(item) {
  const fields = [];
  const dims = item.dims || {};
  const dimOrder = [
    'length', 'width', 'diameter', 'size', 'height', 'depth', 'seatHeight', 'totalHeight',
    'crownWidth', 'ridgeRise', 'peakRise', 'cornerHeight', 'peakHeight', 'eaveHeight',
    'sideDrop', 'modSpacing', 'radioInt', 'anchoTab', 'anguloDeg', 'alto', 'thickness'
  ];

  dimOrder.forEach(key => {
    if (typeof dims[key] === 'number') fields.push(numberFieldHTML(`dims.${key}`, `${DIM_LABELS[key] || key} (m)`, dims[key]));
  });

  ['count', 'gap', 'spacing', 'chairSep', 'cubiteras', 'cubSep', 'height', 'peaks'].forEach(key => {
    if (typeof item[key] === 'number' && !(key === 'height' && typeof dims.height === 'number')) {
      fields.push(numberFieldHTML(key, DIRECT_NUM_LABELS[key] || key, item[key]));
    }
  });

  if (!fields.length) {
    return '<div class="ctx-empty">Sin medidas editables directas</div>';
  }
  return `<div class="ctx-field-grid">${fields.join('')}</div>`;
}

function carpaStructureHTML(item) {
  if (item.type !== 'carpa') return '';

  const posts = item.posts || { enabled: true, diameter: 0.10, spacing: 2.0, height: 3.0 };
  const columns = item.columns || { enabled: false, rows: 1, cols: 2, diameter: 0.15 };
  return `
    <div class="ctx-block">
      <div class="ctx-label">Postes y 2D/3D</div>
      ${checkboxFieldHTML('posts.enabled', 'Mostrar postes perimetrales', posts.enabled !== false)}
      ${checkboxFieldHTML('columns.enabled', 'Mostrar columnas internas', columns.enabled === true)}
      <div class="ctx-field-grid">
        ${numberFieldHTML('posts.spacing', 'Sep. postes', posts.spacing ?? 2.0)}
        ${numberFieldHTML('posts.height', 'Alto poste', posts.height ?? 3.0)}
        ${numberFieldHTML('posts.diameter', 'Diam. poste', posts.diameter ?? 0.10)}
        ${numberFieldHTML('columns.diameter', 'Diam. columna', columns.diameter ?? 0.15)}
        ${numberFieldHTML('columns.rows', 'Filas col.', columns.rows ?? 1)}
        ${numberFieldHTML('columns.cols', 'Cols col.', columns.cols ?? 2)}
      </div>
    </div>`;
}

function presetValue(patch) {
  return encodeURIComponent(JSON.stringify(patch));
}

function getQuickPresets(item) {
  if (item.type === 'text2d') {
    return [
      { label: 'Pequeño', patch: { dims: { height: 0.4 } } },
      { label: 'Normal',  patch: { dims: { height: 0.6 } } },
      { label: 'Grande',  patch: { dims: { height: 1.0 } } },
      { label: 'Enorme',  patch: { dims: { height: 1.6 } } }
    ];
  }
  if (item.type === 'ceilingProp') {
    return [
      { label: '2.2 m', patch: { dims: { height: 2.2 } } },
      { label: '2.6 m', patch: { dims: { height: 2.6 } } },
      { label: '3.0 m', patch: { dims: { height: 3.0 } } },
      { label: '4.0 m', patch: { dims: { height: 4.0 } } }
    ];
  }
  switch (item.type) {
    case 'mesa':
      if (item.subtype === 'presi') {
        return [
          { label: '2.0 x 1.2', patch: { dims: { length: 2.0, width: 1.2 }, chairs: 10 } },
          { label: '2.5 x 1.2', patch: { dims: { length: 2.5, width: 1.2 }, chairs: 12 } },
          { label: '3.0 x 1.5', patch: { dims: { length: 3.0, width: 1.5 }, chairs: 14 } }
        ];
      }
      return [
        { label: '1.5 m', patch: { dims: { diameter: 1.5 }, chairs: 6 } },
        { label: '1.8 m', patch: { dims: { diameter: 1.8 }, chairs: 8 } },
        { label: '2.0 m', patch: { dims: { diameter: 2.0 }, chairs: 10 } }
      ];
    case 'mesaRect':
      return [
        { label: '1.8 x 0.8', patch: { dims: { length: 1.8, width: 0.8 }, chairs: 6 } },
        { label: '2.4 x 1.2', patch: { dims: { length: 2.4, width: 1.2 }, chairs: 8 } },
        { label: '3.0 x 2.0', patch: { dims: { length: 3.0, width: 2.0 }, chairs: 10 } }
      ];
    case 'mesaImperial':
      return [
        { label: '4 x 1.2', patch: { dims: { length: 4, width: 1.2 }, chairs: 12 } },
        { label: '6 x 1.2', patch: { dims: { length: 6, width: 1.2 }, chairs: 20 } },
        { label: '8 x 1.2', patch: { dims: { length: 8, width: 1.2 }, chairs: 28 } }
      ];
    case 'mesaCocktail':
      return [
        { label: '0.7 m', patch: { dims: { diameter: 0.7, height: item.dims?.height ?? 1.1 } } },
        { label: '0.8 m', patch: { dims: { diameter: 0.8, height: item.dims?.height ?? 1.1 } } },
        { label: '0.9 m', patch: { dims: { diameter: 0.9, height: item.dims?.height ?? 1.1 } } }
      ];
    case 'sillaCatering':
      return [
        { label: '40 x 42', patch: { dims: { width: 0.40, depth: 0.42, seatHeight: 0.46, totalHeight: 0.92 } } },
        { label: '44 x 44', patch: { dims: { width: 0.44, depth: 0.44, seatHeight: 0.45, totalHeight: 0.85 } } },
        { label: '48 x 48', patch: { dims: { width: 0.48, depth: 0.48, seatHeight: 0.46, totalHeight: 0.92 } } }
      ];
    case 'sillaLineal':
      return [
        { label: '4 sillas', patch: { count: 4, chairs: 4, gap: item.gap ?? 0.55 } },
        { label: '6 sillas', patch: { count: 6, chairs: 6, gap: item.gap ?? 0.55 } },
        { label: '8 sillas', patch: { count: 8, chairs: 8, gap: item.gap ?? 0.55 } }
      ];
    case 'buffet':
      return [
        { label: '1.8 m', patch: { dims: { length: 1.8 } } },
        { label: '3.6 m', patch: { dims: { length: 3.6 } } },
        { label: '5.5 m', patch: { dims: { length: 5.5 } } }
      ];
    case 'barraLibre':
      return [
        { label: '3 m', patch: { dims: { length: 3, width: item.dims?.width ?? 0.8 }, cubiteras: 2 } },
        { label: '5 m', patch: { dims: { length: 5, width: item.dims?.width ?? 0.8 }, cubiteras: 4 } },
        { label: '7 m', patch: { dims: { length: 7, width: item.dims?.width ?? 0.8 }, cubiteras: 6 } }
      ];
    case 'carpa':
    case 'carpaPabellon':
    case 'carpaTransparente':
    case 'carpaBeduina':
    case 'carpaSailcloth':
    case 'room':
      return [
        { label: '6 x 3', patch: { dims: { length: 6, width: 3 } } },
        { label: '8 x 4', patch: { dims: { length: 8, width: 4 } } },
        { label: '10 x 5', patch: { dims: { length: 10, width: 5 } } }
      ];
    case 'carpaCuadrada':
    case 'carpaStar':
      return [
        { label: '4 m', patch: { dims: { size: 4 } } },
        { label: '6 m', patch: { dims: { size: 6 } } },
        { label: '8 m', patch: { dims: { size: 8 } } }
      ];
    case 'carpaTipi':
    case 'carpaDomo':
      return [
        { label: '6 m', patch: { dims: { diameter: 6 } } },
        { label: '8 m', patch: { dims: { diameter: 8 } } },
        { label: '10 m', patch: { dims: { diameter: 10 } } }
      ];
    case 'arbusto':
      return [
        { label: '0.8 x 0.6', patch: { dims: { width: 0.8, height: 0.6 } } },
        { label: '1.5 x 1.0', patch: { dims: { width: 1.5, height: 1.0 } } },
        { label: '2.5 x 1.5', patch: { dims: { width: 2.5, height: 1.5 } } }
      ];
    case 'arbol':
      return [
        { label: '3 m', patch: { dims: { height: 3, crownWidth: 1.8 } } },
        { label: '5 m', patch: { dims: { height: 5, crownWidth: 2.5 } } },
        { label: '7 m', patch: { dims: { height: 7, crownWidth: 3.5 } } }
      ];
    case 'cableLuces':
      return [
        { label: '6 luces', patch: { count: 6, spacing: 1, height: 3.5 } },
        { label: '8 luces', patch: { count: 8, spacing: 1, height: 4 } },
        { label: '12 luces', patch: { count: 12, spacing: 1.2, height: 4 } }
      ];
    case 'poste':
      return [
        { label: '2.5 m', patch: { dims: { diameter: 0.10, height: 2.5 } } },
        { label: '3.0 m', patch: { dims: { diameter: 0.12, height: 3.0 } } },
        { label: '4.0 m', patch: { dims: { diameter: 0.15, height: 4.0 } } }
      ];
    case 'ambiente':
      if (item.subtype === 'alfombra') {
        if (item.shape === 'round' || typeof item.dims?.diameter === 'number') {
          return [
            { label: '2 m', patch: { dims: { diameter: 2.0 } } },
            { label: '3 m', patch: { dims: { diameter: 3.0 } } },
            { label: '4 m', patch: { dims: { diameter: 4.0 } } }
          ];
        }
        return [
          { label: '2 x 1.5', patch: { dims: { length: 2, width: 1.5 } } },
          { label: '3 x 2', patch: { dims: { length: 3, width: 2 } } },
          { label: '6 x 1.2', patch: { dims: { length: 6, width: 1.2 } } }
        ];
      }
      return [
        { label: '1.2 m', patch: { dims: { height: 1.2 } } },
        { label: '1.8 m', patch: { dims: { height: 1.8 } } },
        { label: '2.4 m', patch: { dims: { height: 2.4 } } }
      ];
    default:
      return getQuickPresetsByCategory(item);
  }
}

function getQuickPresetsByCategory(item) {
  const cat = item.category || '';
  const dims = item.dims || {};

  // Sillas / asientos
  if (cat === 'chairs' || item.type === 'schemaSofa') {
    if (typeof dims.width === 'number' && typeof dims.length === 'number') {
      return [
        { label: 'S  0.5m', patch: { dims: { width: 0.5, length: 0.9 } } },
        { label: 'M  0.7m', patch: { dims: { width: 0.7, length: 0.9 } } },
        { label: 'L  0.9m', patch: { dims: { width: 0.9, length: 0.9 } } }
      ];
    }
    return [];
  }

  // Mesas del catálogo (hospitality, scenography…)
  if (cat === 'hospitality') {
    if (typeof dims.length === 'number') {
      return [
        { label: '2 m', patch: { dims: { length: 2 } } },
        { label: '3 m', patch: { dims: { length: 3 } } },
        { label: '4 m', patch: { dims: { length: 4 } } }
      ];
    }
    if (typeof dims.diameter === 'number') {
      return [
        { label: '0.5 m', patch: { dims: { diameter: 0.5 } } },
        { label: '0.8 m', patch: { dims: { diameter: 0.8 } } },
        { label: '1.2 m', patch: { dims: { diameter: 1.2 } } }
      ];
    }
    return [];
  }

  // Escenografía
  if (cat === 'scenography') {
    if (typeof dims.width === 'number' && typeof dims.length === 'number') {
      return [
        { label: '3 x 2 m', patch: { dims: { width: 3, length: 2 } } },
        { label: '6 x 4 m', patch: { dims: { width: 6, length: 4 } } },
        { label: '8 x 6 m', patch: { dims: { width: 8, length: 6 } } }
      ];
    }
    if (typeof dims.height === 'number') {
      return [
        { label: '1 m', patch: { dims: { height: 1 } } },
        { label: '2.5 m', patch: { dims: { height: 2.5 } } },
        { label: '4 m', patch: { dims: { height: 4 } } }
      ];
    }
    return [];
  }

  // Estructuras
  if (cat === 'structures') {
    if (typeof dims.length === 'number' && typeof dims.width === 'number') {
      return [
        { label: '4 x 2 m', patch: { dims: { length: 4, width: 2 } } },
        { label: '8 x 4 m', patch: { dims: { length: 8, width: 4 } } },
        { label: '12 x 6 m', patch: { dims: { length: 12, width: 6 } } }
      ];
    }
    return [];
  }

  // Servicios
  if (cat === 'services') {
    return [];
  }

  // Iluminación
  if (cat === 'lighting' || item.type === 'schemaLight') {
    return [
      { label: '1 m', patch: { dims: { height: 1 } } },
      { label: '2.5 m', patch: { dims: { height: 2.5 } } },
      { label: '5 m', patch: { dims: { height: 5 } } }
    ];
  }

  // Superficies
  if (item.type === 'schemaSurface') {
    return [
      { label: '3 x 3 m', patch: { dims: { width: 3, length: 3 } } },
      { label: '5 x 5 m', patch: { dims: { width: 5, length: 5 } } },
      { label: '8 x 8 m', patch: { dims: { width: 8, length: 8 } } }
    ];
  }

  // Decoración
  if (cat === 'decoration') {
    if (typeof dims.height === 'number') {
      return [
        { label: '1.5 m', patch: { dims: { height: 1.5 } } },
        { label: '2 m', patch: { dims: { height: 2 } } },
        { label: '3 m', patch: { dims: { height: 3 } } }
      ];
    }
    return [];
  }

  // Ambiente / genérico
  if (typeof dims.height === 'number') {
    return [
      { label: '1 m', patch: { dims: { height: 1 } } },
      { label: '1.5 m', patch: { dims: { height: 1.5 } } },
      { label: '2 m', patch: { dims: { height: 2 } } }
    ];
  }
  if (typeof dims.length === 'number') {
    return [
      { label: '1 m', patch: { dims: { length: 1 } } },
      { label: '2 m', patch: { dims: { length: 2 } } },
      { label: '3 m', patch: { dims: { length: 3 } } }
    ];
  }
  return [];
}

function quickPresetsHTML(item) {
  const presets = getQuickPresets(item);
  if (!presets.length) return '<div class="ctx-empty">Sin medidas rapidas para este tipo</div>';
  return `
    <div class="pill-group ctx-presets">
      ${presets.map(preset => `
        <button data-action="preset" data-value="${escapeAttr(presetValue(preset.patch))}" data-keep-open="1" class="pill ctx-preset-btn">
          ${escapeHtml(preset.label)}
        </button>
      `).join('')}
    </div>`;
}

function colorFieldHTML(item) {
  const raw = String(item.color || '#CCCCCC').trim();
  const safe = /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : '#CCCCCC';
  const primaryLabel = item.type === 'pergola' ? 'Postes' : 'Color';
  let html = `
    <div class="ctx-color-wrap">
      <span class="ctx-color-label">${escapeHtml(primaryLabel)}</span>
      <input type="color" data-field="color" value="${escapeAttr(safe)}" class="ctx-color-swatch"/>
      <input type="text" data-field="color" value="${escapeAttr(safe)}" maxlength="7"
        class="ctx-color-hex" placeholder="#RRGGBB"/>
    </div>`;
  if (item.type === 'pergola') {
    const rawR = String(item.roofColor || '#4A4744').trim();
    const safeR = /^#[0-9a-fA-F]{6}$/.test(rawR) ? rawR : '#4A4744';
    html += `
    <div class="ctx-color-wrap" style="margin-top:6px">
      <span class="ctx-color-label">Techo</span>
      <input type="color" data-field="roofColor" value="${escapeAttr(safeR)}" class="ctx-color-swatch"/>
      <input type="text" data-field="roofColor" value="${escapeAttr(safeR)}" maxlength="7"
        class="ctx-color-hex" placeholder="#RRGGBB"/>
    </div>`;
  }
  return html;
}

function labelFieldHTML(item) {
  if (['zone', 'sillaCatering', 'sillaLineal'].includes(item.type)) return '';
  if (item.type === 'text2d') {
    return `
      <label class="ctx-field ctx-field-full">
        <span>Texto</span>
        <input type="text" data-field="labelText" value="${escapeAttr(item.labelText || '')}" class="ctx-input" placeholder="Escribe aquí..."/>
      </label>`;
  }
  return `
    <label class="ctx-field ctx-field-full">
      <span>Rótulo</span>
      <input type="text" data-field="labelText" value="${escapeAttr(item.labelText || '')}" class="ctx-input" placeholder="Texto..."/>
    </label>`;
}

function advancedParamsHTML(item) {
  const rotDeg = Math.round(((item.rotY ?? 0) * 180 / Math.PI + 360) % 360);
  const opacity = ((item.visual?.opacity ?? 1) * 100).toFixed(0);
  const shadows = item.visual?.shadows !== false;
  const yPos = (item.y ?? 0).toFixed(2);
  return `
    <div class="ctx-field-grid">
      <label class="ctx-field">
        <span>Rotación (°)</span>
        <input data-field="rotDeg" class="ctx-input" type="number" min="0" max="360" step="1" value="${rotDeg}"/>
      </label>
      <label class="ctx-field">
        <span>Altura Y (m)</span>
        <input data-field="y" class="ctx-input" type="number" min="-10" max="30" step="0.1" value="${yPos}"/>
      </label>
    </div>
    <div class="ctx-field-grid">
      <label class="ctx-field">
        <span>Opacidad %</span>
        <input data-field="visual.opacity" class="ctx-input" type="number" min="5" max="100" step="5" value="${opacity}"/>
      </label>
      <label class="ctx-check">
        <input data-field="visual.shadows" type="checkbox" ${shadows ? 'checked' : ''}/>
        <span>Sombras</span>
      </label>
    </div>
    ${item.type === 'carpa' ? carpaStructureHTML(item) : ''}`;
}

function chairOffsetHTML(item) {
  if (!['mesa', 'mesaRect', 'mesaImperial'].includes(item.type)) return '';
  const val = (item.chairOffset ?? 0.10).toFixed(2);
  return `<div class="ctx-field-grid">${numberFieldHTML('chairOffset', 'Gap silla-borde (m)', val)}</div>`;
}

function categorySpecificHTML(item) {
  const cat = item.category || '';
  const type = item.type || '';

  // Colgantes de techo: altura de suspensión destacada
  if (type === 'ceilingProp') {
    const h = (item.dims?.height ?? 2.6).toFixed(2);
    return `
      <div class="ctx-block">
        <div class="ctx-label">Altura de colgado</div>
        <div class="ctx-field-grid">
          <label class="ctx-field">
            <span>Altura (m)</span>
            <input data-field="dims.height" class="ctx-input" type="number" min="0.5" max="12" step="0.1" value="${h}"/>
          </label>
        </div>
      </div>`;
  }

  // Sillas / sofás
  if (cat === 'chairs' || type === 'sillaCatering' || type === 'sillaLineal' || type === 'schemaSofa') {
    const colorAccent = item.accentColor || item.color || '#C7A25F';
    const safeAccent = /^#[0-9a-fA-F]{6}$/.test(colorAccent) ? colorAccent : '#C7A25F';
    return `
      <div class="ctx-block">
        <div class="ctx-label">Silla</div>
        <div class="ctx-color-wrap">
          <span class="ctx-color-label">Acento</span>
          <input type="color" data-field="accentColor" value="${escapeAttr(safeAccent)}" class="ctx-color-swatch"/>
          <input type="text" data-field="accentColor" value="${escapeAttr(safeAccent)}" maxlength="7" class="ctx-color-hex" placeholder="#RRGGBB"/>
        </div>
      </div>`;
  }

  // Mesas (ya cubierto por tableAssignmentHTML, añadir endHead/endFoot si es presi)
  if (type === 'mesa' && item.subtype === 'presi') {
    return `
      <div class="ctx-block">
        <div class="ctx-label">Extremos mesa presidencia</div>
        ${checkboxFieldHTML('endHead', 'Silla cabecera (+X)', item.endHead !== false)}
        ${checkboxFieldHTML('endFoot', 'Silla pie (−X)', item.endFoot !== false)}
      </div>`;
  }

  // Mesa curva
  if (type === 'mesaCurva' || type === 'mesaSerpentina') {
    return `
      <div class="ctx-block">
        <div class="ctx-label">Distribución sillas</div>
        <label class="ctx-field ctx-field-full">
          <span>Posición</span>
          <select data-field="distrib" class="ctx-input">
            <option value="externa" ${(item.distrib || 'externa') === 'externa' ? 'selected' : ''}>Externa</option>
            <option value="interna" ${item.distrib === 'interna' ? 'selected' : ''}>Interna</option>
            <option value="ambas" ${item.distrib === 'ambas' ? 'selected' : ''}>Ambas</option>
          </select>
        </label>
      </div>`;
  }

  // Hospitality: barras y elementos de bebida
  if (cat === 'hospitality') {
    const cubiteras = item.cubiteras;
    return typeof cubiteras === 'number' ? `
      <div class="ctx-block">
        <div class="ctx-label">Configuración barra</div>
        <div class="ctx-field-grid">
          ${numberFieldHTML('cubiteras', 'Cubiteras', cubiteras)}
          ${typeof item.cubSep === 'number' ? numberFieldHTML('cubSep', 'Sep. cubiteras', item.cubSep) : ''}
        </div>
      </div>` : '';
  }

  // Iluminación
  if (cat === 'lighting' || type === 'schemaLight') {
    const lightColor = item.lightColor || '#FFE8A3';
    const safeLightColor = /^#[0-9a-fA-F]{6}$/.test(lightColor) ? lightColor : '#FFE8A3';
    return `
      <div class="ctx-block">
        <div class="ctx-label">Luz</div>
        <div class="ctx-color-wrap">
          <span class="ctx-color-label">Color luz</span>
          <input type="color" data-field="lightColor" value="${escapeAttr(safeLightColor)}" class="ctx-color-swatch"/>
          <input type="text" data-field="lightColor" value="${escapeAttr(safeLightColor)}" maxlength="7" class="ctx-color-hex" placeholder="#RRGGBB"/>
        </div>
      </div>`;
  }

  // Staff / personas
  if (cat === 'staff' || type === 'schemaPerson') {
    const accentColor = item.accentColor || '#F5F3EE';
    const safeAccent = /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#F5F3EE';
    return `
      <div class="ctx-block">
        <div class="ctx-label">Persona</div>
        <div class="ctx-color-wrap">
          <span class="ctx-color-label">Acento</span>
          <input type="color" data-field="accentColor" value="${escapeAttr(safeAccent)}" class="ctx-color-swatch"/>
          <input type="text" data-field="accentColor" value="${escapeAttr(safeAccent)}" maxlength="7" class="ctx-color-hex" placeholder="#RRGGBB"/>
        </div>
      </div>`;
  }

  // Decoración con color de foco/acento
  if (cat === 'decoration' && item.accentColor) {
    const accentColor = item.accentColor;
    const safeAccent = /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#D4AF37';
    return `
      <div class="ctx-block">
        <div class="ctx-label">Decoracion</div>
        <div class="ctx-color-wrap">
          <span class="ctx-color-label">Acento</span>
          <input type="color" data-field="accentColor" value="${escapeAttr(safeAccent)}" class="ctx-color-swatch"/>
          <input type="text" data-field="accentColor" value="${escapeAttr(safeAccent)}" maxlength="7" class="ctx-color-hex" placeholder="#RRGGBB"/>
        </div>
      </div>`;
  }

  return '';
}

function buildUnifiedContextMenuHTML(item) {
  const hasSeats = isSeatEditable(item);
  const specificHTML = categorySpecificHTML(item);
  return `
    <div class="ctx-section ctx-editor">
      <div class="ctx-title-row">
        <div>
          <div class="ctx-label">Modificar item</div>
          <div class="ctx-title">${escapeHtml(contextTitle(item))}</div>
        </div>
        ${item.locked ? '<span class="ctx-lock-badge">Bloqueado</span>' : ''}
      </div>

      ${getSubtypeOptions(item).length > 0 ? `
      <div class="ctx-block">
        <div class="ctx-label">Tipo</div>
        ${typeControlHTML(item)}
      </div>` : ''}

      <div class="ctx-block">
        <div class="ctx-label">Medidas</div>
        ${dimensionFieldsHTML(item)}
        ${chairOffsetHTML(item)}
        ${quickPresetsHTML(item)}
      </div>

      <div class="ctx-block">
        <div class="ctx-label">Apariencia</div>
        ${colorFieldHTML(item)}
        ${labelFieldHTML(item)}
      </div>

      ${hasSeats ? `
        <div class="ctx-block">
          <div class="ctx-label">Sillas</div>
          ${numberFieldHTML('chairs', 'Cantidad', item.chairs ?? 0)}
        </div>` : ''}

      ${specificHTML ? specificHTML : ''}

      ${tableAssignmentHTML(item)}

      <details class="ctx-advanced"${_ctxAdvancedOpen ? ' open' : ''}>
        <summary class="ctx-advanced-toggle">
          <span>Configuración avanzada</span>
          <i data-lucide="chevron-down" class="w-3 h-3 ctx-advanced-icon"></i>
        </summary>
        <div class="ctx-advanced-body">
          ${advancedParamsHTML(item)}
        </div>
      </details>

      ${GroupManager.contextMenuHTML(item)}

      <div class="ctx-divider"></div>
      <div class="ctx-actions">
        <button data-action="rotate-step" data-keep-open="1" class="ctx-action-btn">
          <i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>
          <span>Rotar</span>
          <small>Pulsar R</small>
        </button>
        <button data-action="togglelock" class="ctx-action-btn">
          <i data-lucide="${item.locked ? 'unlock' : 'lock'}" class="w-3.5 h-3.5"></i>
          <span>${item.locked ? 'Desbloquear' : 'Bloquear'}</span>
          <small>B + Click</small>
        </button>
        <button data-action="copy" class="ctx-action-btn">
          <i data-lucide="clipboard" class="w-3.5 h-3.5"></i>
          <span>Copiar</span>
          <small>Ctrl + C</small>
        </button>
        <button data-action="duplicate" class="ctx-action-btn">
          <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          <span>Duplicar</span>
          <small>Ctrl + Click</small>
        </button>
        <button data-action="delete" class="ctx-action-btn danger">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          <span>Eliminar</span>
          <small>Supr</small>
        </button>
      </div>
    </div>`;
}

function buildContextMenuHTML(item) {
  return buildUnifiedContextMenuHTML(item);

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
    return `
      <div class="ctx-section">
        <div class="ctx-label">Buffet · ID ${item.id}${item.locked ? ' · 🔒' : ''}</div>
        <div class="mt-2">
          <label class="ctx-field ctx-field-full">
            <span>Rótulo</span>
            <input type="text" data-field="labelText" value="${escapeAttr(item.labelText || 'Buffet')}" class="ctx-input" placeholder="Buffet ..."/>
          </label>
        </div>
        <div class="mt-3">
          <div class="ctx-label">Longitud</div>
          <div class="pill-group">
            <div data-action="length" data-value="1.8" class="pill ${item.dims.length===1.8?'active':''}">1.8m</div>
            <div data-action="length" data-value="3.6" class="pill ${item.dims.length===3.6?'active':''}">3.6m</div>
            <div data-action="length" data-value="5.5" class="pill ${item.dims.length===5.5?'active':''}">5.5m</div>
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

function applyContextPatch(id, patch, keepMenu = true) {
  const item = AppState.items.find(i => i.id === id);
  if (!item) return;

  const next = { ...patch };
  if (patch.dims) next.dims = { ...(item.dims || {}), ...patch.dims };
  if (patch.posts) next.posts = { ...(item.posts || {}), ...patch.posts };
  if (patch.columns) next.columns = { ...(item.columns || {}), ...patch.columns };

  AppState.update(id, next);
  if (keepMenu) refreshContextMenu(id);
}

function applyContextSubtype(id, value) {
  const item = AppState.items.find(i => i.id === id);
  if (!item) return;

  if (item.type === 'mesa') {
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
    applyContextPatch(id, patch);
    return;
  }

  applyContextPatch(id, { subtype: value });
}

function handleContextField(field, value, id) {
  const item = AppState.items.find(i => i.id === id);
  if (!item) return;

  if (field === 'subtype') {
    applyContextSubtype(id, value);
    return;
  }

  if (field === 'tableName') {
    applyContextPatch(id, { tableName: String(value || '').trim() }, false);
    return;
  }

  if (field === 'labelText') {
    applyContextPatch(id, { labelText: String(value || '') }, false);
    return;
  }

  if (field === 'color' || field === 'roofColor' || field === 'accentColor' || field === 'lightColor') {
    const val = String(value || '').trim();
    if (/^#[0-9a-fA-F]{3,6}$/.test(val)) {
      applyContextPatch(id, { [field]: val }, false);
    }
    return;
  }

  if (field === 'distrib') {
    applyContextPatch(id, { distrib: String(value) });
    return;
  }

  if (field === 'endHead' || field === 'endFoot') {
    const newVal = Boolean(value);
    const other = field === 'endHead' ? item.endFoot : item.endHead;
    const base = 8;
    const chairs = base + (field === 'endHead' ? (newVal ? 1 : 0) : (other !== false ? 1 : 0))
                        + (field === 'endFoot' ? (newVal ? 1 : 0) : (other !== false ? 1 : 0));
    applyContextPatch(id, { [field]: newVal, chairs });
    return;
  }

  if (field === 'rotDeg') {
    const deg = parseFloat(value);
    if (!Number.isFinite(deg)) return;
    applyContextPatch(id, { rotY: (((deg % 360) + 360) % 360) * Math.PI / 180 });
    return;
  }

  if (field === 'y') {
    const yVal = parseFloat(value);
    if (!Number.isFinite(yVal)) return;
    applyContextPatch(id, { y: yVal }, false);
    return;
  }

  if (field.startsWith('visual.')) {
    const key = field.slice(7);
    const current = item.visual || {};
    let parsed;
    if (key === 'shadows') {
      parsed = Boolean(value);
    } else if (key === 'opacity') {
      parsed = Math.min(1, Math.max(0.05, parseFloat(value) / 100));
      if (!Number.isFinite(parsed)) return;
    } else {
      parsed = parseFloat(value);
      if (!Number.isFinite(parsed)) return;
    }
    applyContextPatch(id, { visual: { ...current, [key]: parsed } }, false);
    return;
  }

  if (field === 'guestsText') {
    applyContextPatch(id, { guests: parseGuestsText(value) }, false);
    return;
  }

  if (field === 'chairs') {
    const chairs = Math.max(0, Math.min(500, Math.round(parseFloat(value) || 0)));
    const patch = item.type === 'sillaLineal' ? { chairs, count: chairs } : { chairs };
    applyContextPatch(id, patch);
    return;
  }

  if (field.startsWith('dims.')) {
    const key = field.slice(5);
    const numeric = parseFloat(value);
    if (!Number.isFinite(numeric)) return;
    applyContextPatch(id, { dims: { [key]: numeric } });
    return;
  }

  if (field.startsWith('posts.') || field.startsWith('columns.')) {
    const [group, key] = field.split('.');
    const current = item[group] || {};
    const parsed = key === 'enabled'
      ? Boolean(value)
      : (['rows', 'cols'].includes(key) ? Math.max(1, Math.round(parseFloat(value) || 1)) : parseFloat(value));
    if (key !== 'enabled' && !Number.isFinite(parsed)) return;
    applyContextPatch(id, { [group]: { ...current, [key]: parsed } });
    return;
  }

  const numeric = parseFloat(value);
  if (!Number.isFinite(numeric)) return;
  const intFields = ['count', 'cubiteras', 'peaks'];
  const parsed = intFields.includes(field) ? Math.max(0, Math.round(numeric)) : numeric;
  const patch = { [field]: parsed };
  if (field === 'count' && item.type === 'sillaLineal') patch.chairs = parsed;
  applyContextPatch(id, patch);
}

function handleContextAction(action, value, id) {
  const item = AppState.items.find(i => i.id === id);
  if (!item) return;
  switch (action) {
    case 'rotate-step':
      if (!AppState.selectedIds.has(id)) AppState.select(id);
      rotateSelectionStep();
      refreshContextMenu(id);
      break;
    case 'preset': {
      try {
        const patch = JSON.parse(decodeURIComponent(value));
        applyContextPatch(id, patch);
      } catch (err) {
        console.warn('[ContextMenu] preset no valido:', err);
      }
      break;
    }
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
    case 'copy':
      copySelectedItem();
      break;
    case 'delete': AppState.remove(id); break;

    case 'group-selected':      GroupManager.groupSelected(); break;
    case 'group-dissolve':      GroupManager.ungroupSelected(); break;
    case 'group-select-all':    GroupManager.selectGroup(item.groupId); break;
    case 'group-duplicate':     GroupManager.duplicateGroup(item.groupId); break;
    case 'group-toggle-closed': GroupManager.toggleGroupClosed(item.groupId); break;
    case 'save-as-group': {
      const name = prompt('Nombre del grupo:');
      if (name?.trim()) SavedGroupLibrary.saveCurrentSelection(name.trim());
      break;
    }
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

function toggleFormatMode(active) {
  formatModeActive = active !== undefined ? active : !formatModeActive;
  document.body.classList.toggle('format-mode-active', formatModeActive);
  document.dispatchEvent(new CustomEvent('escale:format-mode-changed', {
    detail: { active: formatModeActive }
  }));
}

function onKeyDown(e) {
  if (e.key === 'Shift') shiftDown = true;
  if (e.key === 'Alt') { altDown = true; e.preventDefault(); }

  // ── Bloquear atajos de navegador que pueden causar pérdida de datos ──
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key;
  if (
    (ctrl && (k === 'r' || k === 'R')) ||          // Ctrl+R / Ctrl+Shift+R: recargar
    k === 'F5' ||                                   // F5: recargar
    (ctrl && k === 'F5') ||                         // Ctrl+F5: recargar forzado
    (ctrl && (k === 'w' || k === 'W')) ||           // Ctrl+W: cerrar pestaña
    (ctrl && (k === 'n' || k === 'N')) ||           // Ctrl+N: nueva ventana
    (ctrl && (k === 't' || k === 'T'))              // Ctrl+T: nueva pestaña
  ) {
    e.preventDefault();
    return;
  }

  const activeTag = document.activeElement?.tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(activeTag) || document.activeElement?.isContentEditable) return;

  // ── Ctrl+Z: Undo ──
  if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'z') {
    e.preventDefault(); AppState.undo(); return;
  }

  // ── Ctrl+G: agrupar selección ──
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key?.toLowerCase() === 'g') {
    e.preventDefault(); GroupManager.groupSelected(); return;
  }

  // ── Ctrl+Shift+G: desagrupar ──
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key?.toLowerCase() === 'g') {
    e.preventDefault(); GroupManager.ungroupSelected(); return;
  }

  // ── Ctrl+D: Duplicar selección ──
  if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'd') {
    e.preventDefault();
    SelectionManager.duplicateSelected();
    return;
  }

  // ── Ctrl+Alt+V: Aplicar formato a selección ──
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key?.toLowerCase() === 'v') {
    e.preventDefault();
    SelectionManager.applyCopiedFormatToSelection();
    return;
  }

  // ── Ctrl+C: copiar formato (si pincel activo) o copiar item ──
  if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'c') {
    if (formatModeActive && AppState.selectedId !== null) {
      const item = AppState.items.find(i => i.id === AppState.selectedId);
      if (item) { SelectionManager.copyItemFormat(item); e.preventDefault(); return; }
    }
    if (copySelectedItem()) e.preventDefault();
    return;
  }

  // ── Ctrl+V: pegar item ──
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key?.toLowerCase() === 'v') {
    if (activateCopiedPlacement()) e.preventDefault();
    return;
  }

  if (e.key?.toLowerCase() === 'b') {
    bKeyDown = true;
    return;
  }

  // ── WASD: mueve la selección en 2D, o navega la cámara ──
  const kk = e.key?.toLowerCase();
  if (!e.ctrlKey && !e.metaKey && !e.altKey && (kk === 'w' || kk === 'a' || kk === 's' || kk === 'd')) {
    // Primer keydown del grupo WASD con selección en 2D → un único pushHistory (para deshacer).
    const wasIdle = !wasdKeys.w && !wasdKeys.a && !wasdKeys.s && !wasdKeys.d;
    if (wasIdle && AppState.camera === 'top' && AppState.selectedIds.size > 0 && !isViewer()) {
      const hasMovable = [...AppState.selectedIds].some(id => {
        const it = AppState.items.find(x => x.id === id);
        return it && !it.locked && it.type !== 'zone';
      });
      if (hasMovable) AppState.pushHistory();
    }
    wasdKeys[kk] = true;
    e.preventDefault();
    return;
  }

  // ── Ctrl+A: seleccionar todos visibles y no bloqueados en capa activa ──
  if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'a') {
    e.preventDefault();
    const lm = window.LayerManager;
    const activeLayerId = lm?.activeLayerId || null;
    const ids = AppState.items
      .filter(i => {
        if (i.locked) return false;
        if (lm) {
          const layer = lm.getItemLayer(i);
          if (layer && !layer.visible) return false;
          if (layer && layer.locked) return false;
          if (activeLayerId && (i.layerId || 'principal') !== activeLayerId) return false;
        }
        return true;
      })
      .map(i => i.id);
    AppState.selectMany(ids);
    return;
  }

  if (e.key?.toLowerCase() === 'r' && !rKeyDown) {
    rKeyDown = true;
    rotateSelectionStep();
    return;
  }

  // ── Delete / Backspace: borrar anotación de medida seleccionada ──
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (MeasureManager.deleteSelected()) { e.preventDefault(); return; }
  }

  // ── Delete / Backspace: borrar selección de escena ──
  if ((e.key === 'Delete' || e.key === 'Backspace') && AppState.selectedIds.size > 0) {
    [...AppState.selectedIds].forEach(id => {
      const it = AppState.items.find(i => i.id === id);
      if (it && !it.locked) AppState.remove(id);
    });
    return;
  }

  // ── Escape: cancelar herramienta activa o limpiar selección ──
  if (e.key === 'Escape') {
    if (PredictiveArray.isActive()) { PredictiveArray.clear(); return; }
    if (MeasureManager.isActive()) { MeasureManager.cancel(); return; }
    if (formatModeActive) { toggleFormatMode(false); return; }
    if (SavedGroupPlacer.hasPendingGroupPlacement()) {
      SavedGroupPlacer.clearPlacement();
      return;
    }
    if (CatalogModal.hasPendingPlacement()) {
      CatalogModal.clearPendingPlacement();
      return;
    }
    if (ZoneManager.isPlacementActive()) {
      ZoneManager.cancelPlacement();
      syncPlacementCursor();
      return;
    }
    SelectionManager.clearSameStyleMarks();
    AppState.deselect();
    hideContextMenu();
    window.PlanManager?.cancelCalibration?.();
  }
}

function onKeyUp(e) {
  if (e.key === 'Shift') shiftDown = false;
  if (e.key === 'Alt') altDown = false;
  if (e.key?.toLowerCase() === 'b') bKeyDown = false;
  if (e.key?.toLowerCase() === 'r') rKeyDown = false;
  const kk = e.key?.toLowerCase();
  if (kk === 'w' || kk === 'a' || kk === 's' || kk === 'd') wasdKeys[kk] = false;
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

export const InteractionManager = {
  init,
  toggleFormatMode,
  get formatModeActive() { return formatModeActive; }
};

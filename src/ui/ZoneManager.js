import { AppState } from '../core/AppState.js';
import { SceneManager } from '../scene/SceneManager.js';
import { SnapManager } from '../scene/SnapManager.js';
import { CatalogModal } from './CatalogModal.js';

let zonePlacement = null;

/* ── Tooltip de cursor ─────────────────────────────────── */
let _tipEl = null;
let _tipMove = null;

function showZoneTip(text) {
  if (!_tipEl) {
    _tipEl = document.createElement('div');
    _tipEl.id = 'zone-cursor-tip';
    _tipEl.className = 'zone-cursor-tip';
    document.body.appendChild(_tipEl);
  }
  _tipEl.textContent = text;
  _tipEl.style.display = 'flex';
  document.body.classList.add('zone-placing');

  if (!_tipMove) {
    _tipMove = e => {
      if (!_tipEl) return;
      const tx = Math.min(e.clientX + 20, window.innerWidth  - (_tipEl.offsetWidth  || 200) - 8);
      const ty = Math.min(e.clientY + 16, window.innerHeight - (_tipEl.offsetHeight || 40)  - 8);
      _tipEl.style.left = tx + 'px';
      _tipEl.style.top  = ty + 'px';
    };
    document.addEventListener('mousemove', _tipMove, { passive: true });
  }
}

function updateZoneTip(text) {
  if (_tipEl) _tipEl.textContent = text;
}

function hideZoneTip() {
  if (_tipEl) { _tipEl.style.display = 'none'; }
  document.body.classList.remove('zone-placing');
  if (_tipMove) {
    document.removeEventListener('mousemove', _tipMove);
    _tipMove = null;
  }
}

function getZones() {
  return AppState.items.filter(item => item?.type === 'zone');
}

function selectedZone() {
  if (AppState.selectedId !== null) {
    const selected = AppState.items.find(item => item.id === AppState.selectedId && item.type === 'zone');
    if (selected) return selected;
  }
  return getZones()[0] || null;
}

function nextZoneName() {
  return `Zona ${getZones().length + 1}`;
}

function sanitizeZoneName(value) {
  return String(value || '').trim() || nextZoneName();
}

function emitZoneUiChange(reason = 'zones-ui') {
  document.dispatchEvent(new CustomEvent('escale:zones-ui-changed', { detail: { reason } }));
  AppState.emitSceneInsights(reason);
}

function buildZoneItem(anchor, point) {
  const minSize = 0.5;
  const length = Math.max(minSize, Math.abs(point.x - anchor.x));
  const width = Math.max(minSize, Math.abs(point.z - anchor.z));

  return {
    type: 'zone',
    x: (anchor.x + point.x) / 2,
    z: (anchor.z + point.z) / 2,
    rotY: 0,
    dims: { length, width, height: 0.03 },
    labelText: zonePlacement?.name || nextZoneName(),
    color: zonePlacement?.color || '#22c55e',
    borderColor: zonePlacement?.borderColor || '#22c55e',
    fillEnabled: zonePlacement?.fillEnabled !== false,
    fillOpacity: zonePlacement?.fillOpacity ?? 0.18,
    visual: {
      opacity: zonePlacement?.fillEnabled === false ? 0.001 : (zonePlacement?.fillOpacity ?? 0.18),
      shadows: false
    },
    showLabel: true,
    locked: false
  };
}

function clearPreview() {
  SceneManager.clearPlacementPreview();
}

function updatePreview() {
  if (!zonePlacement?.anchor || !zonePlacement?.current) {
    clearPreview();
    return;
  }
  const preview = buildZoneItem(zonePlacement.anchor, zonePlacement.current);
  SceneManager.setPlacementPreview(preview);
}

function setPlacementStatus() {
  renderZoneMenu();
  emitZoneUiChange(zonePlacement ? 'zone-placement' : 'zone-placement-cancelled');
}

function startZonePlacement() {
  CatalogModal.clearPendingPlacement();
  const nameInput = document.getElementById('zone-new-name');
  zonePlacement = {
    name: sanitizeZoneName(nameInput?.value),
    borderColor: '#22c55e',
    color: '#22c55e',
    fillEnabled: true,
    fillOpacity: 0.18,
    anchor: null,
    current: null
  };
  // Cerrar el menú de zonas
  document.dispatchEvent(new CustomEvent('escale:scene-overlay-open', { detail: { kind: 'zone-placement' } }));
  // Mostrar tooltip junto al cursor
  showZoneTip(`✦ ${zonePlacement.name} · Clic en el primer punto`);
  setPlacementStatus();
}

function cancelPlacement() {
  if (!zonePlacement) return false;
  zonePlacement = null;
  clearPreview();
  hideZoneTip();
  setPlacementStatus();
  return true;
}

function isPlacementActive() {
  return Boolean(zonePlacement);
}

function getPlacementLabel() {
  if (!zonePlacement) return '';
  if (!zonePlacement.anchor) return `${zonePlacement.name} · primer punto`;
  return `${zonePlacement.name} · segundo punto`;
}

function handleCanvasPointerDown(point) {
  if (!zonePlacement) return false;
  if (!zonePlacement.anchor) {
    zonePlacement.anchor = { x: point.x, z: point.z };
    zonePlacement.current = { x: point.x, z: point.z };
    updateZoneTip(`✦ ${zonePlacement.name} · Clic en la esquina opuesta`);
    updatePreview();
    setPlacementStatus();
    return true;
  }

  zonePlacement.current = { x: point.x, z: point.z };
  const zone = buildZoneItem(zonePlacement.anchor, zonePlacement.current);
  const placed = AppState.add(zone);
  AppState.select(placed.id);
  zonePlacement = null;
  clearPreview();
  hideZoneTip();
  renderZoneMenu();
  emitZoneUiChange('zone-created');
  return true;
}

function handleCanvasPointerMove(point) {
  if (!zonePlacement?.anchor) return false;
  zonePlacement.current = { x: point.x, z: point.z };
  updatePreview();
  return true;
}

function updateZoneField(zone, field, value) {
  if (!zone) return;
  if (field === 'labelText') {
    AppState.update(zone.id, { labelText: sanitizeZoneName(value) }, { skipDetailRebuild: true });
    return;
  }
  if (field === 'dims.length' || field === 'dims.width') {
    const key = field.endsWith('length') ? 'length' : 'width';
    const numeric = Math.max(0.5, parseFloat(value) || zone.dims?.[key] || 4);
    AppState.update(zone.id, {
      dims: {
        ...(zone.dims || {}),
        [key]: numeric
      }
    }, { skipDetailRebuild: true });
    return;
  }
  if (field === 'borderColor') {
    AppState.update(zone.id, { borderColor: value }, { skipDetailRebuild: true });
    return;
  }
  if (field === 'color') {
    AppState.update(zone.id, { color: value }, { skipDetailRebuild: true });
    return;
  }
  if (field === 'fillDisabled') {
    const fillEnabled = !Boolean(value);
    AppState.update(zone.id, {
      fillEnabled,
      visual: {
        ...(zone.visual || {}),
        opacity: fillEnabled ? (zone.fillOpacity ?? zone.visual?.opacity ?? 0.18) : 0.001,
        shadows: false
      }
    }, { skipDetailRebuild: true });
    return;
  }
  if (field === 'fillOpacity') {
    const opacity = Math.max(0.05, Math.min(0.6, (parseFloat(value) || 18) / 100));
    AppState.update(zone.id, {
      fillOpacity: opacity,
      visual: {
        ...(zone.visual || {}),
        opacity: zone.fillEnabled === false ? 0.001 : opacity,
        shadows: false
      }
    }, { skipDetailRebuild: true });
  }
}

function bindZoneEditor(zone) {
  if (!zone) return;
  document.getElementById('zone-edit-name')?.addEventListener('input', event => {
    updateZoneField(zone, 'labelText', event.target.value);
  });
  document.getElementById('zone-edit-length')?.addEventListener('input', event => {
    updateZoneField(zone, 'dims.length', event.target.value);
  });
  document.getElementById('zone-edit-width')?.addEventListener('input', event => {
    updateZoneField(zone, 'dims.width', event.target.value);
  });
  document.getElementById('zone-edit-border')?.addEventListener('input', event => {
    updateZoneField(zone, 'borderColor', event.target.value);
  });
  document.getElementById('zone-edit-fill')?.addEventListener('input', event => {
    updateZoneField(zone, 'color', event.target.value);
  });
  document.getElementById('zone-edit-fill-disabled')?.addEventListener('change', event => {
    updateZoneField(zone, 'fillDisabled', event.target.checked);
  });
  document.getElementById('zone-edit-opacity')?.addEventListener('input', event => {
    updateZoneField(zone, 'fillOpacity', event.target.value);
  });
  document.getElementById('zone-edit-lock')?.addEventListener('change', event => {
    if (zone.locked !== event.target.checked) AppState.toggleLock(zone.id);
  });
  document.getElementById('zone-edit-select')?.addEventListener('click', () => {
    AppState.select(zone.id);
  });
  document.getElementById('zone-edit-delete')?.addEventListener('click', () => {
    AppState.remove(zone.id);
  });
}

function zoneListMarkup(zone, active) {
  return `
    <button class="zone-chip ${active ? 'active' : ''}" type="button" data-zone-id="${zone.id}">
      <span class="zone-chip-swatch" style="background:${zone.fillEnabled === false ? 'transparent' : zone.color};border-color:${zone.borderColor || zone.color}"></span>
      <span class="zone-chip-copy">
        <strong>${zone.labelText || `Zona ${zone.id}`}</strong>
        <small>${(zone.dims?.length || 0).toFixed(1)} × ${(zone.dims?.width || 0).toFixed(1)} m${zone.locked ? ' · bloqueada' : ''}</small>
      </span>
    </button>
  `;
}

function zoneEditorMarkup(zone) {
  if (!zone) {
    return `
      <div class="menu-empty-copy">
        Crea una zona para editar su nombre, colores y bloqueo.
      </div>
    `;
  }

  const opacityPct = Math.round((zone.fillOpacity ?? zone.visual?.opacity ?? 0.18) * 100);
  return `
    <div class="menu-section-label">Propiedades de zona</div>
    <div class="menu-field-grid">
      <label class="menu-field menu-field-full">
        <span>Nombre de zona</span>
        <input id="zone-edit-name" class="input-field" type="text" value="${zone.labelText || ''}"/>
      </label>
      <label class="menu-field">
        <span>Largo (m)</span>
        <input id="zone-edit-length" class="input-field" type="number" min="0.5" max="120" step="0.1" value="${(zone.dims?.length || 4).toFixed(1)}"/>
      </label>
      <label class="menu-field">
        <span>Ancho (m)</span>
        <input id="zone-edit-width" class="input-field" type="number" min="0.5" max="120" step="0.1" value="${(zone.dims?.width || 4).toFixed(1)}"/>
      </label>
      <label class="menu-field">
        <span>Color borde</span>
        <input id="zone-edit-border" class="input-field color-input-field" type="color" value="${zone.borderColor || '#22c55e'}"/>
      </label>
      <label class="menu-field">
        <span>Color relleno</span>
        <input id="zone-edit-fill" class="input-field color-input-field" type="color" value="${zone.color || '#22c55e'}"/>
      </label>
      <label class="menu-field menu-field-full">
        <span>Visibilidad del fondo</span>
        <div class="menu-slider-row">
          <input id="zone-edit-opacity" type="range" min="5" max="60" step="1" value="${opacityPct}"/>
          <strong>${opacityPct}%</strong>
        </div>
      </label>
    </div>
    <label class="menu-check">
      <input id="zone-edit-fill-disabled" type="checkbox" ${zone.fillEnabled === false ? 'checked' : ''}/>
      <span>Desactivar color fondo</span>
    </label>
    <label class="menu-check">
      <input id="zone-edit-lock" type="checkbox" ${zone.locked ? 'checked' : ''}/>
      <span>Bloquear zona</span>
    </label>
    <div class="menu-inline-actions">
      <button id="zone-edit-select" class="btn ghost" type="button">Seleccionar</button>
      <button id="zone-edit-delete" class="btn ghost danger" type="button">Eliminar</button>
    </div>
  `;
}

function renderZoneMenu() {
  const note = document.getElementById('zones-menu-note');
  const list = document.getElementById('zones-list');
  const editor = document.getElementById('zone-editor');
  const zones = getZones();
  const activeZone = selectedZone();
  const nameInput = document.getElementById('zone-new-name');
  const addButton = document.getElementById('zone-add-btn');

  if (nameInput && !nameInput.value.trim() && !zonePlacement) {
    nameInput.value = nextZoneName();
  }

  if (note) {
    note.textContent = !zonePlacement
      ? 'Pulsa Añadir zona y marca dos esquinas opuestas sobre el plano.'
      : !zonePlacement.anchor
        ? `Zona activa: ${zonePlacement.name}. Marca el primer punto sobre el plano.`
        : `Zona activa: ${zonePlacement.name}. Marca la esquina opuesta para cerrar la zona.`;
    note.classList.toggle('is-upsell', false);
  }

  if (addButton) {
    addButton.textContent = zonePlacement ? 'Cancelar zona' : 'Añadir zona';
    addButton.classList.toggle('active', Boolean(zonePlacement));
  }

  if (list) {
    list.innerHTML = zones.length
      ? zones.map(zone => zoneListMarkup(zone, activeZone?.id === zone.id)).join('')
      : '<div class="menu-empty-copy">Todavia no hay zonas en el plano.</div>';
    list.querySelectorAll('[data-zone-id]').forEach(button => {
      button.addEventListener('click', () => {
        AppState.select(Number(button.dataset.zoneId));
      });
    });
  }

  if (editor) {
    editor.innerHTML = zoneEditorMarkup(activeZone);
    bindZoneEditor(activeZone);
  }
}

function applyGridMainSize(value) {
  const subSize = AppState.grid.subSize ?? AppState.snap.spacing ?? 0.25;
  AppState.grid.majorSize = Math.max(subSize, Math.min(20, parseFloat(value) || 1));
  SceneManager.rebuildGrids();
  emitZoneUiChange('grid-main-size');
}

function applyGridSubSize(value) {
  const subSize = Math.max(0.05, Math.min(5, parseFloat(value) || 0.25));
  AppState.grid.subSize = subSize;
  AppState.grid.majorSize = Math.max(subSize, AppState.grid.majorSize || 1);
  SnapManager.setSpacing(subSize);
  emitZoneUiChange('grid-sub-size');
}

function applyGridVisibility(value) {
  AppState.grid.opacity = Math.max(0, Math.min(100, parseFloat(value) || 0));
  SceneManager.rebuildGrids();
  emitZoneUiChange('grid-visibility');
}

function refreshGridMenu() {
  const mainInput = document.getElementById('grid-main-size');
  const subInput = document.getElementById('grid-sub-size');
  const visibility = document.getElementById('grid-visibility');
  const visibilityValue = document.getElementById('grid-visibility-value');
  const moveButton = document.getElementById('btn-move-plan');
  const lockButton = document.getElementById('btn-lock-plan');

  if (mainInput) mainInput.value = String(AppState.grid.majorSize ?? 1);
  if (subInput) subInput.value = String(AppState.grid.subSize ?? AppState.snap.spacing ?? 0.25);
  if (visibility) visibility.value = String(AppState.grid.opacity ?? 55);
  if (visibilityValue) visibilityValue.textContent = `${Math.round(AppState.grid.opacity ?? 55)}%`;
  if (moveButton) moveButton.classList.toggle('active', SceneManager.isPlanMoving());
  if (lockButton) {
    lockButton.classList.toggle('active', SceneManager.isPlanLocked());
    lockButton.innerHTML = `
      <i data-lucide="${SceneManager.isPlanLocked() ? 'lock' : 'unlock'}" class="w-3.5 h-3.5"></i>
      <span id="grid-lock-label">${SceneManager.isPlanLocked() ? 'Desbloquear rejilla' : 'Bloquear rejilla'}</span>
    `;
  }
  if (window.lucide) lucide.createIcons();
}

function init() {
  document.getElementById('zone-add-btn')?.addEventListener('click', () => {
    if (zonePlacement) {
      cancelPlacement();
      return;
    }
    startZonePlacement();
  });

  document.getElementById('grid-main-size')?.addEventListener('change', event => {
    applyGridMainSize(event.target.value);
  });
  document.getElementById('grid-sub-size')?.addEventListener('change', event => {
    applyGridSubSize(event.target.value);
  });
  document.getElementById('grid-visibility')?.addEventListener('input', event => {
    applyGridVisibility(event.target.value);
    refreshGridMenu();
  });

  document.addEventListener('escale:scene-insights-changed', () => {
    renderZoneMenu();
    refreshGridMenu();
  });
  document.addEventListener('escale:header-menu-opened', event => {
    if (event.detail?.menuKey === 'zones') renderZoneMenu();
    if (event.detail?.menuKey === 'grid') refreshGridMenu();
  });
  document.addEventListener('escale:header-menus-refresh', () => {
    renderZoneMenu();
    refreshGridMenu();
  });

  renderZoneMenu();
  refreshGridMenu();
}

export const ZoneManager = {
  init,
  renderZoneMenu,
  refreshGridMenu,
  isPlacementActive,
  getPlacementLabel,
  handleCanvasPointerDown,
  handleCanvasPointerMove,
  cancelPlacement
};

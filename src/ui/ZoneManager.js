import { AppState } from '../core/AppState.js';
import { SceneManager } from '../scene/SceneManager.js';
import { SnapManager } from '../scene/SnapManager.js';
import { CatalogModal } from './CatalogModal.js';

const ZONE_DEFAULT_COLOR = '#9ca3af';   // gris por defecto

let zonePlacement = null;
let activeGridZoneId = null;
let editingZoneId = null;   // zona cuyo panel de ajustes está abierto (aunque esté deshabilitada)

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

function showZoneBanner(text) {
  const b = document.getElementById('zone-build-banner');
  const t = document.getElementById('zone-build-banner-text');
  if (t && text) t.textContent = text;
  if (b) b.style.display = 'flex';
}
function updateZoneBanner(text) {
  const t = document.getElementById('zone-build-banner-text');
  if (t) t.textContent = text;
}
function hideZoneBanner() {
  const b = document.getElementById('zone-build-banner');
  if (b) b.style.display = 'none';
}

function getZones() {
  return AppState.items.filter(item => item?.type === 'zone');
}

function selectedZone() {
  // Zona en edición explícita (chip pulsado), aunque esté deshabilitada/bloqueada.
  if (editingZoneId !== null) {
    const editing = AppState.items.find(item => item.id === editingZoneId && item.type === 'zone');
    if (editing) return editing;
  }
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

function zoneCommonProps() {
  return {
    type: 'zone',
    rotY: 0,
    labelText: zonePlacement?.name || nextZoneName(),
    color: zonePlacement?.color || ZONE_DEFAULT_COLOR,
    borderColor: zonePlacement?.borderColor || ZONE_DEFAULT_COLOR,
    fillEnabled: zonePlacement?.fillEnabled !== false,
    fillOpacity: zonePlacement?.fillOpacity ?? 0.18,
    visual: {
      opacity: zonePlacement?.fillEnabled === false ? 0.001 : (zonePlacement?.fillOpacity ?? 0.18),
      shadows: false
    },
    showLabel: true,
    locked: false,
    textColor: '#000000',
    fontSize: 120,
    gridConfig: {
      majorSize: 0.25,
      opacity: 55,
      enabled: true,
      snapEnabled: true
    }
  };
}

function buildZoneItem(anchor, point) {
  const minSize = 0.5;
  const length = Math.max(minSize, Math.abs(point.x - anchor.x));
  const width = Math.max(minSize, Math.abs(point.z - anchor.z));

  return {
    ...zoneCommonProps(),
    x: (anchor.x + point.x) / 2,
    z: (anchor.z + point.z) / 2,
    dims: { length, width, height: 0.03 }
  };
}

// Zona poligonal a partir de una lista de vértices {x,z} absolutos.
function buildPolyZoneItem(vertices) {
  const cx = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
  const cz = vertices.reduce((s, v) => s + v.z, 0) / vertices.length;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  vertices.forEach(v => { minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z); });
  return {
    ...zoneCommonProps(),
    x: cx,
    z: cz,
    points: vertices.map(v => ({ x: v.x, z: v.z })),
    dims: { length: Math.max(0.5, maxX - minX), width: Math.max(0.5, maxZ - minZ), height: 0.03 }
  };
}

function clearPreview() {
  SceneManager.clearPlacementPreview();
}

function updatePreview() {
  if (zonePlacement?.freeform) {
    const verts = zonePlacement.vertices || [];
    if (!verts.length) { clearPreview(); return; }
    // Contorno punto a punto (vértices fijados + segmento hacia el cursor).
    const pts = [...verts];
    if (zonePlacement.current) {
      pts.push(zonePlacement.current);
      pts._cursorLast = true;   // no dibujar marcador sobre el cursor
    }
    SceneManager.setZoneDraftPreview(pts, zonePlacement.color || ZONE_DEFAULT_COLOR);
    return;
  }
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

function startZonePlacement(freeform = false) {
  CatalogModal.clearPendingPlacement();
  const nameInput = document.getElementById('zone-new-name');
  zonePlacement = {
    name: sanitizeZoneName(nameInput?.value),
    borderColor: ZONE_DEFAULT_COLOR,
    color: ZONE_DEFAULT_COLOR,
    fillEnabled: true,
    fillOpacity: 0.18,
    anchor: null,
    current: null,
    freeform,
    vertices: []
  };
  document.dispatchEvent(new CustomEvent('escale:scene-overlay-open', { detail: { kind: 'zone-placement' } }));
  // Vista cenital 2D para dibujar el contorno con precisión.
  SceneManager.setCamera('top');
  document.getElementById('cam-top')?.classList.add('active');
  document.getElementById('cam-iso')?.classList.remove('active');
  showZoneTip(freeform
    ? `✦ ${zonePlacement.name} · Con Alt pulsado movimiento libre`
    : `✦ ${zonePlacement.name} · Con Alt pulsado movimiento libre`);
  if (freeform) showZoneBanner('Marca los vértices · doble clic para terminar la zona');
  setPlacementStatus();
}

// Quita vértices consecutivos casi idénticos (los genera el doble clic de cierre,
// que dispara 2 pointerdown en el mismo punto antes del dblclick).
function dedupeVertices(verts, eps = 0.05) {
  const out = [];
  for (const v of verts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(v.x - last.x, v.z - last.z) < eps) continue;
    out.push(v);
  }
  // También colapsa el último contra el primero (cierre sobre el inicio).
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.z - b.z) < eps) out.pop();
  }
  return out;
}

// Cierra la zona libre con los vértices marcados (≥3).
function finishFreeformZone() {
  if (!zonePlacement?.freeform) return false;
  const verts = dedupeVertices(zonePlacement.vertices || []);
  if (verts.length < 3) { return false; }
  const zone = buildPolyZoneItem(verts);
  const placed = AppState.add(zone);
  AppState.select(placed.id);
  zonePlacement = null;
  clearPreview();
  hideZoneTip();
  hideZoneBanner();
  renderZoneMenu();
  emitZoneUiChange('zone-created');
  const zoneName = placed.labelText || `Zona ${placed.id}`;
  if (confirm(`¿Bloquear ZONA "${zoneName}" para evitar desplazarla durante la edición?\n\nPuedes reactivarla desde el menú Zonas.`)) {
    AppState.update(placed.id, { disabled: true, locked: true }, { skipDetailRebuild: true });
  }
  return true;
}

function cancelPlacement() {
  if (!zonePlacement) return false;
  zonePlacement = null;
  clearPreview();
  hideZoneTip();
  hideZoneBanner();
  setPlacementStatus();
  return true;
}

function isPlacementActive() {
  return Boolean(zonePlacement);
}

function getPlacementLabel() {
  if (!zonePlacement) return '';
  const n = zonePlacement.vertices?.length || 0;
  return n < 3
    ? `${zonePlacement.name} · marca vértices (${n})`
    : `${zonePlacement.name} · ${n} vértices · doble clic para cerrar`;
}

function handleCanvasPointerDown(point) {
  if (!zonePlacement) return false;

  if (zonePlacement.freeform) {
    const verts = zonePlacement.vertices;
    // Clic cerca del primer vértice → cerrar polígono.
    if (verts.length >= 3) {
      const first = verts[0];
      if (Math.hypot(point.x - first.x, point.z - first.z) < 0.6) {
        finishFreeformZone();
        return true;
      }
    }
    verts.push({ x: point.x, z: point.z });
    zonePlacement.current = { x: point.x, z: point.z };
    updateZoneTip(`✦ ${zonePlacement.name} · Con Alt pulsado movimiento libre`);
    updateZoneBanner(verts.length < 3
      ? 'Marca los vértices · doble clic para terminar la zona'
      : 'Doble clic, Enter o clic en el inicio para terminar la zona');
    updatePreview();
    setPlacementStatus();
    return true;
  }

  if (!zonePlacement.anchor) {
    zonePlacement.anchor = { x: point.x, z: point.z };
    zonePlacement.current = { x: point.x, z: point.z };
    updateZoneTip(`✦ ${zonePlacement.name} · Con Alt pulsado movimiento libre`);
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

  const zoneName = placed.labelText || `Zona ${placed.id}`;
  if (confirm(`¿Bloquear ZONA "${zoneName}" para evitar desplazarla durante la edición?\n\nPuedes reactivarla desde el menú Zonas.`)) {
    AppState.update(placed.id, { disabled: true, locked: true }, { skipDetailRebuild: true });
  }

  return true;
}

function handleCanvasPointerMove(point) {
  if (zonePlacement?.freeform) {
    if (!zonePlacement.vertices.length) return false;
    zonePlacement.current = { x: point.x, z: point.z };
    updatePreview();
    return true;
  }
  if (!zonePlacement?.anchor) return false;
  zonePlacement.current = { x: point.x, z: point.z };
  updatePreview();
  return true;
}

function handleCanvasDoubleClick() {
  if (zonePlacement?.freeform) return finishFreeformZone();
  return false;
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
  bindZoneGridEditor(zone);
}

function zoneListMarkup(zone, active) {
  const statusLabel = zone.disabled ? ' · deshabilitada' : zone.locked ? ' · bloqueada' : '';
  const toggleLabel = zone.disabled ? 'Habilitar' : 'Deshabilitar';
  return `
    <div class="zone-chip-row">
      <button class="zone-chip ${active ? 'active' : ''} ${zone.disabled ? 'is-disabled' : ''}" type="button" data-zone-id="${zone.id}">
        <span class="zone-chip-swatch" style="background:${zone.fillEnabled === false ? 'transparent' : zone.color};border-color:${zone.borderColor || zone.color}"></span>
        <span class="zone-chip-copy">
          <strong>${zone.labelText || `Zona ${zone.id}`}</strong>
          <small>${(zone.dims?.length || 0).toFixed(1)} × ${(zone.dims?.width || 0).toFixed(1)} m${statusLabel}</small>
        </span>
      </button>
      <button class="zone-disable-btn ${zone.disabled ? 'is-active' : ''}" type="button" data-zone-disable="${zone.id}" title="${toggleLabel} zona">
        ${toggleLabel}
      </button>
      <button class="zone-delete-btn" type="button" data-zone-delete="${zone.id}" title="Eliminar zona">×</button>
    </div>
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
  const isPoly = Array.isArray(zone.points) && zone.points.length >= 3;
  const sizeFields = isPoly ? `
      <div class="menu-field menu-field-full">
        <span>Forma</span>
        <strong style="font-family:'JetBrains Mono',monospace;font-size:12px">Polígono · ${zone.points.length} vértices</strong>
      </div>` : `
      <label class="menu-field">
        <span>Largo (m)</span>
        <input id="zone-edit-length" class="input-field" type="number" min="0.5" max="120" step="0.1" value="${(zone.dims?.length || 4).toFixed(1)}"/>
      </label>
      <label class="menu-field">
        <span>Ancho (m)</span>
        <input id="zone-edit-width" class="input-field" type="number" min="0.5" max="120" step="0.1" value="${(zone.dims?.width || 4).toFixed(1)}"/>
      </label>`;
  return `
    <div class="menu-section-label">Zona seleccionada</div>
    <div class="menu-field-grid">
      <label class="menu-field menu-field-full">
        <span>Nombre</span>
        <input id="zone-edit-name" class="input-field" type="text" value="${zone.labelText || ''}"/>
      </label>
      ${sizeFields}
    </div>

    <details class="zone-acc">
      <summary class="zone-acc-summary">Apariencia</summary>
      <div class="zone-acc-body">
        <div class="menu-field-grid">
          <label class="menu-field">
            <span>Color borde</span>
            <input id="zone-edit-border" class="input-field color-input-field" type="color" value="${zone.borderColor || ZONE_DEFAULT_COLOR}"/>
          </label>
          <label class="menu-field">
            <span>Color relleno</span>
            <input id="zone-edit-fill" class="input-field color-input-field" type="color" value="${zone.color || ZONE_DEFAULT_COLOR}"/>
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
      </div>
    </details>

    <details class="zone-acc">
      <summary class="zone-acc-summary">Rejilla y snap</summary>
      <div class="zone-acc-body">
        ${zoneGridEditorMarkup(zone)}
      </div>
    </details>

    <div class="zone-edit-footer">
      <label class="menu-check" style="margin:0">
        <input id="zone-edit-lock" type="checkbox" ${zone.locked ? 'checked' : ''}/>
        <span>Bloquear</span>
      </label>
      <div class="menu-inline-actions" style="margin:0">
        <button id="zone-edit-select" class="btn ghost" type="button">Seleccionar</button>
        <button id="zone-edit-delete" class="btn ghost danger" type="button">Eliminar</button>
      </div>
    </div>
  `;
}

/* ─── Zone Grid helpers ───────────────────────────────────── */

function defaultGridConfig() {
  return { majorSize: 0.25, opacity: 55, enabled: true, snapEnabled: true };
}

function zoneGridListMarkup(zones) {
  if (!zones.length) {
    return '<div class="menu-empty-copy">Crea zonas para generar sus grids vinculados.</div>';
  }
  return zones.map(zone => {
    const cfg = zone.gridConfig || defaultGridConfig();
    const active = zone.id === activeGridZoneId;
    const dims = `${(zone.dims?.length || 0).toFixed(1)}×${(zone.dims?.width || 0).toFixed(1)}m`;
    const sizeLabel = `${cfg.majorSize || 0.25}m`;
    return `
      <div class="zone-chip-row">
        <button class="zone-chip ${active ? 'active' : ''}" type="button" data-grid-zone-id="${zone.id}">
          <span class="zone-chip-swatch" style="background:${zone.fillEnabled === false ? 'transparent' : zone.color};border-color:${zone.borderColor || zone.color}"></span>
          <span class="zone-chip-copy">
            <strong>Grid · ${zone.labelText || `Zona ${zone.id}`}</strong>
            <small>${dims} · ${sizeLabel}</small>
          </span>
        </button>
        <button class="zone-disable-btn ${cfg.enabled === false ? 'is-active' : ''}" type="button" data-grid-toggle="${zone.id}" title="${cfg.enabled === false ? 'Activar grid' : 'Desactivar grid'}">
          ${cfg.enabled === false ? 'Inactivo' : 'Activo'}
        </button>
      </div>
    `;
  }).join('');
}

function zoneGridEditorMarkup(zone) {
  if (!zone) return '';
  const cfg = { ...defaultGridConfig(), ...(zone.gridConfig || {}) };
  const snapOn = cfg.snapEnabled !== false;
  return `
    <div class="menu-field-grid">
      <label class="menu-field">
        <span>Medida grid (m)</span>
        <div class="zg-size-row">
          <input id="zg-main-size" class="input-field" type="number" min="0.05" max="20" step="0.05" value="${cfg.majorSize}"/>
          <button id="zg-snap-toggle" class="zg-snap-btn ${snapOn ? 'is-on' : ''}" type="button" title="Snap rejilla">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            <span>${snapOn ? 'Snap ON' : 'Snap OFF'}</span>
          </button>
        </div>
      </label>
      <label class="menu-field menu-field-full">
        <span>Visibilidad</span>
        <div class="menu-slider-row">
          <input id="zg-visibility" type="range" min="0" max="100" step="1" value="${cfg.opacity}"/>
          <strong id="zg-visibility-value">${cfg.opacity}%</strong>
        </div>
      </label>
    </div>
  `;
}

function bindZoneGridEditor(zone) {
  if (!zone) return;
  const updateGrid = patch => {
    const current = zone.gridConfig || defaultGridConfig();
    AppState.update(zone.id, { gridConfig: { ...current, ...patch } }, { skipDetailRebuild: true });
  };

  document.getElementById('zg-main-size')?.addEventListener('change', e => {
    const majorSize = Math.max(0.05, Math.min(20, parseFloat(e.target.value) || 0.25));
    updateGrid({ majorSize });
  });
  const snapBtn = document.getElementById('zg-snap-toggle');
  if (snapBtn) {
    snapBtn.addEventListener('click', () => {
      const current = zone.gridConfig || defaultGridConfig();
      const next = current.snapEnabled !== false ? false : true;
      updateGrid({ snapEnabled: next });
      snapBtn.classList.toggle('is-on', next);
      snapBtn.querySelector('span').textContent = next ? 'Snap ON' : 'Snap OFF';
    });
  }
  document.getElementById('zg-visibility')?.addEventListener('input', e => {
    const opacity = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
    const lbl = document.getElementById('zg-visibility-value');
    if (lbl) lbl.textContent = `${Math.round(opacity)}%`;
    updateGrid({ opacity });
  });
}

function renderZoneGridMenu() {
  const list = document.getElementById('zone-grids-list');
  const editor = document.getElementById('zone-grid-editor');
  const zones = getZones();
  const activeZone = zones.find(z => z.id === activeGridZoneId) || null;

  if (list) {
    list.innerHTML = zoneGridListMarkup(zones);
    list.querySelectorAll('[data-grid-zone-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.gridZoneId);
        activeGridZoneId = activeGridZoneId === id ? null : id;
        renderZoneGridMenu();
      });
    });
    list.querySelectorAll('[data-grid-toggle]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = Number(btn.dataset.gridToggle);
        const zone = zones.find(z => z.id === id);
        if (!zone) return;
        const cfg = zone.gridConfig || defaultGridConfig();
        AppState.update(id, { gridConfig: { ...cfg, enabled: !cfg.enabled } }, { skipDetailRebuild: true });
      });
    });
  }

  if (editor) {
    editor.innerHTML = zoneGridEditorMarkup(activeZone);
    bindZoneGridEditor(activeZone);
  }
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
    const nVerts = zonePlacement?.vertices?.length || 0;
    note.textContent = !zonePlacement
      ? 'Pulsa Añadir zona y marca los vértices del área del evento. Doble clic o Enter para cerrar.'
      : nVerts < 3
        ? `Zona activa: ${zonePlacement.name}. Marca los vértices (${nVerts} hasta ahora).`
        : `Zona activa: ${zonePlacement.name}. ${nVerts} vértices · doble clic, Enter o clic en el inicio para cerrar.`;
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
        const id = Number(button.dataset.zoneId);
        editingZoneId = id;
        const zone = AppState.items.find(z => z.id === id && z.type === 'zone');
        if (zone && !zone.disabled) AppState.select(id);   // si está activa, también seleccionar en escena
        renderZoneMenu();   // refresca y abre el panel lateral
      });
    });
    list.querySelectorAll('[data-zone-disable]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = Number(btn.dataset.zoneDisable);
        const zone = AppState.items.find(z => z.id === id && z.type === 'zone');
        if (!zone) return;
        const newDisabled = !zone.disabled;
        AppState.update(id, { disabled: newDisabled, locked: newDisabled }, { skipDetailRebuild: true });
        if (newDisabled) AppState.deselect();
      });
    });
    list.querySelectorAll('[data-zone-delete]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        AppState.remove(Number(btn.dataset.zoneDelete));
      });
    });
  }

  // El editor vive en un panel lateral que se abre al pulsar una zona de la lista.
  const panel = document.getElementById('zone-editor-panel');
  if (editor && panel) {
    const editZone = editingZoneId !== null
      ? AppState.items.find(z => z.id === editingZoneId && z.type === 'zone')
      : null;
    if (editZone && !zonePlacement) {
      editor.innerHTML = zoneEditorMarkup(editZone);
      bindZoneEditor(editZone);
      _openZoneEditorPanel();
    } else {
      _closeZoneEditorPanel();
    }
  }
}

// Posiciona el panel lateral pegado al menú de zonas (a la izquierda, o derecha si no cabe).
function _positionZoneEditorPanel() {
  const menu = document.getElementById('zones-menu');
  const panel = document.getElementById('zone-editor-panel');
  if (!menu || !panel || menu.classList.contains('hidden')) return;
  const r = menu.getBoundingClientRect();
  const gap = 8;
  const pw = panel.offsetWidth || 320;
  let left = r.left - pw - gap;
  if (left < 8) left = Math.min(r.right + gap, window.innerWidth - pw - 8);
  panel.style.left = `${Math.max(8, left)}px`;
  panel.style.top = `${r.top}px`;
  panel.style.maxHeight = `${Math.min(window.innerHeight - r.top - 16, window.innerHeight - 90)}px`;
}

function _openZoneEditorPanel() {
  const panel = document.getElementById('zone-editor-panel');
  const menu = document.getElementById('zones-menu');
  if (!panel) return;
  // Solo junto al menú de zonas abierto.
  if (menu && menu.classList.contains('hidden')) { _closeZoneEditorPanel(); return; }
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  _positionZoneEditorPanel();
  if (window.lucide) lucide.createIcons({ nodes: [panel] });
}

function _closeZoneEditorPanel() {
  const panel = document.getElementById('zone-editor-panel');
  if (!panel) return;
  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
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
  renderZoneGridMenu();
}

function init() {
  // Delegación: sobrevive a re-renders. La zona ahora siempre es poligonal libre.
  document.addEventListener('click', e => {
    if (!e.target.closest?.('#zone-add-btn')) return;
    if (zonePlacement) { cancelPlacement(); return; }
    startZonePlacement(true);
  });
  document.addEventListener('keydown', e => {
    if (zonePlacement?.freeform && e.key === 'Enter') {
      e.preventDefault();
      finishFreeformZone();
    }
  });
  document.getElementById('zone-build-cancel')?.addEventListener('click', () => cancelPlacement());

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
    renderZoneGridMenu();
    refreshGridMenu();
  });
  document.addEventListener('escale:header-menu-opened', event => {
    if (event.detail?.menuKey === 'zones') renderZoneMenu();
  });
  document.addEventListener('escale:header-menus-refresh', () => {
    renderZoneMenu();
    refreshGridMenu();
  });

  // Cerrar el panel lateral: botón, o cuando se abre otro overlay / se cierra el menú.
  document.getElementById('zone-editor-close')?.addEventListener('click', () => {
    editingZoneId = null;
    _closeZoneEditorPanel();
    renderZoneMenu();
  });
  document.addEventListener('escale:scene-overlay-open', e => {
    if (e.detail?.key !== 'zones') { editingZoneId = null; _closeZoneEditorPanel(); }
  });
  const _zonesMenu = document.getElementById('zones-menu');
  if (_zonesMenu) {
    new MutationObserver(() => {
      if (_zonesMenu.classList.contains('hidden')) { editingZoneId = null; _closeZoneEditorPanel(); }
      else _positionZoneEditorPanel();
    }).observe(_zonesMenu, { attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('resize', () => _positionZoneEditorPanel());

  renderZoneMenu();
  refreshGridMenu();
}

export const ZoneManager = {
  init,
  renderZoneMenu,
  refreshGridMenu,
  renderZoneGridMenu,
  isPlacementActive,
  getPlacementLabel,
  handleCanvasPointerDown,
  handleCanvasPointerMove,
  handleCanvasDoubleClick,
  cancelPlacement
};

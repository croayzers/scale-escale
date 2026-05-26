/* ============================================================
   E-scale Admin Dashboard — admin.js
   ============================================================ */

const LS_KEY    = 'escale_admin_config';
const CONFIG_URL  = '../config/app.config.json';
const ELEMENTS_URL = '../elements.json';

const ALL_CATEGORY_KEYS = [
  'chairs','tables','decor','bars','structures',
  'ambient','scenography','services','staff','hospitality','decoration','lighting'
];

// ── State ─────────────────────────────────────────────────────
let _cfg      = null;   // live config copy
let _dirty    = false;  // unsaved changes
let _elemsRaw = {};     // { catKey: element[] } from elements.json
let _elemsById = {};    // { id: element } flat map

// ── Bootstrap ─────────────────────────────────────────────────

async function init() {
  _cfg = await loadConfig();
  await loadElementsData();
  renderAll();
  bindNav();
  bindTopbar();
  showSection('capas');
  updateStatus();
  document.getElementById('ep-close')?.addEventListener('click', () => {
    document.getElementById('elem-preview-panel')?.classList.add('hidden');
  });
}

async function loadConfig() {
  const stored = localStorage.getItem(LS_KEY);
  if (stored) { try { return JSON.parse(stored); } catch {} }
  try {
    const r = await fetch(CONFIG_URL, { cache: 'no-cache' });
    if (r.ok) return await r.json();
  } catch {}
  return {};
}

async function loadElementsData() {
  let raw = null;
  try {
    const r = await fetch(ELEMENTS_URL, { cache: 'no-cache' });
    if (r.ok) raw = await r.json();
  } catch (e) {
    console.info('[Admin] fetch elements.json falló, usando datos integrados:', e.message);
  }
  if (!raw && window.__BUNDLED_ELEMENTS__) raw = window.__BUNDLED_ELEMENTS__;
  if (!raw) return;
  _elemsById = {};
  _elemsRaw  = {};
  for (const [cat, items] of Object.entries(raw)) {
    if (cat === 'version' || !Array.isArray(items)) continue;
    _elemsRaw[cat] = items;
    items.forEach(el => { _elemsById[el.id] = el; });
  }
}

// Build current category→elements state applying any saved layout
function buildCurrentCatalog() {
  const layout = _cfg.catalog?.layout || {};
  const current = {};
  ALL_CATEGORY_KEYS.forEach(k => { current[k] = []; });

  if (Object.keys(layout).length > 0) {
    const mentioned = new Set();
    for (const [cat, ids] of Object.entries(layout)) {
      if (!Array.isArray(ids)) continue;
      if (!current[cat]) current[cat] = [];
      ids.forEach(id => {
        const el = _elemsById[id];
        if (el) { current[cat].push(el); mentioned.add(id); }
      });
    }
    // Elements not in any layout slot keep their original category
    ALL_CATEGORY_KEYS.forEach(k => {
      (_elemsRaw[k] || []).forEach(el => {
        if (!mentioned.has(el.id)) current[k].push(el);
      });
    });
  } else {
    ALL_CATEGORY_KEYS.forEach(k => { current[k] = (_elemsRaw[k] || []).slice(); });
  }
  return current;
}

// Capture the current DOM state → save to _cfg.catalog.layout
function captureCatalogLayout() {
  const layout = {};
  document.querySelectorAll('.elem-cat-section').forEach(sec => {
    const cat = sec.dataset.cat;
    layout[cat] = [...sec.querySelectorAll('.elem-item')].map(el => el.dataset.elemId);
  });
  if (!_cfg.catalog) _cfg.catalog = {};
  _cfg.catalog.layout = layout;
  markDirty();
}

// ── Save / Export ──────────────────────────────────────────────

function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(_cfg, null, 2));
  _dirty = false;
  updateStatus(true);
  toast('Cambios guardados', 'success');
}

function markDirty() {
  _dirty = true;
  updateStatus();
}

function updateStatus(justSaved = false) {
  const el = document.getElementById('topbar-status');
  if (!el) return;
  if (justSaved) {
    el.textContent = 'Guardado';
    el.className = 'topbar-status saved';
  } else if (_dirty) {
    el.innerHTML = '<span class="unsaved-dot"></span>Sin guardar';
    el.className = 'topbar-status unsaved';
  } else {
    el.textContent = 'Sin cambios';
    el.className = 'topbar-status';
  }
}

function exportConfig() {
  const json = JSON.stringify(_cfg, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'app.config.json' });
  a.click();
  URL.revokeObjectURL(url);
  toast('Descargando app.config.json');
}

async function saveToFile() {
  if (!window.showSaveFilePicker) { exportConfig(); return; }
  try {
    const fh = await window.showSaveFilePicker({
      suggestedName: 'app.config.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(_cfg, null, 2));
    await w.close();
    _dirty = false;
    updateStatus(true);
    toast('Archivo guardado directamente', 'success');
  } catch (e) { if (e.name !== 'AbortError') exportConfig(); }
}

function resetToDefaults() {
  if (!confirm('¿Restablecer toda la configuración a los valores por defecto?')) return;
  localStorage.removeItem(LS_KEY);
  toast('Restablecido. Recargando…');
  setTimeout(() => location.reload(), 800);
}

// ── Navigation ─────────────────────────────────────────────────

function bindNav() {
  document.querySelectorAll('.sidebar-item').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });
}

function showSection(id) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  document.getElementById('sec-' + id)?.classList.add('active');
  document.querySelector(`.sidebar-item[data-section="${id}"]`)?.classList.add('active');
  if (id === 'proyecto') renderProyecto();
}

function bindTopbar() {
  document.getElementById('btn-save')?.addEventListener('click', save);
  document.getElementById('btn-export')?.addEventListener('click', exportConfig);
  document.getElementById('btn-save-file')?.addEventListener('click', saveToFile);
  document.getElementById('btn-reset')?.addEventListener('click', resetToDefaults);
}

// ── Render all sections ────────────────────────────────────────

function renderAll() {
  renderCapas();
  renderElementos();
  renderZonas();
  renderGrids();
  renderPlantillas();
  renderImprimir();
  renderLogos();
  renderHeader();
  renderMensajes();
  renderTexto();
}

// ── Capas ──────────────────────────────────────────────────────

function renderCapas() {
  const layers = _cfg.layers || {};
  const host = document.getElementById('sec-capas-list');
  if (!host) return;

  const header = `
    <div class="layers-header">
      <span>Color</span>
      <span>Etiqueta</span>
      <span>Clave</span>
      <span>Botón</span>
      <span style="text-align:center">Vis</span>
      <span style="text-align:center">Lock</span>
    </div>`;

  const rows = Object.entries(layers).map(([key, val]) => {
    const color = val.color || '#667eea';
    const btnStyle = val.buttonStyle || 'ghost';
    return `
      <div class="layer-row">
        <div class="layer-color-wrap" title="Color de capa">
          <span class="layer-color-swatch" id="swatch-${key}" style="background:${color}"></span>
          <input type="color" class="layer-color-picker" data-layer="${key}" data-prop="color" value="${color}"/>
        </div>
        <input type="text" class="layer-label-input" data-layer="${key}" data-prop="label"
          value="${esc(val.label || key)}" placeholder="Etiqueta"/>
        <span class="layer-key-mono">${key}</span>
        <select class="layer-btn-sel" data-layer="${key}" data-prop="buttonStyle">
          <option value="ghost"${btnStyle === 'ghost' ? ' selected' : ''}>Ghost</option>
          <option value="primary"${btnStyle === 'primary' ? ' selected' : ''}>Primary</option>
          <option value="subtle"${btnStyle === 'subtle' ? ' selected' : ''}>Subtle</option>
        </select>
        <label class="toggle-switch" style="margin:0 auto">
          <input type="checkbox" data-layer="${key}" data-prop="visible" ${val.visible ? 'checked' : ''}/>
          <span class="toggle-track"></span>
        </label>
        <label class="toggle-switch" style="margin:0 auto">
          <input type="checkbox" data-layer="${key}" data-prop="locked" ${val.locked ? 'checked' : ''}/>
          <span class="toggle-track"></span>
        </label>
      </div>`;
  }).join('');

  host.innerHTML = header + rows;

  host.querySelectorAll('[data-layer]').forEach(inp => {
    const evt = (inp.tagName === 'SELECT' || inp.type === 'checkbox') ? 'change' : 'input';
    inp.addEventListener(evt, () => {
      const { layer, prop } = inp.dataset;
      if (!_cfg.layers[layer]) _cfg.layers[layer] = {};
      if (inp.type === 'checkbox') {
        _cfg.layers[layer][prop] = inp.checked;
      } else if (inp.type === 'color') {
        _cfg.layers[layer][prop] = inp.value;
        const swatch = document.getElementById(`swatch-${layer}`);
        if (swatch) swatch.style.background = inp.value;
      } else {
        _cfg.layers[layer][prop] = inp.value;
      }
      markDirty();
    });
  });
}

// ── Elementos — categorías + elementos con drag-reorder y cambio de categoría ──

function renderElementos() {
  renderDocCategories();
  renderElementTree();
}

function renderDocCategories() {
  const cats = (_cfg.dock?.categories || []).slice().sort((a, b) => a.order - b.order);
  const host = document.getElementById('sec-dock-cats-list');
  if (!host) return;
  host.innerHTML = cats.map(cat => `
    <div class="order-item" draggable="true" data-cat-key="${cat.key}">
      <span class="order-handle">⠿</span>
      <span class="order-label">
        <input type="text" data-cat="${cat.key}" data-prop="label" value="${cat.label}"
          style="width:110px;font-size:12px" placeholder="Nombre"/>
      </span>
      <span style="font-family:var(--font-mono);font-size:9px;color:var(--muted);width:90px">${cat.key}</span>
      <label class="toggle-switch" title="Visible en el dock">
        <input type="checkbox" data-cat="${cat.key}" data-prop="visible" ${cat.visible ? 'checked' : ''}/>
        <span class="toggle-track"></span>
      </label>
    </div>
  `).join('');

  host.querySelectorAll('input[data-cat]').forEach(inp => {
    inp.addEventListener('change', () => {
      const c = (_cfg.dock?.categories || []).find(x => x.key === inp.dataset.cat);
      if (c) { c[inp.dataset.prop] = inp.type === 'checkbox' ? inp.checked : inp.value; markDirty(); }
    });
  });
  bindSimpleDragReorder(host, () => {
    [...host.querySelectorAll('.order-item')].forEach((el, i) => {
      const c = (_cfg.dock?.categories || []).find(x => x.key === el.dataset.catKey);
      if (c) c.order = i + 1;
    });
    markDirty();
  });
}

function renderElementTree() {
  const host = document.getElementById('sec-elem-tree');
  if (!host) return;
  if (Object.keys(_elemsById).length === 0) {
    host.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">
      No se pudo cargar elements.json. Asegúrate de servir la app desde un servidor local.
    </div>`;
    return;
  }

  const catalog = buildCurrentCatalog();
  const catLabels = {};
  (_cfg.dock?.categories || []).forEach(c => { catLabels[c.key] = c.label; });

  const catOptions = ALL_CATEGORY_KEYS.map(k =>
    `<option value="${k}">${catLabels[k] || k}</option>`
  ).join('');

  host.innerHTML = ALL_CATEGORY_KEYS.map(catKey => {
    const items = catalog[catKey] || [];
    const label = catLabels[catKey] || catKey;
    return `
      <div class="elem-cat-section" data-cat="${catKey}">
        <div class="elem-cat-header">
          <span class="elem-cat-label">${esc(label)}</span>
          <span class="elem-cat-count">${items.length} elem.</span>
        </div>
        <div class="elem-cat-body ${items.length === 0 ? 'elem-cat-empty' : ''}">
          ${items.length === 0
            ? `<div class="elem-empty-hint">Sin elementos · arrastra aquí para mover</div>`
            : items.map(el => elemItemHTML(el, catKey, catOptions)).join('')
          }
        </div>
      </div>
    `;
  }).join('');

  bindElementTree(host);
}

function elemItemHTML(el, catKey, catOptions) {
  const type = [el.type, el.subtype].filter(Boolean).join(' · ');
  return `
    <div class="elem-item" draggable="true"
      data-elem-id="${esc(el.id)}" data-cat="${esc(catKey)}">
      <span class="elem-handle" aria-hidden="true">⠿</span>
      <span class="elem-name">${esc(el.name || el.id)}</span>
      <span class="elem-type">${esc(type)}</span>
      <select class="elem-cat-sel" data-elem-id="${esc(el.id)}" title="Mover a categoría">
        ${catOptions.replace(`value="${catKey}"`, `value="${catKey}" selected`)}
      </select>
      <button class="elem-preview-btn" data-elem-id="${esc(el.id)}" draggable="false" title="Vista previa">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
    </div>
  `;
}

function showElemPreview(id) {
  const el = _elemsById[id];
  const panel = document.getElementById('elem-preview-panel');
  if (!panel) return;
  if (!el) { panel.classList.add('hidden'); return; }

  const svg = typeof thumbSVG === 'function' ? thumbSVG(el) : '<svg viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="60" fill="#e6e2da" rx="6"/></svg>';
  const type = [el.type, el.subtype].filter(Boolean).join(' · ');
  const dims = el.dims ? Object.entries(el.dims).map(([k, v]) => `${k}: ${v}`).join(' · ') : '';
  const catLabel = (_cfg.dock?.categories || []).find(c => c.key === (el.category || ''))?.label || (el.category || '');

  document.getElementById('ep-thumb').innerHTML = svg;
  document.getElementById('ep-meta').innerHTML = `
    <div class="ep-name">${esc(el.name || id)}</div>
    ${type ? `<div class="ep-row">${esc(type)}</div>` : ''}
    ${dims ? `<div class="ep-row">${esc(dims)}</div>` : ''}
    ${catLabel ? `<div class="ep-row ep-cat">${esc(catLabel)}</div>` : ''}
    <div class="ep-id">${esc(id)}</div>
  `;
  panel.classList.remove('hidden');
}

function bindElementTree(host) {
  let dragId   = null;  // id of dragged element
  let dragSrc  = null;  // source .elem-item node
  let dragCat  = null;  // source category key

  // ── Preview buttons ────────────────────────────────────────
  host.querySelectorAll('.elem-preview-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      showElemPreview(btn.dataset.elemId);
    });
  });

  // ── Category select ────────────────────────────────────────
  host.querySelectorAll('.elem-cat-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const elemId  = sel.dataset.elemId;
      const newCat  = sel.value;
      const itemEl  = sel.closest('.elem-item');
      const oldSec  = sel.closest('.elem-cat-section');
      const newSec  = host.querySelector(`.elem-cat-section[data-cat="${newCat}"]`);
      if (!newSec || newSec === oldSec) return;

      const body = newSec.querySelector('.elem-cat-body');
      itemEl.dataset.cat = newCat;
      sel.querySelector(`option[value="${newCat}"]`).selected = true;
      body.appendChild(itemEl);

      // Refresh empty hints
      refreshCatEmpty(oldSec);
      refreshCatEmpty(newSec);

      captureCatalogLayout();
    });
  });

  // ── Drag & drop within / between categories ────────────────
  host.querySelectorAll('.elem-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrc = item;
      dragId  = item.dataset.elemId;
      dragCat = item.dataset.cat;
      item.classList.add('elem-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      dragSrc?.classList.remove('elem-dragging');
      host.querySelectorAll('.elem-cat-section').forEach(s => s.classList.remove('elem-drop-target'));
      dragSrc = dragId = dragCat = null;
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === item) return;
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      item.closest('.elem-cat-body').insertBefore(
        dragSrc,
        e.clientY < midY ? item : item.nextSibling
      );
      dragSrc.dataset.cat = item.closest('.elem-cat-section').dataset.cat;
      // keep select in sync
      const sel = dragSrc.querySelector('.elem-cat-sel');
      if (sel) sel.value = dragSrc.dataset.cat;
    });
  });

  // Drop target: the cat-body allows dropping onto empty zones
  host.querySelectorAll('.elem-cat-body').forEach(body => {
    body.addEventListener('dragover', e => {
      e.preventDefault();
      body.closest('.elem-cat-section').classList.add('elem-drop-target');
    });
    body.addEventListener('dragleave', () => {
      body.closest('.elem-cat-section').classList.remove('elem-drop-target');
    });
    body.addEventListener('drop', e => {
      e.preventDefault();
      const sec = body.closest('.elem-cat-section');
      sec.classList.remove('elem-drop-target');
      if (!dragSrc) return;
      const newCat = sec.dataset.cat;
      const oldSec = host.querySelector(`.elem-cat-section[data-cat="${dragSrc.dataset.cat}"]`);
      dragSrc.dataset.cat = newCat;
      const sel = dragSrc.querySelector('.elem-cat-sel');
      if (sel) sel.value = newCat;
      body.appendChild(dragSrc);
      refreshCatEmpty(oldSec);
      refreshCatEmpty(sec);
      captureCatalogLayout();
    });
  });

  // Capture layout after any drag-end on the tree
  host.addEventListener('dragend', () => captureCatalogLayout(), true);
}

function refreshCatEmpty(sec) {
  if (!sec) return;
  const body = sec.querySelector('.elem-cat-body');
  if (!body) return;
  const hasItems = body.querySelector('.elem-item');
  body.classList.toggle('elem-cat-empty', !hasItems);
  let hint = body.querySelector('.elem-empty-hint');
  if (!hasItems && !hint) {
    hint = document.createElement('div');
    hint.className = 'elem-empty-hint';
    hint.textContent = 'Sin elementos · arrastra aquí para mover';
    body.appendChild(hint);
  } else if (hasItems && hint) {
    hint.remove();
  }
  // Update count badge
  const count = sec.querySelector('.elem-cat-count');
  if (count) count.textContent = `${body.querySelectorAll('.elem-item').length} elem.`;
}

// ── Generic drag reorder for order-item lists ──────────────────

function bindSimpleDragReorder(host, onDone) {
  let src = null;
  host.querySelectorAll('.order-item').forEach(item => {
    item.addEventListener('dragstart', () => { src = item; item.classList.add('dragging'); });
    item.addEventListener('dragend',   () => { item.classList.remove('dragging'); onDone?.(); });
    item.addEventListener('dragover',  e => e.preventDefault());
    item.addEventListener('drop', e => {
      e.preventDefault();
      if (src && src !== item) {
        const rect = item.getBoundingClientRect();
        const mid  = rect.top + rect.height / 2;
        host.insertBefore(src, e.clientY < mid ? item : item.nextSibling);
      }
    });
  });
}

// ── Zonas defaults ─────────────────────────────────────────────

function renderZonas() {
  const d = _cfg.zones?.defaults || {};
  setVal('zone-textColor', d.textColor || '#000000');
  setVal('zone-fontSize', d.fontSize ?? 120);
  setVal('zone-majorSize', d.majorSize ?? 1);
  setVal('zone-subSize', d.subSize ?? 0.25);
  setVal('zone-gridOpacity', d.gridOpacity ?? 55);
  setChecked('zone-gridEnabled', d.gridEnabled !== false);

  const zColorPicker = document.getElementById('zone-textColor-picker');
  const zColorText   = document.getElementById('zone-textColor');
  const zColorPrev   = document.getElementById('zone-textColor-preview');
  if (zColorPicker && zColorText) {
    zColorPicker.value = d.textColor || '#000000';
    zColorPicker.addEventListener('input', () => {
      zColorText.value = zColorPicker.value;
      if (zColorPrev) zColorPrev.style.background = zColorPicker.value;
      setNestedCfg('zones.defaults.textColor', zColorPicker.value); markDirty();
    });
  }
  bindField('zone-textColor', v => {
    if (zColorPicker) zColorPicker.value = v;
    if (zColorPrev) zColorPrev.style.background = v;
    setNestedCfg('zones.defaults.textColor', v);
  });
  bindField('zone-fontSize',    v => setNestedCfg('zones.defaults.fontSize', Number(v)));
  bindField('zone-majorSize',   v => setNestedCfg('zones.defaults.majorSize', Number(v)));
  bindField('zone-subSize',     v => setNestedCfg('zones.defaults.subSize', Number(v)));
  bindField('zone-gridOpacity', v => setNestedCfg('zones.defaults.gridOpacity', Number(v)));
  bindCheck('zone-gridEnabled', v => setNestedCfg('zones.defaults.gridEnabled', v));
}

// ── Grids ──────────────────────────────────────────────────────

function renderGrids() {
  const g = _cfg.grids?.global || {};
  setVal('grid-majorSize', g.majorSize ?? 1);
  setVal('grid-subSize', g.subSize ?? 0.25);
  setVal('grid-opacity', g.opacity ?? 55);
  setChecked('grid-enabled', g.enabled !== false);
  setVal('grid-extentX', g.extentX ?? 60);
  setVal('grid-extentZ', g.extentZ ?? 60);

  bindField('grid-majorSize', v => setNestedCfg('grids.global.majorSize', Number(v)));
  bindField('grid-subSize',   v => setNestedCfg('grids.global.subSize', Number(v)));
  bindField('grid-opacity',   v => setNestedCfg('grids.global.opacity', Number(v)));
  bindCheck('grid-enabled',   v => setNestedCfg('grids.global.enabled', v));
  bindField('grid-extentX',   v => setNestedCfg('grids.global.extentX', Number(v)));
  bindField('grid-extentZ',   v => setNestedCfg('grids.global.extentZ', Number(v)));
}

// ── Plantillas ─────────────────────────────────────────────────

function renderPlantillas() {
  const t = _cfg.templates || {};
  setChecked('tpl-enabled',  t.enabled !== false);
  setVal('tpl-maxSlots', t.maxSlots ?? 10);
  setChecked('tpl-autoSave', !!t.autoSave);
  bindCheck('tpl-enabled',  v => setNestedCfg('templates.enabled', v));
  bindField('tpl-maxSlots', v => setNestedCfg('templates.maxSlots', Number(v)));
  bindCheck('tpl-autoSave', v => setNestedCfg('templates.autoSave', v));
}

// ── Imprimir ───────────────────────────────────────────────────

function renderImprimir() {
  const p = _cfg.print || {};
  setVal('print-format', p.defaultFormat || 'A4');
  setVal('print-orientation', p.orientation || 'landscape');
  setChecked('print-watermark', p.includeWatermark !== false);
  setVal('print-watermarkText', p.watermarkText || 'E-scale');
  setChecked('print-grid',  !!p.includeGrid);
  setChecked('print-stats', p.includeStats !== false);

  bindField('print-format',        v => setNestedCfg('print.defaultFormat', v));
  bindField('print-orientation',   v => setNestedCfg('print.orientation', v));
  bindCheck('print-watermark',     v => setNestedCfg('print.includeWatermark', v));
  bindField('print-watermarkText', v => setNestedCfg('print.watermarkText', v));
  bindCheck('print-grid',          v => setNestedCfg('print.includeGrid', v));
  bindCheck('print-stats',         v => setNestedCfg('print.includeStats', v));
}

// ── Logos ──────────────────────────────────────────────────────

function renderLogos() {
  const l = _cfg.logos || {};
  setVal('logo-main', l.main || '/brand/logo.png');
  setVal('logo-horizontal', l.horizontal || '/brand/Logo_horizontal.png');
  setVal('logo-txt', l.logoTxt || '/brand/logo_txt.png');

  bindField('logo-main',       v => { setNestedCfg('logos.main', v); updateLogoPreview('logo-preview-main', v); });
  bindField('logo-horizontal', v => { setNestedCfg('logos.horizontal', v); updateLogoPreview('logo-preview-horizontal', v); });
  bindField('logo-txt',        v => { setNestedCfg('logos.logoTxt', v); updateLogoPreview('logo-preview-txt', v); });

  updateLogoPreview('logo-preview-main',       l.main       || '/brand/logo.png');
  updateLogoPreview('logo-preview-horizontal', l.horizontal || '/brand/Logo_horizontal.png');
  updateLogoPreview('logo-preview-txt',        l.logoTxt    || '/brand/logo_txt.png');
}

function updateLogoPreview(id, src) {
  const box = document.getElementById(id);
  if (!box) return;
  const url = src.startsWith('/') ? '..' + src : src;
  box.innerHTML = `<img src="${url}" onerror="this.style.opacity=0.2;this.alt='No encontrado'"/>`;
}

// ── Header ─────────────────────────────────────────────────────

function renderHeader() {
  const items = (_cfg.header?.items || []).slice().sort((a, b) => a.order - b.order);
  const host  = document.getElementById('sec-header-list');
  if (!host) return;
  host.innerHTML = items.map(item => `
    <div class="order-item" draggable="true" data-hdr-id="${item.id}">
      <span class="order-handle">⠿</span>
      <span class="order-label">
        <input type="text" data-hdr="${item.id}" data-prop="label" value="${item.label}"
          style="width:130px;font-size:12px" placeholder="Etiqueta"/>
      </span>
      <span style="font-family:var(--font-mono);font-size:9px;color:var(--muted);width:130px">${item.id}</span>
      <label class="toggle-switch">
        <input type="checkbox" data-hdr="${item.id}" data-prop="visible" ${item.visible ? 'checked' : ''}/>
        <span class="toggle-track"></span>
      </label>
    </div>
  `).join('');

  host.querySelectorAll('input[data-hdr]').forEach(inp => {
    inp.addEventListener('change', () => {
      const h = (_cfg.header?.items || []).find(x => x.id === inp.dataset.hdr);
      if (h) { h[inp.dataset.prop] = inp.type === 'checkbox' ? inp.checked : inp.value; markDirty(); }
    });
  });
  bindSimpleDragReorder(host, () => {
    [...host.querySelectorAll('.order-item')].forEach((el, i) => {
      const h = (_cfg.header?.items || []).find(x => x.id === el.dataset.hdrId);
      if (h) h.order = i + 1;
    });
    markDirty();
  });
}

// ── Mensajes ───────────────────────────────────────────────────

// All UI triggers (button id → label)
const UI_TRIGGERS = [
  { value: 'onload',               label: 'Al cargar la app' },
  { value: 'btn-company',          label: 'Header · Mi empresa' },
  { value: 'btn-upload-plan',      label: 'Header · Subir Plano' },
  { value: 'btn-calibrate',        label: 'Header · Calibrar (regla)' },
  { value: 'btn-zones-menu',       label: 'Header · Zonas' },
  { value: 'btn-grid-menu',        label: 'Header · Grid' },
  { value: 'btn-template-menu',    label: 'Header · Plantilla' },
  { value: 'btn-print-menu',       label: 'Header · Imprimir' },
  { value: 'btn-pro-menu',         label: 'Header · PRO' },
  { value: 'btn-settings',         label: 'Header · Ajustes' },
  { value: 'btn-account',          label: 'Header · Cuenta / Acceso' },
  { value: 'dock-chairs',          label: 'Dock · Sillas' },
  { value: 'dock-tables',          label: 'Dock · Mesas' },
  { value: 'dock-decor',           label: 'Dock · Carpas' },
  { value: 'dock-bars',            label: 'Dock · Buffet' },
  { value: 'dock-structures',      label: 'Dock · Estructuras' },
  { value: 'dock-ambient',         label: 'Dock · Ambiente' },
  { value: 'dock-scenography',     label: 'Dock · Escenografía' },
  { value: 'dock-services',        label: 'Dock · Servicios' },
  { value: 'dock-staff',           label: 'Dock · Personal' },
  { value: 'dock-hospitality',     label: 'Dock · Hostelería' },
  { value: 'dock-decoration',      label: 'Dock · Decoración' },
  { value: 'dock-lighting',        label: 'Dock · Iluminación' },
  { value: 'dock-inventory-btn',   label: 'Dock · Inventario' },
  { value: 'manual',               label: 'Manual (por código)' },
];

function triggerOptionsHTML(selected) {
  return UI_TRIGGERS.map(t =>
    `<option value="${t.value}"${t.value === selected ? ' selected' : ''}>${esc(t.label)}</option>`
  ).join('');
}

const UI_ACCEPT_ACTIONS = [
  { value: '',                   label: '— ninguna —' },
  { value: 'btn-company',        label: 'Header · Mi empresa' },
  { value: 'btn-upload-plan',    label: 'Header · Subir Plano' },
  { value: 'btn-calibrate',      label: 'Header · Calibrar (regla)' },
  { value: 'btn-zones-menu',     label: 'Header · Zonas' },
  { value: 'btn-grid-menu',      label: 'Header · Grid' },
  { value: 'btn-template-menu',  label: 'Header · Plantilla' },
  { value: 'btn-print-menu',     label: 'Header · Imprimir' },
  { value: 'btn-pro-menu',       label: 'Header · PRO' },
  { value: 'btn-settings',       label: 'Header · Ajustes' },
  { value: 'btn-account',        label: 'Header · Cuenta / Acceso' },
  { value: 'dock-chairs',        label: 'Dock · Sillas' },
  { value: 'dock-tables',        label: 'Dock · Mesas' },
  { value: 'dock-decor',         label: 'Dock · Carpas' },
  { value: 'dock-bars',          label: 'Dock · Buffet' },
  { value: 'dock-structures',    label: 'Dock · Estructuras' },
  { value: 'dock-ambient',       label: 'Dock · Ambiente' },
  { value: 'dock-scenography',   label: 'Dock · Escenografía' },
  { value: 'dock-services',      label: 'Dock · Servicios' },
  { value: 'dock-staff',         label: 'Dock · Personal' },
  { value: 'dock-hospitality',   label: 'Dock · Hostelería' },
  { value: 'dock-decoration',    label: 'Dock · Decoración' },
  { value: 'dock-lighting',      label: 'Dock · Iluminación' },
  { value: 'dock-inventory-btn', label: 'Dock · Inventario' },
];

function acceptActionOptionsHTML(selected) {
  return UI_ACCEPT_ACTIONS.map(t =>
    `<option value="${t.value}"${t.value === (selected || '') ? ' selected' : ''}>${esc(t.label)}</option>`
  ).join('');
}

function renderMensajes() {
  const msgs  = _cfg.messages || {};
  const types = ['msj_alerta', 'msj_oferta', 'msj_info', 'msj_stats'];
  types.forEach(key => {
    const m = msgs[key] || {};
    setChecked(`${key}-enabled`,   !!m.enabled);
    setVal(`${key}-title`,         m.title || '');
    setVal(`${key}-text`,          m.text  || '');
    setVal(`${key}-cancelBtn`,     m.cancelBtn || 'Cancelar');
    setVal(`${key}-acceptBtn`,     m.acceptBtn || 'Aceptar');
    setVal(`${key}-acceptUrl`,     m.acceptUrl  || '');
    setVal(`${key}-cooldown`,      m.cooldownDays ?? 1);

    // Populate trigger select dynamically
    const trigSel = document.getElementById(`${key}-trigger`);
    if (trigSel) {
      trigSel.innerHTML = triggerOptionsHTML(m.trigger || 'onload');
      trigSel.addEventListener('change', () => { setMsgCfg(key, 'trigger', trigSel.value); markDirty(); });
    }

    // Populate accept-action select
    const actSel = document.getElementById(`${key}-acceptAction`);
    if (actSel) {
      actSel.innerHTML = acceptActionOptionsHTML(m.acceptAction || '');
      actSel.addEventListener('change', () => { setMsgCfg(key, 'acceptAction', actSel.value); markDirty(); });
    }

    bindCheck(`${key}-enabled`,     v => setMsgCfg(key, 'enabled', v));
    bindField(`${key}-title`,       v => setMsgCfg(key, 'title', v));
    bindField(`${key}-text`,        v => setMsgCfg(key, 'text', v));
    bindField(`${key}-cancelBtn`,   v => setMsgCfg(key, 'cancelBtn', v));
    bindField(`${key}-acceptBtn`,   v => setMsgCfg(key, 'acceptBtn', v));
    bindField(`${key}-acceptUrl`,   v => setMsgCfg(key, 'acceptUrl', v));
    bindField(`${key}-cooldown`,    v => setMsgCfg(key, 'cooldownDays', Number(v)));
  });
}

function setMsgCfg(key, prop, val) {
  if (!_cfg.messages) _cfg.messages = {};
  if (!_cfg.messages[key]) _cfg.messages[key] = {};
  _cfg.messages[key][prop] = val;
  markDirty();
}

// ── Texto y colores ────────────────────────────────────────────

const FONT_ROLES = [
  {
    id: 'typo-display', path: 'typography.displayFont',
    label: 'Display / titulares',
    fonts: [
      { name: 'Fraunces',           css: "'Fraunces', Georgia, serif" },
      { name: 'Playfair Display',   css: "'Playfair Display', Georgia, serif" },
      { name: 'DM Serif Display',   css: "'DM Serif Display', Georgia, serif" },
      { name: 'Cormorant',          css: "'Cormorant', Georgia, serif" },
      { name: 'Lora',               css: "'Lora', Georgia, serif" },
      { name: 'Merriweather',       css: "'Merriweather', Georgia, serif" },
      { name: 'EB Garamond',        css: "'EB Garamond', Georgia, serif" },
      { name: 'Libre Baskerville',  css: "'Libre Baskerville', Georgia, serif" },
      { name: 'Spectral',           css: "'Spectral', Georgia, serif" },
      { name: 'Bodoni Moda',        css: "'Bodoni Moda', Georgia, serif" },
    ]
  },
  {
    id: 'typo-body', path: 'typography.bodyFont',
    label: 'Cuerpo / interfaz',
    fonts: [
      { name: 'Inter Tight',       css: "'Inter Tight', 'Inter', system-ui, sans-serif" },
      { name: 'Inter',             css: "'Inter', system-ui, sans-serif" },
      { name: 'Manrope',           css: "'Manrope', system-ui, sans-serif" },
      { name: 'Work Sans',         css: "'Work Sans', system-ui, sans-serif" },
      { name: 'DM Sans',           css: "'DM Sans', system-ui, sans-serif" },
      { name: 'Nunito',            css: "'Nunito', system-ui, sans-serif" },
      { name: 'Outfit',            css: "'Outfit', system-ui, sans-serif" },
      { name: 'Plus Jakarta Sans', css: "'Plus Jakarta Sans', system-ui, sans-serif" },
      { name: 'Karla',             css: "'Karla', system-ui, sans-serif" },
    ]
  },
  {
    id: 'typo-mono', path: 'typography.monoFont',
    label: 'Monoespaciada',
    fonts: [
      { name: 'JetBrains Mono',  css: "'JetBrains Mono', 'Fira Code', monospace" },
      { name: 'Fira Code',       css: "'Fira Code', monospace" },
      { name: 'Source Code Pro', css: "'Source Code Pro', monospace" },
      { name: 'IBM Plex Mono',   css: "'IBM Plex Mono', monospace" },
      { name: 'Roboto Mono',     css: "'Roboto Mono', monospace" },
      { name: 'Space Mono',      css: "'Space Mono', monospace" },
      { name: 'Inconsolata',     css: "'Inconsolata', monospace" },
    ]
  }
];

function loadGoogleFont(fontName) {
  if (!fontName) return;
  const id = 'gf-' + fontName.replace(/\s+/g, '-').toLowerCase();
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id   = id;
  link.rel  = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}:wght@300;400;500;600&display=swap`;
  document.head.appendChild(link);
}

function renderTexto() {
  const t = _cfg.typography || {};
  const c = _cfg.colors     || {};
  const b = _cfg.buttons    || {};

  setVal('btn-radius', b.borderRadius || '8px');

  // Font pickers
  const pickersHost = document.getElementById('sec-typo-pickers');
  if (pickersHost) {
    pickersHost.innerHTML = FONT_ROLES.map(role => {
      const currentCss = t[role.path.split('.')[1]] || role.fonts[0].css;
      const optionsHTML = role.fonts.map(f =>
        `<option value="${esc(f.css)}"${f.css === currentCss ? ' selected' : ''}>${esc(f.name)}</option>`
      ).join('');
      return `
        <div class="font-picker-item">
          <div class="font-picker-label">${esc(role.label)}</div>
          <div class="font-picker-controls">
            <select class="font-picker-sel" data-font-path="${role.path}"
              data-preview-id="${role.id}-preview">${optionsHTML}</select>
            <div class="font-preview-sample" id="${role.id}-preview"
              style="font-family:${currentCss}">Aa Bb Cc — Diseño de espacios — 1234</div>
          </div>
        </div>`;
    }).join('');

    pickersHost.querySelectorAll('.font-picker-sel').forEach(sel => {
      // Preload the currently selected font
      loadGoogleFont(sel.options[sel.selectedIndex]?.text || '');
      sel.addEventListener('change', () => {
        const cssVal   = sel.value;
        const fontName = sel.options[sel.selectedIndex]?.text || '';
        loadGoogleFont(fontName);
        const preview = document.getElementById(sel.dataset.previewId);
        if (preview) preview.style.fontFamily = cssVal;
        setNestedCfg(sel.dataset.fontPath, cssVal);
        markDirty();
      });
    });
  }

  ['primary','secondary','accent','surface','text'].forEach(k => {
    const txt  = document.getElementById(`color-${k}`);
    const pick = document.getElementById(`color-${k}-picker`);
    const prev = document.getElementById(`color-${k}-preview`);
    if (!txt || !pick) return;
    txt.value  = c[k] || '';
    pick.value = c[k] || '#000000';
    if (prev) prev.style.background = c[k] || '';
    txt.addEventListener('input',  () => { pick.value = txt.value; if (prev) prev.style.background = txt.value; });
    pick.addEventListener('input', () => { txt.value = pick.value; if (prev) prev.style.background = pick.value; });
  });

  bindField('color-primary',   v => setNestedCfg('colors.primary', v));
  bindField('color-secondary', v => setNestedCfg('colors.secondary', v));
  bindField('color-accent',    v => setNestedCfg('colors.accent', v));
  bindField('color-surface',   v => setNestedCfg('colors.surface', v));
  bindField('color-text',      v => setNestedCfg('colors.text', v));
  bindField('btn-radius',      v => setNestedCfg('buttons.borderRadius', v));

  document.getElementById('btn-preview-colors')?.addEventListener('click', () => {
    const root = document.documentElement;
    const cc = _cfg.colors || {};
    const ct = _cfg.typography || {};
    if (cc.surface)    root.style.setProperty('--bg', cc.surface);
    if (cc.text)       root.style.setProperty('--text', cc.text);
    if (ct.displayFont) root.style.setProperty('--font-display', ct.displayFont);
    if (ct.bodyFont)    root.style.setProperty('--font-body', ct.bodyFont);
    toast('Previsualización aplicada al dashboard');
  });
}

// ── Project Tree ───────────────────────────────────────────────

let _ptreeData   = null;
let _ptreeLoaded = false;

const PT_EXT = {
  js:   { fg: '#9b7800', bg: 'rgba(240,219,79,0.18)' },
  mjs:  { fg: '#9b7800', bg: 'rgba(240,219,79,0.18)' },
  cjs:  { fg: '#9b7800', bg: 'rgba(240,219,79,0.18)' },
  ts:   { fg: '#1a56c0', bg: 'rgba(49,120,198,0.15)' },
  tsx:  { fg: '#1a56c0', bg: 'rgba(49,120,198,0.15)' },
  css:  { fg: '#1a3fb5', bg: 'rgba(38,77,228,0.13)' },
  html: { fg: '#b03018', bg: 'rgba(227,76,38,0.13)' },
  json: { fg: '#7c5a28', bg: 'rgba(165,127,78,0.16)' },
  md:   { fg: '#2550a0', bg: 'rgba(48,96,176,0.12)' },
  py:   { fg: '#1e5490', bg: 'rgba(53,114,165,0.14)' },
  sql:  { fg: '#905800', bg: 'rgba(160,96,0,0.13)' },
  png:  { fg: '#6930c0', bg: 'rgba(124,58,237,0.12)' },
  jpg:  { fg: '#6930c0', bg: 'rgba(124,58,237,0.12)' },
  jpeg: { fg: '#6930c0', bg: 'rgba(124,58,237,0.12)' },
  svg:  { fg: '#b04800', bg: 'rgba(255,109,0,0.12)' },
  yml:  { fg: '#4a5568', bg: 'rgba(74,85,104,0.12)' },
  yaml: { fg: '#4a5568', bg: 'rgba(74,85,104,0.12)' },
  xlsx: { fg: '#1a6838', bg: 'rgba(33,115,70,0.12)' },
  txt:  { fg: '#718096', bg: 'rgba(113,128,150,0.1)' },
  env:  { fg: '#8B4513', bg: 'rgba(139,69,19,0.12)' },
};

function ptExtColor(ext) {
  return PT_EXT[ext] || { fg: '#718096', bg: 'rgba(113,128,150,0.1)' };
}

function ptFormatSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024)    return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function ptCountFiles(node) {
  if (node.type === 'file') return 1;
  return (node.children || []).reduce((s, c) => s + ptCountFiles(c), 0);
}

function ptCountDirs(node) {
  if (node.type === 'file') return 0;
  return 1 + (node.children || []).reduce((s, c) => s + ptCountDirs(c), 0);
}

// Inline SVG icons to avoid Lucide dependency inside dynamically generated HTML
const PT_SVG_DIR  = `<svg class="pt-icon pt-icon-dir" viewBox="0 0 16 16" fill="none"><path d="M1.5 4C1.5 3.17 2.17 2.5 3 2.5h4l1.5 1.5H13c.83 0 1.5.67 1.5 1.5V12c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5V4z" fill="currentColor"/></svg>`;
const PT_SVG_FILE = `<svg class="pt-icon pt-icon-file" viewBox="0 0 16 16" fill="none"><path d="M3 1.5h7l3 3V14c0 .83-.67 1.5-1.5 1.5H3C2.17 15.5 1.5 14.83 1.5 14V3C1.5 2.17 2.17 1.5 3 1.5z" stroke="currentColor" stroke-width="1.1" fill="none"/><path d="M10 1.5V4c0 .28.22.5.5.5H13" stroke="currentColor" stroke-width="1.1" fill="none"/></svg>`;

function ptBuildHTML(nodes, level = 0, searchTerm = '') {
  if (!nodes || nodes.length === 0) return '';
  const indent = 8 + level * 16;

  return nodes.map(node => {
    if (node.type === 'dir') {
      const total   = ptCountFiles(node);
      const autoOpen = !searchTerm && level < 2;
      const childHTML = ptBuildHTML(node.children || [], level + 1, searchTerm);
      if (searchTerm && childHTML === '') return ''; // prune empty dirs when filtering
      return `<details class="pt-dir" data-path="${esc(node.path)}" ${autoOpen || searchTerm ? 'open' : ''}>
  <summary class="pt-row pt-dir-row" style="padding-left:${indent}px" title="${esc(node.path)}">
    <span class="pt-chevron"></span>${PT_SVG_DIR}<span class="pt-name">${esc(node.name)}</span>
    <span class="pt-badge pt-count">${total}</span>
  </summary>
  <div class="pt-children">${childHTML}</div>
</details>`;
    }

    if (searchTerm && !node.path.toLowerCase().includes(searchTerm.toLowerCase())) return '';
    const c    = ptExtColor(node.ext);
    const size = ptFormatSize(node.size);
    const extLabel = node.ext ? node.ext : '·';
    return `<div class="pt-row pt-file-row" data-path="${esc(node.path)}" style="padding-left:${indent + 18}px" title="${esc(node.path)}">
  ${PT_SVG_FILE}
  <span class="pt-ext-badge" style="color:${c.fg};background:${c.bg}">${esc(extLabel)}</span>
  <span class="pt-name">${esc(node.name)}</span>
  ${size ? `<span class="pt-size">${size}</span>` : ''}
</div>`;
  }).join('');
}

async function renderProyecto() {
  if (_ptreeLoaded) return;
  _ptreeLoaded = true;

  const container = document.getElementById('ptree-container');
  const genTime   = document.getElementById('ptree-gen-time');
  const statsEl   = document.getElementById('ptree-stats');
  if (!container) return;

  container.innerHTML = '<div class="ptree-loading">Cargando árbol del proyecto…</div>';

  try {
    const r = await fetch('project-tree.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _ptreeData = await r.json();

    if (genTime && _ptreeData.generated) {
      genTime.textContent = new Date(_ptreeData.generated).toLocaleString('es-ES');
    }

    const totalFiles = ptCountFiles(_ptreeData) - 1; // root node itself
    const totalDirs  = ptCountDirs(_ptreeData) - 1;
    if (statsEl) statsEl.textContent = `${totalFiles} archivos · ${totalDirs} carpetas`;

    container.innerHTML = ptBuildHTML(_ptreeData.children || []);
  } catch (_) {
    container.innerHTML = `<div class="ptree-empty">
      <p>No se encontró <code>admin/project-tree.json</code>.</p>
      <p>Ejecuta desde la raíz del proyecto:</p>
      <code>node generate-tree-json.js</code>
    </div>`;
  }

  // Search
  const searchEl = document.getElementById('ptree-search');
  searchEl?.addEventListener('input', () => {
    const term = searchEl.value.trim();
    if (!_ptreeData) return;
    container.innerHTML = ptBuildHTML(_ptreeData.children || [], 0, term);
    if (term) container.querySelectorAll('details').forEach(d => d.open = true);
  });

  // Expand / collapse
  document.getElementById('ptree-expand-all')?.addEventListener('click', () => {
    container.querySelectorAll('details').forEach(d => d.open = true);
  });
  document.getElementById('ptree-collapse-all')?.addEventListener('click', () => {
    container.querySelectorAll('details').forEach(d => d.open = false);
  });

  // Refresh hint
  document.getElementById('ptree-refresh-btn')?.addEventListener('click', () => {
    _ptreeLoaded = false;
    _ptreeData   = null;
    container.innerHTML = '<div class="ptree-loading">Recargando…</div>';
    renderProyecto();
  });
}

// ── Utilities ──────────────────────────────────────────────────

function setVal(id, val)     { const el = document.getElementById(id); if (el) el.value = val; }
function setChecked(id, val) { const el = document.getElementById(id); if (el) el.checked = !!val; }

function bindField(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  const evt = (el.tagName === 'SELECT') ? 'change' : 'input';
  el.addEventListener(evt, () => { fn(el.value); markDirty(); });
}
function bindCheck(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => { fn(el.checked); markDirty(); });
}

function setNestedCfg(path, val) {
  const parts = path.split('.');
  let obj = _cfg;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!obj[parts[i]]) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = val;
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, ch =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[ch]);
}

function toast(msg, type = '') {
  const el = document.getElementById('admin-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2800);
}

document.addEventListener('DOMContentLoaded', init);

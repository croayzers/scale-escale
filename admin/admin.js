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
  try {
    const r = await fetch(ELEMENTS_URL, { cache: 'no-cache' });
    if (!r.ok) return;
    const raw = await r.json();
    _elemsById = {};
    _elemsRaw  = {};
    for (const [cat, items] of Object.entries(raw)) {
      if (cat === 'version' || !Array.isArray(items)) continue;
      _elemsRaw[cat] = items;
      items.forEach(el => { _elemsById[el.id] = el; });
    }
  } catch (e) {
    console.warn('[Admin] No se pudo cargar elements.json:', e.message);
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
  host.innerHTML = Object.entries(layers).map(([key, val]) => `
    <div class="toggle-row">
      <div>
        <div class="toggle-label">${val.label || key}</div>
        <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted)">${key}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)">
          Vis
          <label class="toggle-switch">
            <input type="checkbox" data-layer="${key}" data-prop="visible" ${val.visible ? 'checked' : ''}/>
            <span class="toggle-track"></span>
          </label>
        </label>
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)">
          Lock
          <label class="toggle-switch">
            <input type="checkbox" data-layer="${key}" data-prop="locked" ${val.locked ? 'checked' : ''}/>
            <span class="toggle-track"></span>
          </label>
        </label>
        <input type="text" data-layer="${key}" data-prop="label" value="${val.label || key}"
          style="width:110px;font-size:12px" placeholder="Etiqueta"/>
      </div>
    </div>
  `).join('');

  host.querySelectorAll('input[data-layer]').forEach(inp => {
    inp.addEventListener('change', () => {
      const { layer, prop } = inp.dataset;
      if (!_cfg.layers[layer]) _cfg.layers[layer] = {};
      _cfg.layers[layer][prop] = inp.type === 'checkbox' ? inp.checked : inp.value;
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
    </div>
  `;
}

function bindElementTree(host) {
  let dragId   = null;  // id of dragged element
  let dragSrc  = null;  // source .elem-item node
  let dragCat  = null;  // source category key

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
    setVal(`${key}-cooldown`,      m.cooldownDays ?? 1);

    // Populate trigger select dynamically
    const trigSel = document.getElementById(`${key}-trigger`);
    if (trigSel) {
      trigSel.innerHTML = triggerOptionsHTML(m.trigger || 'onload');
      trigSel.addEventListener('change', () => { setMsgCfg(key, 'trigger', trigSel.value); markDirty(); });
    }

    bindCheck(`${key}-enabled`,   v => setMsgCfg(key, 'enabled', v));
    bindField(`${key}-title`,     v => setMsgCfg(key, 'title', v));
    bindField(`${key}-text`,      v => setMsgCfg(key, 'text', v));
    bindField(`${key}-cancelBtn`, v => setMsgCfg(key, 'cancelBtn', v));
    bindField(`${key}-acceptBtn`, v => setMsgCfg(key, 'acceptBtn', v));
    bindField(`${key}-cooldown`,  v => setMsgCfg(key, 'cooldownDays', Number(v)));
  });
}

function setMsgCfg(key, prop, val) {
  if (!_cfg.messages) _cfg.messages = {};
  if (!_cfg.messages[key]) _cfg.messages[key] = {};
  _cfg.messages[key][prop] = val;
  markDirty();
}

// ── Texto y colores ────────────────────────────────────────────

function renderTexto() {
  const t = _cfg.typography || {};
  const c = _cfg.colors     || {};
  const b = _cfg.buttons    || {};

  setVal('typo-display', t.displayFont || '');
  setVal('typo-body',    t.bodyFont    || '');
  setVal('typo-mono',    t.monoFont    || '');
  setVal('btn-radius',   b.borderRadius || '8px');

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

  bindField('typo-display',    v => setNestedCfg('typography.displayFont', v));
  bindField('typo-body',       v => setNestedCfg('typography.bodyFont', v));
  bindField('typo-mono',       v => setNestedCfg('typography.monoFont', v));
  bindField('color-primary',   v => setNestedCfg('colors.primary', v));
  bindField('color-secondary', v => setNestedCfg('colors.secondary', v));
  bindField('color-accent',    v => setNestedCfg('colors.accent', v));
  bindField('color-surface',   v => setNestedCfg('colors.surface', v));
  bindField('color-text',      v => setNestedCfg('colors.text', v));
  bindField('btn-radius',      v => setNestedCfg('buttons.borderRadius', v));

  document.getElementById('btn-preview-colors')?.addEventListener('click', () => {
    const root = document.documentElement;
    if (c.surface)  root.style.setProperty('--bg', c.surface);
    if (c.text)     root.style.setProperty('--text', c.text);
    if (t.displayFont) root.style.setProperty('--font-display', t.displayFont);
    if (t.bodyFont)    root.style.setProperty('--font-body',    t.bodyFont);
    toast('Previsualización aplicada al dashboard');
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

/* ─────────────────────────────────────────────────────────
   TEMPLATE MANAGER — Guardar / Cargar plantillas JSON
   · 'base'    → venue/masia; ítems locked+isBase
   · 'planning'→ layout usuario; selección interactiva
   · Naming: LugarEvento_NombrePlantilla_Kind_Date.escale.json
   ───────────────────────────────────────────────────────── */

import { AppState }           from '../core/AppState.js';
import { SceneManager }       from '../scene/SceneManager.js';
import { UIManager }          from '../ui/UIManager.js';
import { PlanningRegistry }   from './PlanningRegistry.js';
import { OrgContentManager }  from '../services/OrgContentManager.js';

const TEMPLATE_VERSION = '1.0';
const FOLDER_HANDLE_DB = 'escale_template_folder';

// ── Metas ─────────────────────────────────────────────────
let currentTemplateMeta = { name: 'Escena actual', source: 'scene' };
let currentBaseMeta     = { name: 'Sin plantilla base', filename: null };
let currentPlanningMeta = { name: 'Sin planning',       filename: null };

// ── Carpeta y caché ───────────────────────────────────────
let dirHandle       = null;
let cachedTemplates = { base: [], planning: [], full: [] };

// ── Modo selección planning ───────────────────────────────
let selMode = { active: false, venue: '', name: '', selIds: new Set() };

/* ═══════════════════════════════════════════════════════
   META HELPERS
   ═══════════════════════════════════════════════════════ */
function emitTemplateMetaChange() {
  const detail = getCurrentTemplateMeta();
  document.dispatchEvent(new CustomEvent('escale:template-meta-changed', { detail }));
  return detail;
}
function setCurrentTemplateMeta(next = {}) {
  currentTemplateMeta = { ...currentTemplateMeta, ...next };
  emitTemplateMetaChange();
}
function getCurrentTemplateMeta() {
  const fallback = document.getElementById('inventory-event-name')?.value?.trim() || 'Escena actual';
  return {
    ...currentTemplateMeta,
    name: currentTemplateMeta.name || fallback,
    baseName:     currentBaseMeta.name,
    planningName: currentPlanningMeta.name
  };
}

/* ═══════════════════════════════════════════════════════
   NAMING HELPERS
   ═══════════════════════════════════════════════════════ */
function safeStr(s, maxLen = 40) {
  return String(s || '')
    .trim()
    .replace(/[^\w\sáéíóúÁÉÍÓÚñÑ-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, maxLen);
}

function buildFilename(kind, venue, tplName) {
  const v    = safeStr(venue);
  const n    = safeStr(tplName);
  const k    = kind === 'base' ? 'Base' : kind === 'planning' ? 'Planning' : 'Full';
  const date = new Date().toISOString().slice(0, 10);
  return [v, n, k, date].filter(Boolean).join('_') + '.escale.json';
}

/** Devuelve { venue, name } o null si el usuario cancela */
async function promptForNaming(kind) {
  let venue   = String(AppState.company?.venue || '').trim();
  let tplName = String(document.getElementById('inventory-event-name')?.value || '').trim();

  if (!venue) {
    const r = prompt('Lugar del evento\n(ej: Masia Can Roca, Hotel Palace...)');
    if (r === null) return null;
    venue = r.trim();
    if (!venue) return null;
    // Persistir en el perfil de empresa
    if (AppState.company) AppState.company.venue = venue;
    try { localStorage.setItem('escale_company', JSON.stringify(AppState.company)); } catch {}
  }

  if (!tplName) {
    const label = kind === 'base' ? 'Base' : 'Planning';
    const r = prompt(`Nombre de la plantilla ${label}\n(ej: Boda Verano, Cumpleaños Luis...)`);
    if (r === null) return null;
    tplName = r.trim();
    if (!tplName) return null;
    const inp = document.getElementById('inventory-event-name');
    if (inp) inp.value = tplName;
  }

  return { venue, name: tplName };
}

/* ═══════════════════════════════════════════════════════
   FOLDER — Seleccionar y persistir carpeta
   ═══════════════════════════════════════════════════════ */
async function pickFolder() {
  if (!window.showDirectoryPicker) {
    alert('Tu navegador no soporta acceso a carpetas locales.\nUsa Chrome / Edge 86+.');
    return;
  }
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveFolderHandle(dirHandle);
    await refreshFolderState();
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[TemplateManager] pickFolder:', err);
  }
}

function saveFolderHandle(handle) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('escale_fs', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put(handle, FOLDER_HANDLE_DB);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = reject;
    };
    req.onerror = reject;
  });
}

function loadFolderHandle() {
  return new Promise((resolve) => {
    const req = indexedDB.open('escale_fs', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
    req.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('handles', 'readonly');
      const r  = tx.objectStore('handles').get(FOLDER_HANDLE_DB);
      r.onsuccess = () => { db.close(); resolve(r.result || null); };
      r.onerror   = () => { db.close(); resolve(null); };
    };
    req.onerror = () => resolve(null);
  });
}

async function verifyPermission(handle, mode = 'readwrite') {
  try {
    if (await handle.queryPermission({ mode }) === 'granted') return true;
    return await handle.requestPermission({ mode }) === 'granted';
  } catch { return false; }
}

async function scanFolder() {
  if (!dirHandle) return;
  cachedTemplates = { base: [], planning: [], full: [] };
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file' || !name.endsWith('.escale.json')) continue;
    try {
      const data  = JSON.parse(await (await handle.getFile()).text());
      const kind  = name.includes('Base') ? 'base'
                  : name.includes('Planning') ? 'planning'
                  : (data.kind || 'full');
      const entry = { name: data.name || name.replace(/\.escale\.json$/, ''), filename: name, handle, kind, createdAt: data.createdAt || null };
      if (kind === 'base')          cachedTemplates.base.push(entry);
      else if (kind === 'planning') cachedTemplates.planning.push(entry);
      else                          cachedTemplates.full.push(entry);
    } catch {}
  }
  const byDate = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
  cachedTemplates.base.sort(byDate);
  cachedTemplates.planning.sort(byDate);
}

async function refreshFolderState() {
  await scanFolder();
  renderFolderPath();
  renderTemplateList('base');
  renderTemplateList('planning');
  emitTemplateMetaChange();
}

function renderFolderPath() {
  const el = document.getElementById('template-folder-path');
  if (el) el.textContent = dirHandle ? dirHandle.name : 'Sin carpeta · clic para seleccionar';
}

/* ═══════════════════════════════════════════════════════
   LISTAS — Renderizado y filtrado
   ═══════════════════════════════════════════════════════ */
function renderTemplateList(kind, filter = '') {
  const listEl = document.getElementById(`tpl-${kind}-list`);
  if (!listEl) return;
  if (!dirHandle) { listEl.innerHTML = '<div class="tpl-empty">Selecciona una carpeta primero</div>'; return; }

  const all    = cachedTemplates[kind] || [];
  const needle = filter.trim().toLowerCase();
  const items  = needle ? all.filter(t => t.name.toLowerCase().includes(needle)) : all;

  if (!items.length) {
    listEl.innerHTML = needle
      ? `<div class="tpl-empty">Sin resultados para "${filter}"</div>`
      : `<div class="tpl-empty">No hay plantillas ${kind === 'base' ? 'base' : 'planning'} aquí</div>`;
    return;
  }

  const active = kind === 'base' ? currentBaseMeta.filename : currentPlanningMeta.filename;
  listEl.innerHTML = '';
  items.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'tpl-item' + (entry.filename === active ? ' is-active' : '');
    const date = entry.createdAt
      ? new Date(entry.createdAt).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' })
      : '';
    div.innerHTML = `<span class="tpl-item-name" title="${entry.name}">${entry.name}</span>${date ? `<span class="tpl-item-date">${date}</span>` : ''}`;
    div.addEventListener('click', () => handleTemplateItemClick(entry, kind));
    listEl.appendChild(div);
  });
}

/* ═══════════════════════════════════════════════════════
   CLICK EN ITEM
   ═══════════════════════════════════════════════════════ */
async function handleTemplateItemClick(entry, kind) {
  try {
    const data = JSON.parse(await (await entry.handle.getFile()).text());
    if (kind === 'base') await promptAndApplyBase(data, entry);
    else                 await promptAndApplyPlanning(data, entry);
    closePillPanels();
  } catch (err) {
    console.error('[TemplateManager]', err);
    alert('Error al cargar la plantilla:\n' + (err.message || err));
  }
}

async function promptAndApplyBase(data, entry) {
  const hasUser = AppState.items.some(i => !i.isBase);
  let mode = 'replace';
  if (hasUser) {
    const ok = confirm(
      `Cargar base "${data.name || entry.name}":\n\n` +
      `· OK       → Reemplazar toda la escena\n` +
      `· Cancelar → Conservar mi planning`
    );
    mode = ok ? 'replace' : 'merge';
  }
  await applyBaseTemplate(data, mode);
  currentBaseMeta = { name: data.name || entry.name, filename: entry.filename };
  const c = data.items?.length ?? 0;
  setCurrentTemplateMeta({ name: data.name || entry.name, source: 'loaded' });
  showToast(`Base "${currentBaseMeta.name}" cargada — ${c} elemento${c !== 1 ? 's' : ''}`);
  renderTemplateList('base');
}

async function promptAndApplyPlanning(data, entry) {
  if (AppState.items.length > 0 && !confirm(`Cargar planning "${data.name || entry.name}"?\n\nSe añadirá sobre la escena actual.`)) return;
  const mode = AppState.items.some(i => i.isBase) ? 'add' : 'replace';
  await applyPlanningTemplate(data, mode);
  currentPlanningMeta = { name: data.name || entry.name, filename: entry.filename };
  const c = data.items?.length ?? 0;
  setCurrentTemplateMeta({ name: data.name || entry.name, source: 'loaded' });
  showToast(`Planning "${currentPlanningMeta.name}" cargado — ${c} elemento${c !== 1 ? 's' : ''}`);
  renderTemplateList('planning');

  setTimeout(() => showPlanningImportInfo(), 1200);
}

function showPlanningImportInfo() {
  let card = document.getElementById('escale-planning-import-info');
  if (card) { card.remove(); }
  card = document.createElement('div');
  card.id = 'escale-planning-import-info';
  card.style.cssText = [
    'position:fixed', 'bottom:90px', 'left:50%', 'transform:translateX(-50%)',
    'z-index:400', 'background:#1a1a1c', 'color:#f5f3ee',
    'padding:14px 22px', 'border-radius:12px', 'max-width:380px', 'width:calc(100vw - 32px)',
    'font-family:"Inter Tight",sans-serif', 'font-size:12.5px', 'line-height:1.55',
    'box-shadow:0 8px 32px rgba(0,0,0,0.35)', 'cursor:pointer',
    'display:flex', 'align-items:flex-start', 'gap:12px'
  ].join(';');
  card.innerHTML = `
    <span style="font-size:18px;flex-shrink:0">📐</span>
    <div>
      <div style="font-weight:700;margin-bottom:4px">Verifica la escala del plano</div>
      <div style="opacity:0.72;font-size:11.5px">Si no has calibrado el plano con este planning, usa la herramienta de calibración para reescalar y que las medidas coincidan.</div>
    </div>
  `;
  card.addEventListener('click', () => card.remove());
  document.body.appendChild(card);
  setTimeout(() => card?.remove(), 9000);
}

/* ═══════════════════════════════════════════════════════
   SERIALIZAR
   ═══════════════════════════════════════════════════════ */
function serializeItems(sourceItems, { markBase = false } = {}) {
  return sourceItems.map(item => {
    const clean = JSON.parse(JSON.stringify(item));
    delete clean._mesh; delete clean._group;
    if (markBase) { clean.isBase = true; clean.locked = true; }
    return clean;
  });
}

function buildData(kind, items, opts = {}) {
  // El grid global nunca se exporta (cada escena mantiene el suyo).
  // Las zonas sí incluyen su gridConfig dentro de sus items.
  // El plano (imagen) no se guarda en plantillas de tipo 'planning'.
  const includePlanImage = kind !== 'planning';
  return {
    version:    TEMPLATE_VERSION,
    appVersion: 'E4c',
    kind,
    createdAt:  new Date().toISOString(),
    name:       opts.name || document.getElementById('inventory-event-name')?.value || 'Sin nombre',
    items,
    plan: {
      widthM:  AppState.plan.widthM,
      lengthM: AppState.plan.lengthM,
      opacity: AppState.plan.opacity,
      ...(includePlanImage && { imageDataURL: getPlanImageDataURL() })
    },
    camera:  AppState.camera,
    snap:    { ...AppState.snap },
    cotas:   AppState.showCotas,
    shadows: AppState.shadows
  };
}

function serialize(opts = {}) {
  const { kind = 'full', onlyPlanning = false, markBase = false } = opts;
  const src = onlyPlanning ? AppState.items.filter(i => !i.isBase) : AppState.items;
  return buildData(kind, serializeItems(src, { markBase }));
}

function getPlanImageDataURL() {
  if (!AppState.plan.texture?.image) return null;
  try {
    const img = AppState.plan.texture.image;
    const c   = document.createElement('canvas');
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  } catch { return null; }
}

/* ═══════════════════════════════════════════════════════
   GUARDAR
   ═══════════════════════════════════════════════════════ */
async function saveAsBase() {
  const naming = await promptForNaming('base');
  if (!naming) return;

  const data  = buildData('base', serializeItems(AppState.items, { markBase: true }), { name: naming.name });
  const fname = buildFilename('base', naming.venue, naming.name);
  const savedName = await saveWithPicker(data, fname);
  if (!savedName) return;

  currentBaseMeta = { name: naming.name, filename: savedName };
  setCurrentTemplateMeta({ name: naming.name, source: 'saved' });
  emitTemplateMetaChange();
  if (dirHandle) await refreshFolderState();

  // Sync en nube si hay organización
  _syncTemplateToCloud('base', naming.name, data);

  showPostSaveInfo('base');
  highlightTemplateButton();
}

async function saveWithPicker(data, suggestedName) {
  if (dirHandle && window.showSaveFilePicker) {
    try {
      const fh = await window.showSaveFilePicker({
        suggestedName,
        startIn: dirHandle,
        types: [{ description: 'Plantilla E-Scale', accept: { 'application/json': ['.json'] } }]
      });
      const ws = await fh.createWritable();
      await ws.write(JSON.stringify(data, null, 2));
      await ws.close();
      showToast(`Guardado: ${fh.name}`);
      return fh.name;
    } catch (err) {
      if (err.name === 'AbortError') return null;
      console.warn('[TemplateManager] showSaveFilePicker falló, descargando:', err);
    }
  }
  await writeToFolderOrDownload(data, suggestedName);
  return suggestedName;
}

async function savePlanning() {
  const naming = await promptForNaming('planning');
  if (!naming) return;
  // Entra en modo selección interactiva
  enterSelectionMode(naming.venue, naming.name);
}

function save() {
  const data = serialize({ kind: 'full' });
  const fname = buildFilename('full',
    AppState.company?.venue || '',
    document.getElementById('inventory-event-name')?.value || 'escena'
  );
  downloadJson(data, fname);
  setCurrentTemplateMeta({ name: data.name || 'Escena actual', source: 'saved' });
  showToast(`Exportado: ${fname}`);
}

async function writeToFolderOrDownload(data, fname) {
  if (dirHandle) {
    try {
      if (!await verifyPermission(dirHandle, 'readwrite')) throw new Error('Sin permiso');
      const fh = await dirHandle.getFileHandle(fname, { create: true });
      const ws = await fh.createWritable();
      await ws.write(JSON.stringify(data, null, 2));
      await ws.close();
      showToast(`Guardado: ${fname}`);
      return;
    } catch (err) { console.warn('[TemplateManager] folder write failed, downloading:', err); }
  }
  downloadJson(data, fname);
  showToast(`Descargado: ${fname}`);
}

function downloadJson(data, fname) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: fname });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════
   MODO SELECCIÓN PLANNING
   ═══════════════════════════════════════════════════════ */
function enterSelectionMode(venue, name) {
  selMode = { active: true, venue, name, selIds: new Set() };

  // Vista cenital
  SceneManager.setCamera?.('top');
  document.getElementById('cam-top')?.classList.add('active');
  document.getElementById('cam-iso')?.classList.remove('active');

  // Cursor crosshair + clase en body
  document.body.classList.add('planning-select-mode');

  // Limpiar selección actual
  AppState.selectedIds.clear();
  AppState.selectedId = null;
  UIManager.refresh?.();

  // Mostrar banner
  document.getElementById('planning-selection-banner')?.classList.remove('hidden');
  updateSelectionCount();

  // Escuchar clicks en el canvas para tracking manual
  document.getElementById('scene-canvas')?.addEventListener('click', _onCanvasClickInSelMode, true);
  // Escuchar cambios en AppState.selectedIds (vía evento si existe, o polling)
  document.addEventListener('escale:selection-changed', _onSelectionChanged);
  // Tecla Enter para confirmar
  document.addEventListener('keydown', _onSelKeydown);

  document.dispatchEvent(new CustomEvent('escale:planning-selection-start'));
}

function exitSelectionMode() {
  selMode.active = false;
  document.body.classList.remove('planning-select-mode');
  document.getElementById('planning-selection-banner')?.classList.add('hidden');
  document.getElementById('scene-canvas')?.removeEventListener('click', _onCanvasClickInSelMode, true);
  document.removeEventListener('escale:selection-changed', _onSelectionChanged);
  document.removeEventListener('keydown', _onSelKeydown);
  document.dispatchEvent(new CustomEvent('escale:planning-selection-end'));
}

function _onSelKeydown(e) {
  if (!selMode.active) return;
  if (e.key === 'Enter')  { e.preventDefault(); confirmPlanningSelection(); }
  if (e.key === 'Escape') { e.preventDefault(); exitSelectionMode(); }
}

function _onSelectionChanged() {
  if (!selMode.active) return;
  // Sync selIds con la selección actual de la escena
  AppState.selectedIds.forEach(id => selMode.selIds.add(id));
  updateSelectionCount();
}

function _onCanvasClickInSelMode(e) {
  if (!selMode.active) return;
  // La escena maneja el Shift+Click → en el siguiente tick leemos selectedIds
  setTimeout(() => {
    if (!selMode.active) return;
    AppState.selectedIds.forEach(id => selMode.selIds.add(id));
    updateSelectionCount();
  }, 50);
}

function updateSelectionCount() {
  const el = document.getElementById('planning-sel-count');
  if (!el) return;
  const n = selMode.selIds.size;
  el.textContent = n === 0
    ? 'Sin selección (se guardarán todos los no bloqueados)'
    : `${n} elemento${n !== 1 ? 's' : ''} seleccionado${n !== 1 ? 's' : ''}`;
}

async function confirmPlanningSelection() {
  if (!selMode.active) return;

  const { venue, name, selIds } = selMode;
  exitSelectionMode();

  // Determinar ítems a guardar
  let itemsSrc;
  if (selIds.size > 0) {
    itemsSrc = AppState.items.filter(i => selIds.has(i.id) && !i.isBase);
    if (itemsSrc.length === 0) {
      showToast('⚠ Los elementos seleccionados son de base o no existen');
      return;
    }
  } else {
    // Sin selección → guardar todos los no-base
    itemsSrc = AppState.items.filter(i => !i.isBase);
  }

  if (itemsSrc.length === 0) {
    showToast('⚠ No hay elementos de planning para guardar');
    return;
  }

  const items = itemsSrc.map(item => {
    const clean = JSON.parse(JSON.stringify(item));
    delete clean._mesh; delete clean._group; delete clean.locked;
    clean.isBase = false;
    return clean;
  });

  const data  = buildData('planning', items, { name });
  const fname = buildFilename('planning', venue, name);
  const savedName = await saveWithPicker(data, fname);
  if (!savedName) return;

  currentPlanningMeta = { name, filename: savedName };
  setCurrentTemplateMeta({ name, source: 'saved' });
  emitTemplateMetaChange();
  if (dirHandle) await refreshFolderState();

  // Sync en nube si hay organización
  _syncTemplateToCloud('planning', name, data);

  showPostSaveInfo('planning');
  highlightTemplateButton();
}

/* ═══════════════════════════════════════════════════════
   SYNC EN NUBE (OrgContentManager)
   ═══════════════════════════════════════════════════════ */

async function _syncTemplateToCloud(kind, name, data) {
  if (!OrgContentManager.canSync()) return;
  try {
    const result = await OrgContentManager.saveTemplate({ name, kind, data });
    if (result?.skipped) {
      showToast(`Ya existe "${name}" en la biblioteca de empresa (omitido)`);
    } else if (result) {
      showToast(`"${name}" compartido con la empresa`);
      // Refrescar panel para que aparezca inmediatamente
      await _renderOrgTemplateSection(kind);
    }
  } catch (err) {
    console.warn('[TemplateManager] No se pudo sincronizar en nube:', err.message);
  }
}

async function _renderOrgTemplateSection(kind) {
  const listEl = document.getElementById(`tpl-${kind}-list`);
  if (!listEl) return;

  const cloudItems = await OrgContentManager.listTemplates(kind);
  if (!cloudItems.length) return;

  // Eliminar sección previa si existe
  listEl.querySelector('.tpl-org-section')?.remove();

  const section = document.createElement('div');
  section.className = 'tpl-org-section';
  section.innerHTML = `<div class="tpl-org-header">
    <i data-lucide="building-2" style="width:11px;height:11px;opacity:.5"></i>
    <span>Empresa</span>
  </div>`;

  cloudItems.forEach(row => {
    const date = row.created_at ? new Date(row.created_at).toLocaleDateString('es') : '';
    const btn = document.createElement('button');
    btn.className = 'tpl-item';
    btn.type = 'button';
    btn.innerHTML = `
      <span class="tpl-item-name">${_esc(row.name)}</span>
      <span class="tpl-item-meta">${_esc(row.created_by_display_name || '')} ${date}</span>
    `;
    btn.addEventListener('click', () => _applyCloudTemplate(row.id, row.name, row.kind));
    section.appendChild(btn);
  });

  listEl.prepend(section);
  if (window.lucide) lucide.createIcons({ nodes: [section] });
}

async function _applyCloudTemplate(id, name, kind) {
  const row = await OrgContentManager.loadTemplate(id);
  if (!row?.data) { showToast('⚠ No se pudo cargar la plantilla de empresa'); return; }
  const data = row.data;
  data.name = data.name || name;
  if (kind === 'base') {
    await promptAndApplyBase(data, { name, filename: null });
  } else {
    await promptAndApplyPlanning(data, { name, filename: null });
  }
}

function _esc(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/* ═══════════════════════════════════════════════════════
   FEEDBACK POST-GUARDADO
   ═══════════════════════════════════════════════════════ */
function showPostSaveInfo(kind) {
  const label = kind === 'base' ? 'Base' : 'Planning';
  let container = document.getElementById('escale-post-save-card');
  if (!container) {
    container = document.createElement('div');
    container.id = 'escale-post-save-card';
    container.style.cssText = [
      'position:fixed', 'bottom:90px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:400', 'background:#1a1a1c', 'color:#f5f3ee',
      'padding:14px 22px', 'border-radius:12px',
      'font-family:"JetBrains Mono",monospace', 'font-size:11.5px',
      'line-height:1.5', 'text-align:center',
      'box-shadow:0 8px 32px rgba(0,0,0,0.35)',
      'border:1px solid rgba(255,255,255,0.12)',
      'backdrop-filter:blur(16px)',
      'opacity:0', 'transition:opacity 0.35s'
    ].join(';');
    document.body.appendChild(container);
  }
  container.innerHTML = `✓ <strong>${label} guardada</strong><br><span style="opacity:0.7">Encuéntrala en el botón <strong>Plantilla</strong> del menú superior</span>`;
  requestAnimationFrame(() => { container.style.opacity = '1'; });
  clearTimeout(container._t);
  container._t = setTimeout(() => {
    container.style.opacity = '0';
    setTimeout(() => container.remove(), 400);
  }, 5000);
}

function highlightTemplateButton() {
  const btn = document.getElementById('btn-template-menu');
  if (!btn) return;
  btn.classList.remove('tpl-btn-highlight');
  void btn.offsetWidth; // reflow para reiniciar animación
  btn.classList.add('tpl-btn-highlight');
  setTimeout(() => btn.classList.remove('tpl-btn-highlight'), 15000);
}

/* ═══════════════════════════════════════════════════════
   CARGAR — Legado file picker
   ═══════════════════════════════════════════════════════ */
function load() {
  const input = document.getElementById('file-template');
  if (!input) return;
  input.value = ''; input.click();
}

async function handleFileLoad(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = '';
  try {
    const data = JSON.parse(await file.text());
    if (!data.version || !Array.isArray(data.items)) throw new Error('Archivo no válido.');
    const c = data.items.length;
    const kl = data.kind === 'base' ? '[BASE] ' : data.kind === 'planning' ? '[PLANNING] ' : '';
    if (!confirm(`¿Cargar ${kl}"${data.name || 'Sin nombre'}"?\n${c} elemento${c !== 1 ? 's' : ''}.\n\n⚠ Se reemplazará la escena actual.`)) return;

    PlanningRegistry.record('import');
    if (data.kind === 'base')          { await applyBaseTemplate(data, 'replace'); currentBaseMeta = { name: data.name || file.name, filename: null }; }
    else if (data.kind === 'planning') { await applyPlanningTemplate(data, 'replace'); currentPlanningMeta = { name: data.name || file.name, filename: null }; }
    else                               { await applyTemplate(data); }

    setCurrentTemplateMeta({ name: data.name || file.name.replace(/\.(escale\.)?json$/i, ''), source: 'loaded' });
    showToast(`Cargada — ${c} elemento${c !== 1 ? 's' : ''}`);
  } catch (err) {
    alert('Error al cargar:\n' + (err.message || err));
  }
}

/* ═══════════════════════════════════════════════════════
   APLICAR PLANTILLAS
   ═══════════════════════════════════════════════════════ */
async function applyBaseTemplate(data, mode = 'replace') {
  AppState._suppressHistory = true;
  if (mode === 'replace') {
    [...AppState.items].forEach(i => SceneManager.removeItem(i.id));
    AppState.items = []; AppState.selectedIds.clear(); AppState.selectedId = null;
    AppState.nextId = 1; AppState.history = [];
  } else {
    [...AppState.items].filter(i => i.isBase).forEach(i => { SceneManager.removeItem(i.id); AppState.items = AppState.items.filter(x => x.id !== i.id); });
    AppState.selectedIds.clear(); AppState.selectedId = null;
  }
  AppState._suppressHistory = false;
  if (mode === 'replace' && data.plan) await restorePlan(data);

  let maxId = AppState.items.reduce((m, i) => Math.max(m, i.id || 0), 0);
  const skipped = [];
  (data.items || []).forEach(d => {
    try {
      const item = { ...d, isBase: true, locked: true, x: d.x ?? 0, z: d.z ?? 0 };
      item.id = ++maxId; AppState.items.push(item); SceneManager.spawn(item);
    } catch { skipped.push(d.type || '?'); }
  });
  AppState.nextId = maxId + 1;
  if (mode === 'replace') restoreSettings(data);
  finishApply(skipped);
}

async function applyPlanningTemplate(data, mode = 'add') {
  AppState._suppressHistory = true;
  if (mode === 'replace') {
    [...AppState.items].forEach(i => SceneManager.removeItem(i.id));
    AppState.items = []; AppState.selectedIds.clear(); AppState.selectedId = null;
    AppState.nextId = 1; AppState.history = [];
  } else {
    [...AppState.items].filter(i => !i.isBase).forEach(i => { SceneManager.removeItem(i.id); AppState.items = AppState.items.filter(x => x.id !== i.id); });
    AppState.selectedIds.clear(); AppState.selectedId = null;
  }
  AppState._suppressHistory = false;

  let maxId = AppState.items.reduce((m, i) => Math.max(m, i.id || 0), 0);
  const skipped = [];
  (data.items || []).forEach(d => {
    try {
      const item = { ...d, isBase: false, x: d.x ?? 0, z: d.z ?? 0 };
      delete item.locked; item.id = ++maxId; AppState.items.push(item); SceneManager.spawn(item);
    } catch { skipped.push(d.type || '?'); }
  });
  AppState.nextId = maxId + 1;
  if (mode === 'replace') { await restorePlan(data); restoreSettings(data); }
  finishApply(skipped);
}

async function applyTemplate(data) {
  AppState._suppressHistory = true;
  [...AppState.items].forEach(i => SceneManager.removeItem(i.id));
  AppState.items = []; AppState.selectedIds.clear(); AppState.selectedId = null;
  AppState.nextId = 1; AppState.history = [];
  AppState._suppressHistory = false;
  if (data.plan) await restorePlan(data);

  let maxId = 0;
  const skipped = [];
  (data.items || []).forEach(d => {
    try {
      const item = { ...d, x: d.x ?? 0, z: d.z ?? 0 };
      if (item.locked === undefined) item.locked = false;
      const freshId = (item.id && item.id > maxId) ? item.id : ++maxId;
      if (freshId > maxId) maxId = freshId;
      item.id = freshId; AppState.items.push(item); SceneManager.spawn(item);
    } catch { skipped.push(d.type || '?'); }
  });
  AppState.nextId = maxId + 1;
  restoreSettings(data); finishApply(skipped);
}

async function restorePlan(data) {
  if (!data.plan) return;
  AppState.plan.widthM  = data.plan.widthM  ?? 30;
  AppState.plan.lengthM = data.plan.lengthM ?? 30;
  AppState.plan.opacity = data.plan.opacity  ?? 0.7;
  // El grid NO se restaura desde plantilla — cada escena mantiene su propio grid
  SceneManager.rebuildGrids();
  if (data.plan.imageDataURL) await loadPlanImage(data.plan.imageDataURL);
}

function restoreSettings(data) {
  // El grid NO se restaura desde plantilla
  if (data.snap) { AppState.snap.enabled = data.snap.enabled ?? true; AppState.snap.spacing = data.snap.spacing ?? 0.25; }
  if (data.cotas   !== undefined) AppState.showCotas = data.cotas;
  if (data.shadows !== undefined) AppState.shadows   = data.shadows;
  const ni = document.getElementById('inventory-event-name');
  if (ni && data.name) ni.value = data.name;
  if (data.camera) {
    SceneManager.setCamera(data.camera);
    document.getElementById('cam-iso')?.classList.toggle('active', data.camera === 'iso');
    document.getElementById('cam-top')?.classList.toggle('active', data.camera === 'top');
  }
}

function finishApply(skipped) {
  SceneManager.rebuildGrids(); SceneManager.setPlanLocked(AppState.grid?.locked === true);
  SceneManager.applyShadowState(); SceneManager.drawCotas();
  UIManager.refresh(); UIManager.hideDetail?.();
  const w = document.getElementById('welcome-modal');
  if (w) w.style.display = 'none';
  if (skipped.length) setTimeout(() => showToast(`⚠ ${skipped.length} elemento(s) no reconocido(s): ${[...new Set(skipped)].join(', ')}`, 5000), 1200);
}

function loadPlanImage(dataURL) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { const t = new THREE.Texture(img); t.needsUpdate = true; t.colorSpace = THREE.sRGBEncoding; SceneManager.setPlanTexture(t); resolve(); };
    img.onerror = () => resolve();
    img.src = dataURL;
  });
}

/* ═══════════════════════════════════════════════════════
   PILLS UI
   ═══════════════════════════════════════════════════════ */
function togglePillPanel(kind) {
  const other = kind === 'base' ? 'planning' : 'base';
  const panel = document.getElementById(`tpl-${kind}-panel`);
  const btn   = document.getElementById(`tpl-${kind}-btn`);
  const oPanel = document.getElementById(`tpl-${other}-panel`);
  const oBtn   = document.getElementById(`tpl-${other}-btn`);
  const isOpen = !panel?.classList.contains('hidden');
  oPanel?.classList.add('hidden'); oBtn?.classList.remove('open');
  panel?.classList.toggle('hidden', isOpen); btn?.classList.toggle('open', !isOpen);
  if (!isOpen) {
    renderTemplateList(kind);
    _renderOrgTemplateSection(kind); // cargar plantillas de empresa
    requestAnimationFrame(() => document.getElementById(`tpl-${kind}-filter`)?.focus());
  }
}

function closePillPanels() {
  ['base', 'planning'].forEach(k => {
    document.getElementById(`tpl-${k}-panel`)?.classList.add('hidden');
    document.getElementById(`tpl-${k}-btn`)?.classList.remove('open');
  });
}

/* ═══════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════ */
function showToast(msg, dur = 3000) {
  let c = document.getElementById('escale-toast');
  if (!c) { c = document.createElement('div'); c.id = 'escale-toast'; c.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:300;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:6px;'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.style.cssText = 'background:rgba(10,10,11,0.92);color:#f5f3ee;padding:10px 20px;border-radius:10px;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:0.04em;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);opacity:0;transform:translateY(8px);transition:opacity 0.3s,transform 0.3s;pointer-events:auto;white-space:nowrap;';
  t.textContent = msg; c.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; setTimeout(() => t.remove(), 350); }, dur);
}

/* ═══════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════ */
async function init() {
  // Legado
  document.getElementById('btn-save-template')?.addEventListener('click', save);
  document.getElementById('btn-load-template')?.addEventListener('click', load);
  document.getElementById('file-template')?.addEventListener('change', handleFileLoad);
  // welcome-plantilla se gestiona en main.js (flujo work-mode-modal → TemplateManager.load)

  // Botón carpeta
  document.querySelector('[data-template-action="pick-folder"]')?.addEventListener('click', async () => {
    await pickFolder();
  });

  // Pills — auto-pick folder if none selected yet
  document.getElementById('tpl-base-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    if (!dirHandle) { await pickFolder(); if (!dirHandle) return; }
    togglePillPanel('base');
  });
  document.getElementById('tpl-planning-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    if (!dirHandle) { await pickFolder(); if (!dirHandle) return; }
    togglePillPanel('planning');
  });
  document.getElementById('tpl-base-filter')?.addEventListener('input', e => renderTemplateList('base', e.target.value));
  document.getElementById('tpl-planning-filter')?.addEventListener('input', e => renderTemplateList('planning', e.target.value));

  // Cerrar panels al click fuera
  document.addEventListener('click', e => { if (!e.target.closest('.tpl-pill-wrap')) closePillPanels(); });

  // Modo selección
  document.getElementById('planning-sel-confirm')?.addEventListener('click', () => void confirmPlanningSelection());
  document.getElementById('planning-sel-cancel')?.addEventListener('click', () => exitSelectionMode());

  // Recuperar carpeta de IndexedDB
  try {
    const saved = await loadFolderHandle();
    if (saved && await verifyPermission(saved, 'readwrite')) { dirHandle = saved; await refreshFolderState(); }
  } catch {}

  emitTemplateMetaChange();
}

export const TemplateManager = {
  init,
  save, saveAsBase, savePlanning,
  load,
  pickFolder, refreshFolderState,
  serialize, applyTemplate, applyBaseTemplate, applyPlanningTemplate,
  showToast, closePillPanels, renderTemplateList,
  getCurrentTemplateMeta, setCurrentTemplateMeta,
  get currentBaseMeta()     { return currentBaseMeta; },
  get currentPlanningMeta() { return currentPlanningMeta; },
  get selectionModeActive() { return selMode.active; }
};

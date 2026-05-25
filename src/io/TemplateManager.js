/* ─────────────────────────────────────────────────────────
   TEMPLATE MANAGER — Guardar / Cargar plantillas JSON
   Soporta dos tipos: 'base' (venue/masia) y 'planning' (layout usuario)
   File System Access API para leer/escribir en carpeta del usuario.
   ───────────────────────────────────────────────────────── */

import { AppState }     from '../core/AppState.js';
import { SceneManager } from '../scene/SceneManager.js';
import { UIManager }    from '../ui/UIManager.js';

const TEMPLATE_VERSION = '1.0';
const FOLDER_HANDLE_DB = 'escale_template_folder';

// ── Metas de la escena actual ─────────────────────────────
let currentTemplateMeta = { name: 'Escena actual', source: 'scene' };
let currentBaseMeta     = { name: 'Sin plantilla base', filename: null };
let currentPlanningMeta = { name: 'Sin planning',       filename: null };

// ── Carpeta activa y caché ────────────────────────────────
let dirHandle       = null;
let cachedTemplates = { base: [], planning: [], full: [] };

/* ═══════════════════════════════════════════════════════
   META HELPERS
   ═══════════════════════════════════════════════════════ */
function emitTemplateMetaChange() {
  const detail = getCurrentTemplateMeta();
  document.dispatchEvent(new CustomEvent('escale:template-meta-changed', { detail }));
  return detail;
}

function setCurrentTemplateMeta(nextMeta = {}) {
  currentTemplateMeta = { ...currentTemplateMeta, ...nextMeta };
  emitTemplateMetaChange();
}

function getCurrentTemplateMeta() {
  const fallbackName = document.getElementById('inventory-event-name')?.value?.trim() || 'Escena actual';
  return {
    ...currentTemplateMeta,
    name: currentTemplateMeta.name || fallbackName,
    baseName:     currentBaseMeta.name,
    planningName: currentPlanningMeta.name
  };
}

/* ═══════════════════════════════════════════════════════
   FOLDER — Seleccionar y persistir carpeta
   ═══════════════════════════════════════════════════════ */

async function pickFolder() {
  if (!window.showDirectoryPicker) {
    alert('Tu navegador no soporta acceso a carpetas locales.\nUsa Chrome / Edge 86+ para esta función.');
    return;
  }
  try {
    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveFolderHandle(dirHandle);
    await refreshFolderState();
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[TemplateManager] Error al seleccionar carpeta:', err);
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
      const get = tx.objectStore('handles').get(FOLDER_HANDLE_DB);
      get.onsuccess = () => { db.close(); resolve(get.result || null); };
      get.onerror   = () => { db.close(); resolve(null); };
    };
    req.onerror = () => resolve(null);
  });
}

async function verifyPermission(handle, mode = 'readwrite') {
  try {
    const perm = await handle.queryPermission({ mode });
    if (perm === 'granted') return true;
    const req = await handle.requestPermission({ mode });
    return req === 'granted';
  } catch { return false; }
}

async function scanFolder() {
  if (!dirHandle) return;
  cachedTemplates = { base: [], planning: [], full: [] };

  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file') continue;
    if (!name.endsWith('.escale.json')) continue;
    try {
      const file = await handle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      const kind = data.kind || 'full';
      const entry = {
        name:      data.name || name.replace(/\.escale\.json$/, ''),
        filename:  name,
        handle,
        kind,
        createdAt: data.createdAt || null
      };
      if (kind === 'base')          cachedTemplates.base.push(entry);
      else if (kind === 'planning') cachedTemplates.planning.push(entry);
      else                          cachedTemplates.full.push(entry);
    } catch (err) {
      console.warn('[TemplateManager] No se pudo leer:', name, err);
    }
  }

  const byDate = (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
  cachedTemplates.base.sort(byDate);
  cachedTemplates.planning.sort(byDate);
  cachedTemplates.full.sort(byDate);
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
  if (el) el.textContent = dirHandle ? dirHandle.name : 'Sin carpeta seleccionada';
}

/* ═══════════════════════════════════════════════════════
   LISTAS — Renderizado y filtrado
   ═══════════════════════════════════════════════════════ */

function renderTemplateList(kind, filter = '') {
  const listEl = document.getElementById(`tpl-${kind}-list`);
  if (!listEl) return;

  if (!dirHandle) {
    listEl.innerHTML = '<div class="tpl-empty">Selecciona una carpeta primero</div>';
    return;
  }

  const allItems = cachedTemplates[kind] || [];
  const needle   = filter.trim().toLowerCase();
  const items    = needle ? allItems.filter(t => t.name.toLowerCase().includes(needle)) : allItems;

  if (items.length === 0) {
    listEl.innerHTML = needle
      ? `<div class="tpl-empty">Sin resultados para "${filter}"</div>`
      : `<div class="tpl-empty">No hay plantillas ${kind === 'base' ? 'base' : 'planning'} en esta carpeta</div>`;
    return;
  }

  const activeName = kind === 'base' ? currentBaseMeta.filename : currentPlanningMeta.filename;
  listEl.innerHTML = '';

  items.forEach(entry => {
    const div  = document.createElement('div');
    div.className = 'tpl-item' + (entry.filename === activeName ? ' is-active' : '');
    div.dataset.filename = entry.filename;

    const date = entry.createdAt
      ? new Date(entry.createdAt).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' })
      : '';

    div.innerHTML = `
      <span class="tpl-item-name" title="${entry.name}">${entry.name}</span>
      ${date ? `<span class="tpl-item-date">${date}</span>` : ''}
    `;
    div.addEventListener('click', () => handleTemplateItemClick(entry, kind));
    listEl.appendChild(div);
  });
}

/* ═══════════════════════════════════════════════════════
   CLICK EN ITEM — Carga la plantilla elegida
   ═══════════════════════════════════════════════════════ */

async function handleTemplateItemClick(entry, kind) {
  try {
    const file = await entry.handle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    if (kind === 'base')     await promptAndApplyBase(data, entry);
    else                     await promptAndApplyPlanning(data, entry);
    closePillPanels();
  } catch (err) {
    console.error('[TemplateManager] Error cargando plantilla:', err);
    alert('Error al cargar la plantilla:\n' + (err.message || err));
  }
}

async function promptAndApplyBase(data, entry) {
  const hasUserItems = AppState.items.some(i => !i.isBase);
  let mode = 'replace';

  if (hasUserItems) {
    const answer = confirm(
      `Cargar base "${data.name || entry.name}":\n\n` +
      `· OK        → Reemplazar toda la escena\n` +
      `· Cancelar  → Conservar mi planning (cambia solo la base)`
    );
    mode = answer ? 'replace' : 'merge';
  }

  await applyBaseTemplate(data, mode);
  currentBaseMeta = { name: data.name || entry.name, filename: entry.filename };
  const count = data.items?.length ?? 0;
  setCurrentTemplateMeta({ name: data.name || entry.name, source: 'loaded' });
  showToast(`Base "${currentBaseMeta.name}" cargada — ${count} elemento${count !== 1 ? 's' : ''}`);
  renderTemplateList('base');
}

async function promptAndApplyPlanning(data, entry) {
  if (AppState.items.length > 0) {
    const answer = confirm(
      `Cargar planning "${data.name || entry.name}":\n\n` +
      `· OK        → Añadir sobre la escena actual\n` +
      `· Cancelar  → Cancelar`
    );
    if (!answer) return;
  }

  const mode = AppState.items.some(i => i.isBase) ? 'add' : 'replace';
  await applyPlanningTemplate(data, mode);
  currentPlanningMeta = { name: data.name || entry.name, filename: entry.filename };
  const count = data.items?.length ?? 0;
  setCurrentTemplateMeta({ name: data.name || entry.name, source: 'loaded' });
  showToast(`Planning "${currentPlanningMeta.name}" cargado — ${count} elemento${count !== 1 ? 's' : ''}`);
  renderTemplateList('planning');
}

/* ═══════════════════════════════════════════════════════
   SERIALIZAR
   ═══════════════════════════════════════════════════════ */

function serialize(opts = {}) {
  const { kind = 'full', onlyPlanning = false, markBase = false } = opts;
  let sourceItems = onlyPlanning
    ? AppState.items.filter(i => !i.isBase)
    : AppState.items;

  const items = sourceItems.map(item => {
    const clean = JSON.parse(JSON.stringify(item));
    delete clean._mesh;
    delete clean._group;
    if (markBase) { clean.isBase = true; clean.locked = true; }
    return clean;
  });

  const plan = {
    widthM:       AppState.plan.widthM,
    lengthM:      AppState.plan.lengthM,
    opacity:      AppState.plan.opacity,
    imageDataURL: getPlanImageDataURL()
  };
  const grid = { ...(AppState.grid || {}) };

  return {
    version:    TEMPLATE_VERSION,
    appVersion: 'E4c',
    kind,
    createdAt:  new Date().toISOString(),
    name:       document.getElementById('inventory-event-name')?.value || 'Sin nombre',
    items, plan, grid,
    camera:  AppState.camera,
    snap:    { ...AppState.snap },
    cotas:   AppState.showCotas,
    shadows: AppState.shadows
  };
}

function getPlanImageDataURL() {
  if (!AppState.plan.texture?.image) return null;
  try {
    const img    = AppState.plan.texture.image;
    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth  || img.width;
    canvas.height = img.naturalHeight || img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('[TemplateManager] No se pudo serializar la imagen del plano:', e);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════
   GUARDAR — A carpeta o descarga directa
   ═══════════════════════════════════════════════════════ */

async function saveAsBase() {
  const data = serialize({ kind: 'base', markBase: true });
  await saveToFolderOrDownload(data);
  if (dirHandle) {
    currentBaseMeta = { name: data.name, filename: buildFilename(data) };
    await refreshFolderState();
    emitTemplateMetaChange();
  }
}

async function savePlanning() {
  const data = serialize({ kind: 'planning', onlyPlanning: true });
  await saveToFolderOrDownload(data);
  if (dirHandle) {
    currentPlanningMeta = { name: data.name, filename: buildFilename(data) };
    await refreshFolderState();
    emitTemplateMetaChange();
  }
}

function save() {
  const data = serialize({ kind: 'full' });
  downloadJson(data);
  setCurrentTemplateMeta({ name: data.name || 'Escena actual', source: 'saved' });
  showToast(`Plantilla exportada: ${buildFilename(data)}`);
}

async function saveToFolderOrDownload(data) {
  if (dirHandle) {
    try {
      const ok = await verifyPermission(dirHandle, 'readwrite');
      if (!ok) throw new Error('Sin permiso de escritura');
      const filename = buildFilename(data);
      const fh = await dirHandle.getFileHandle(filename, { create: true });
      const ws = await fh.createWritable();
      await ws.write(JSON.stringify(data, null, 2));
      await ws.close();
      showToast(`Guardado en carpeta: ${filename}`);
      return;
    } catch (err) {
      console.warn('[TemplateManager] Error guardando en carpeta, descargando:', err);
    }
  }
  downloadJson(data);
  showToast(`Plantilla descargada: ${buildFilename(data)}`);
}

function buildFilename(data) {
  const kind    = data.kind === 'base' ? 'base' : data.kind === 'planning' ? 'planning' : 'full';
  const safeName = (data.name || 'escale')
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  const ts = new Date().toISOString().slice(0, 10);
  return `${safeName}_${kind}_${ts}.escale.json`;
}

function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = buildFilename(data);
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════
   CARGAR — Legado: file picker
   ═══════════════════════════════════════════════════════ */

function load() {
  const input = document.getElementById('file-template');
  if (!input) return;
  input.value = '';
  input.click();
}

async function handleFileLoad(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = '';
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.version || !Array.isArray(data.items))
      throw new Error('El archivo no parece una plantilla E-scale válida.');

    const itemCount = data.items.length;
    const kindLabel = data.kind === 'base' ? '[BASE] ' : data.kind === 'planning' ? '[PLANNING] ' : '';
    const msg = `¿Cargar ${kindLabel}"${data.name || 'Sin nombre'}"?\n` +
                `${itemCount} elemento${itemCount !== 1 ? 's' : ''}.` +
                (data.plan?.imageDataURL ? ' + plano base.' : '') +
                '\n\n⚠ Se reemplazará la escena actual.';
    if (!confirm(msg)) return;

    if (data.kind === 'base') {
      await applyBaseTemplate(data, 'replace');
      currentBaseMeta = { name: data.name || file.name, filename: null };
    } else if (data.kind === 'planning') {
      await applyPlanningTemplate(data, 'replace');
      currentPlanningMeta = { name: data.name || file.name, filename: null };
    } else {
      await applyTemplate(data);
    }

    setCurrentTemplateMeta({
      name:   data.name || file.name.replace(/\.(escale\.)?json$/i, ''),
      source: 'loaded'
    });
    showToast(`Plantilla cargada — ${itemCount} elemento${itemCount !== 1 ? 's' : ''}`);
  } catch (err) {
    console.error('[TemplateManager] Error cargando:', err);
    alert('Error al cargar la plantilla:\n' + (err.message || err));
  }
}

/* ═══════════════════════════════════════════════════════
   APLICAR PLANTILLAS
   ═══════════════════════════════════════════════════════ */

async function applyBaseTemplate(data, mode = 'replace') {
  AppState._suppressHistory = true;
  if (mode === 'replace') {
    [...AppState.items].forEach(i => SceneManager.removeItem(i.id));
    AppState.items = []; AppState.selectedIds.clear();
    AppState.selectedId = null; AppState.nextId = 1; AppState.history = [];
  } else {
    // merge: eliminar solo los items isBase actuales
    [...AppState.items].filter(i => i.isBase).forEach(i => {
      SceneManager.removeItem(i.id);
      AppState.items = AppState.items.filter(x => x.id !== i.id);
    });
    AppState.selectedIds.clear(); AppState.selectedId = null;
  }
  AppState._suppressHistory = false;

  if (mode === 'replace' && data.plan) await restorePlan(data);

  let maxId = AppState.items.reduce((m, i) => Math.max(m, i.id || 0), 0);
  const skipped = [];
  (data.items || []).forEach(itemData => {
    try {
      const item = { ...itemData, isBase: true, locked: true };
      if (item.x === undefined) item.x = 0;
      if (item.z === undefined) item.z = 0;
      item.id = ++maxId;
      AppState.items.push(item);
      SceneManager.spawn(item);
    } catch (err) {
      console.warn('[TemplateManager] Item saltado:', itemData, err);
      skipped.push(itemData.type || 'desconocido');
    }
  });
  AppState.nextId = maxId + 1;
  if (mode === 'replace') restoreSettings(data);
  finishApply(skipped);
}

async function applyPlanningTemplate(data, mode = 'add') {
  AppState._suppressHistory = true;
  if (mode === 'replace') {
    [...AppState.items].forEach(i => SceneManager.removeItem(i.id));
    AppState.items = []; AppState.selectedIds.clear();
    AppState.selectedId = null; AppState.nextId = 1; AppState.history = [];
  } else {
    // add: eliminar solo el planning anterior (no-base)
    [...AppState.items].filter(i => !i.isBase).forEach(i => {
      SceneManager.removeItem(i.id);
      AppState.items = AppState.items.filter(x => x.id !== i.id);
    });
    AppState.selectedIds.clear(); AppState.selectedId = null;
  }
  AppState._suppressHistory = false;

  let maxId = AppState.items.reduce((m, i) => Math.max(m, i.id || 0), 0);
  const skipped = [];
  (data.items || []).forEach(itemData => {
    try {
      const item = { ...itemData, isBase: false };
      delete item.locked;
      if (item.x === undefined) item.x = 0;
      if (item.z === undefined) item.z = 0;
      item.id = ++maxId;
      AppState.items.push(item);
      SceneManager.spawn(item);
    } catch (err) {
      console.warn('[TemplateManager] Item saltado:', itemData, err);
      skipped.push(itemData.type || 'desconocido');
    }
  });
  AppState.nextId = maxId + 1;
  if (mode === 'replace') { await restorePlan(data); restoreSettings(data); }
  finishApply(skipped);
}

async function applyTemplate(data) {
  AppState._suppressHistory = true;
  [...AppState.items].forEach(i => SceneManager.removeItem(i.id));
  AppState.items = []; AppState.selectedIds.clear();
  AppState.selectedId = null; AppState.nextId = 1; AppState.history = [];
  AppState._suppressHistory = false;

  if (data.plan) await restorePlan(data);

  let maxId = 0;
  const skipped = [];
  (data.items || []).forEach(itemData => {
    try {
      const item = { ...itemData };
      if (item.x === undefined) item.x = 0;
      if (item.z === undefined) item.z = 0;
      if (item.locked === undefined) item.locked = false;
      const freshId = (item.id && item.id > maxId) ? item.id : ++maxId;
      item.id = freshId;
      if (freshId > maxId) maxId = freshId;
      AppState.items.push(item);
      SceneManager.spawn(item);
    } catch (err) {
      console.warn('[TemplateManager] Item saltado:', itemData, err);
      skipped.push(itemData.type || 'desconocido');
    }
  });
  AppState.nextId = maxId + 1;
  restoreSettings(data);
  finishApply(skipped);
}

async function restorePlan(data) {
  if (!data.plan) return;
  AppState.plan.widthM  = data.plan.widthM  ?? 30;
  AppState.plan.lengthM = data.plan.lengthM ?? 30;
  AppState.plan.opacity = data.plan.opacity ?? 0.7;
  const legacyOffsetX   = data.canvasArea?.offsetX ?? 0;
  const legacyOffsetZ   = data.canvasArea?.offsetZ ?? 0;
  AppState.grid = {
    ...(AppState.grid || {}), ...(data.grid || {}),
    offsetX: data.grid?.offsetX ?? legacyOffsetX,
    offsetZ: data.grid?.offsetZ ?? legacyOffsetZ
  };
  AppState.snap.spacing   = data.grid?.subSize ?? data.snap?.spacing ?? AppState.snap.spacing;
  AppState.grid.subSize   = AppState.grid.subSize  ?? AppState.snap.spacing;
  AppState.grid.majorSize = Math.max(AppState.grid.subSize, AppState.grid.majorSize ?? 1);
  SceneManager.rebuildGrids();
  if (data.plan.imageDataURL) await loadPlanImage(data.plan.imageDataURL);
}

function restoreSettings(data) {
  if (data.grid)  AppState.grid = { ...(AppState.grid || {}), ...data.grid };
  if (data.snap) {
    AppState.snap.enabled = data.snap.enabled ?? true;
    AppState.snap.spacing = data.snap.spacing ?? 0.25;
  }
  AppState.grid.subSize   = data.grid?.subSize ?? AppState.snap.spacing ?? AppState.grid.subSize;
  AppState.grid.majorSize = Math.max(AppState.grid.subSize, data.grid?.majorSize ?? AppState.grid.majorSize ?? 1);
  if (data.cotas   !== undefined) AppState.showCotas = data.cotas;
  if (data.shadows !== undefined) AppState.shadows   = data.shadows;
  const nameInput = document.getElementById('inventory-event-name');
  if (nameInput && data.name) nameInput.value = data.name;
  if (data.camera) {
    SceneManager.setCamera(data.camera);
    document.getElementById('cam-iso')?.classList.toggle('active', data.camera === 'iso');
    document.getElementById('cam-top')?.classList.toggle('active', data.camera === 'top');
  }
}

function finishApply(skipped) {
  SceneManager.rebuildGrids();
  SceneManager.setPlanLocked(AppState.grid?.locked === true);
  SceneManager.applyShadowState();
  SceneManager.drawCotas();
  UIManager.refresh();
  UIManager.hideDetail?.();
  const welcome = document.getElementById('welcome-modal');
  if (welcome) welcome.style.display = 'none';
  if (skipped.length > 0) {
    setTimeout(() => {
      showToast(`⚠ ${skipped.length} elemento(s) no reconocido(s): ${[...new Set(skipped)].join(', ')}`, 5000);
    }, 1200);
  }
}

function loadPlanImage(dataURL) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const texture = new THREE.Texture(img);
      texture.needsUpdate = true;
      texture.colorSpace = THREE.sRGBEncoding;
      SceneManager.setPlanTexture(texture);
      resolve();
    };
    img.onerror = () => { console.warn('[TemplateManager] No se pudo cargar imagen del plano.'); resolve(); };
    img.src = dataURL;
  });
}

/* ═══════════════════════════════════════════════════════
   PILLS UI — Abrir/cerrar panels
   ═══════════════════════════════════════════════════════ */

function togglePillPanel(kind) {
  const otherKind  = kind === 'base' ? 'planning' : 'base';
  const panel      = document.getElementById(`tpl-${kind}-panel`);
  const btn        = document.getElementById(`tpl-${kind}-btn`);
  const otherPanel = document.getElementById(`tpl-${otherKind}-panel`);
  const otherBtn   = document.getElementById(`tpl-${otherKind}-btn`);

  const isOpen = !panel?.classList.contains('hidden');
  otherPanel?.classList.add('hidden');
  otherBtn?.classList.remove('open');
  panel?.classList.toggle('hidden', isOpen);
  btn?.classList.toggle('open', !isOpen);

  if (!isOpen) {
    renderTemplateList(kind);
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

function showToast(message, duration = 3000) {
  let container = document.getElementById('escale-toast');
  if (!container) {
    container = document.createElement('div');
    container.id = 'escale-toast';
    container.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:300;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:6px;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.style.cssText = 'background:rgba(10,10,11,0.92);color:#f5f3ee;padding:10px 20px;border-radius:10px;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:0.04em;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);opacity:0;transform:translateY(8px);transition:opacity 0.3s,transform 0.3s;pointer-events:auto;white-space:nowrap;';
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

/* ═══════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════ */

async function init() {
  // Botones legado
  document.getElementById('btn-save-template')?.addEventListener('click', save);
  document.getElementById('btn-load-template')?.addEventListener('click', load);
  document.getElementById('file-template')?.addEventListener('change', handleFileLoad);

  // Welcome modal
  document.getElementById('welcome-plantilla')?.addEventListener('click', () => {
    document.getElementById('welcome-modal').style.display = 'none';
    load();
  });

  // Pills
  document.getElementById('tpl-base-btn')?.addEventListener('click', e => {
    e.stopPropagation(); togglePillPanel('base');
  });
  document.getElementById('tpl-planning-btn')?.addEventListener('click', e => {
    e.stopPropagation(); togglePillPanel('planning');
  });

  // Filtros
  document.getElementById('tpl-base-filter')?.addEventListener('input', e => {
    renderTemplateList('base', e.target.value);
  });
  document.getElementById('tpl-planning-filter')?.addEventListener('input', e => {
    renderTemplateList('planning', e.target.value);
  });

  // Cerrar panels al click fuera
  document.addEventListener('click', e => {
    if (!e.target.closest('.tpl-pill-wrap')) closePillPanels();
  });

  // Recuperar carpeta anterior de IndexedDB
  try {
    const saved = await loadFolderHandle();
    if (saved) {
      const ok = await verifyPermission(saved, 'readwrite');
      if (ok) { dirHandle = saved; await refreshFolderState(); }
    }
  } catch (err) {
    console.warn('[TemplateManager] No se pudo restaurar la carpeta anterior:', err);
  }

  emitTemplateMetaChange();
}

export const TemplateManager = {
  init,
  // Guardar
  save, saveAsBase, savePlanning,
  // Cargar legado
  load,
  // Carpeta
  pickFolder, refreshFolderState,
  // Aplicar
  serialize, applyTemplate, applyBaseTemplate, applyPlanningTemplate,
  // UI
  showToast, closePillPanels, renderTemplateList,
  // Meta
  getCurrentTemplateMeta, setCurrentTemplateMeta,
  get currentBaseMeta()     { return currentBaseMeta; },
  get currentPlanningMeta() { return currentPlanningMeta; }
};

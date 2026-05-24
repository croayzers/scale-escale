/* ─────────────────────────────────────────────────────────
   TEMPLATE MANAGER — Guardar / Cargar plantillas JSON
   E4c · E-scale
   ───────────────────────────────────────────────────────── */

import { AppState }    from '../core/AppState.js';
import { SceneManager } from '../scene/SceneManager.js';
import { UIManager }    from '../ui/UIManager.js';

const TEMPLATE_VERSION = '1.0';
let currentTemplateMeta = {
  name: 'Escena actual',
  source: 'scene'
};

function emitTemplateMetaChange() {
  const detail = getCurrentTemplateMeta();
  document.dispatchEvent(new CustomEvent('escale:template-meta-changed', { detail }));
  return detail;
}

function setCurrentTemplateMeta(nextMeta = {}) {
  currentTemplateMeta = {
    ...currentTemplateMeta,
    ...nextMeta
  };
  emitTemplateMetaChange();
}

function getCurrentTemplateMeta() {
  const fallbackName = document.getElementById('inventory-event-name')?.value?.trim() || 'Escena actual';
  return {
    ...currentTemplateMeta,
    name: currentTemplateMeta.name || fallbackName
  };
}

/* ═══════════════════════════════════════════════════════
   SERIALIZAR — Estado completo → JSON
   ═══════════════════════════════════════════════════════ */
function serialize() {
  const items = AppState.items.map(item => {
    // Copia limpia, sin referencias circulares
    const clean = JSON.parse(JSON.stringify(item));
    // Eliminamos propiedades internas de Three.js que no se deben guardar
    delete clean._mesh;
    delete clean._group;
    return clean;
  });

  const plan = {
    widthM:  AppState.plan.widthM,
    lengthM: AppState.plan.lengthM,
    opacity: AppState.plan.opacity,
    // La imagen del plano: si existe, guardamos dataURL
    imageDataURL: getPlanImageDataURL(),
  };

  // Posición del boundary (área verde)
  const grid = { ...(AppState.grid || {}) };

  return {
    version:    TEMPLATE_VERSION,
    appVersion: 'E4c',
    createdAt:  new Date().toISOString(),
    name:       document.getElementById('inventory-event-name')?.value || 'Sin nombre',
    items,
    plan,
    grid,
    camera:  AppState.camera,
    snap:    { ...AppState.snap },
    cotas:   AppState.showCotas,
    shadows: AppState.shadows,
  };
}

/** Extrae la textura del plano como dataURL (si existe) */
function getPlanImageDataURL() {
  if (!AppState.plan.texture || !AppState.plan.texture.image) return null;
  try {
    const img = AppState.plan.texture.image;
    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth  || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.warn('[TemplateManager] No se pudo serializar la imagen del plano:', e);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════
   GUARDAR — Descarga archivo JSON
   ═══════════════════════════════════════════════════════ */
function save() {
  const data = serialize();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);

  const safeName = (data.name || 'escale-plantilla')
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 60);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename  = `${safeName}_${timestamp}.escale.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  setCurrentTemplateMeta({
    name: data.name || 'Escena actual',
    source: 'saved'
  });
  showToast(`Plantilla guardada: ${filename}`);
}

/* ═══════════════════════════════════════════════════════
   CARGAR — Leer JSON + recrear escena
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

    // Validación básica
    if (!data.version || !Array.isArray(data.items)) {
      throw new Error('El archivo no parece una plantilla E-scale válida.');
    }

    // Confirmación
    const itemCount = data.items.length;
    const planLabel = data.plan?.imageDataURL ? ' + plano base' : '';
    const msg = `¿Cargar plantilla "${data.name || 'Sin nombre'}"?\n` +
                `${itemCount} elemento${itemCount !== 1 ? 's' : ''}${planLabel}.\n\n` +
                `⚠ Se reemplazará la escena actual.`;

    if (!confirm(msg)) return;

    await applyTemplate(data);
    setCurrentTemplateMeta({
      name: data.name || file.name.replace(/\.(escale\.)?json$/i, ''),
      source: 'loaded'
    });
    showToast(`Plantilla cargada — ${itemCount} elemento${itemCount !== 1 ? 's' : ''}`);

  } catch (err) {
    console.error('[TemplateManager] Error cargando plantilla:', err);
    alert('Error al cargar la plantilla:\n' + (err.message || err));
  }
}

/* ═══════════════════════════════════════════════════════
   APLICAR — Limpia escena y recrea todo
   ═══════════════════════════════════════════════════════ */
async function applyTemplate(data) {
  // 1. Limpiar escena actual
  AppState._suppressHistory = true;
  [...AppState.items].forEach(i => {
    SceneManager.removeItem(i.id);
  });
  AppState.items = [];
  AppState.selectedIds.clear();
  AppState.selectedId = null;
  AppState.nextId = 1;
  AppState.history = [];
  AppState._suppressHistory = false;

  // 2. Restaurar plano base (si lo tiene)
  if (data.plan) {
    AppState.plan.widthM  = data.plan.widthM  ?? 30;
    AppState.plan.lengthM = data.plan.lengthM ?? 30;
    AppState.plan.opacity = data.plan.opacity  ?? 0.7;

    // Actualizar inputs del header
    const legacyOffsetX = data.canvasArea?.offsetX ?? 0;
    const legacyOffsetZ = data.canvasArea?.offsetZ ?? 0;

    // Aplicar tamaño del área
    AppState.grid = {
      ...(AppState.grid || {}),
      ...(data.grid || {}),
      offsetX: data.grid?.offsetX ?? legacyOffsetX,
      offsetZ: data.grid?.offsetZ ?? legacyOffsetZ
    };
    AppState.snap.spacing = data.grid?.subSize ?? data.snap?.spacing ?? AppState.snap.spacing;
    AppState.grid.subSize = AppState.grid.subSize ?? AppState.snap.spacing;
    AppState.grid.majorSize = Math.max(AppState.grid.subSize, AppState.grid.majorSize ?? 1);
    SceneManager.rebuildGrids();

    // Restaurar imagen del plano
    if (data.plan.imageDataURL) {
      await loadPlanImage(data.plan.imageDataURL);
    }

  }

  // 3. Recrear items
  let maxId = 0;
  const skipped = [];

  data.items.forEach(itemData => {
    try {
      const item = { ...itemData };
      // Asegurar campos obligatorios
      if (item.x === undefined) item.x = 0;
      if (item.z === undefined) item.z = 0;
      if (item.locked === undefined) item.locked = false;

      // Asignar ID fresco (evitar colisiones)
      const freshId = (item.id && item.id > maxId) ? item.id : ++maxId;
      item.id = freshId;
      if (freshId > maxId) maxId = freshId;

      AppState.items.push(item);
      SceneManager.spawn(item);
    } catch (err) {
      console.warn('[TemplateManager] Item no reconocido, saltando:', itemData, err);
      skipped.push(itemData.type || 'desconocido');
    }
  });

  AppState.nextId = maxId + 1;

  // 4. Restaurar ajustes
  if (data.grid) {
    AppState.grid = { ...(AppState.grid || {}), ...data.grid };
  }
  if (data.snap) {
    AppState.snap.enabled = data.snap.enabled ?? true;
    AppState.snap.spacing = data.snap.spacing ?? 0.25;
  }
  AppState.grid.subSize = data.grid?.subSize ?? AppState.snap.spacing ?? AppState.grid.subSize;
  AppState.grid.majorSize = Math.max(AppState.grid.subSize, data.grid?.majorSize ?? AppState.grid.majorSize ?? 1);
  if (data.cotas !== undefined)  AppState.showCotas = data.cotas;
  if (data.shadows !== undefined) AppState.shadows = data.shadows;

  // 5. Nombre del evento
  const nameInput = document.getElementById('inventory-event-name');
  if (nameInput && data.name) nameInput.value = data.name;

  // 6. Cámara
  if (data.camera) {
    SceneManager.setCamera(data.camera);
    document.getElementById('cam-iso')?.classList.toggle('active', data.camera === 'iso');
    document.getElementById('cam-top')?.classList.toggle('active', data.camera === 'top');
  }

  // 7. Aplicar sombras
  SceneManager.rebuildGrids();
  SceneManager.setPlanLocked(AppState.grid?.locked === true);
  SceneManager.applyShadowState();
  SceneManager.drawCotas();

  // 8. Refresh UI
  UIManager.refresh();
  UIManager.hideDetail?.();

  // 9. Cerrar welcome si estaba abierto
  const welcome = document.getElementById('welcome-modal');
  if (welcome) welcome.style.display = 'none';

  // 10. Avisar de items saltados
  if (skipped.length > 0) {
    setTimeout(() => {
      showToast(`⚠ ${skipped.length} elemento(s) no reconocido(s): ${[...new Set(skipped)].join(', ')}`, 5000);
    }, 1200);
  }
}

/** Carga una imagen dataURL como textura del plano */
function loadPlanImage(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const texture = new THREE.Texture(img);
      texture.needsUpdate = true;
      texture.colorSpace = THREE.sRGBEncoding;
      SceneManager.setPlanTexture(texture);
      resolve();
    };
    img.onerror = () => {
      console.warn('[TemplateManager] No se pudo cargar la imagen del plano desde la plantilla.');
      resolve(); // No frenamos la carga por esto
    };
    img.src = dataURL;
  });
}

/* ═══════════════════════════════════════════════════════
   TOAST — Feedback visual rápido
   ═══════════════════════════════════════════════════════ */
function showToast(message, duration = 3000) {
  // Reusar o crear contenedor
  let container = document.getElementById('escale-toast');
  if (!container) {
    container = document.createElement('div');
    container.id = 'escale-toast';
    container.style.cssText = `
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      z-index:300; pointer-events:none;
      display:flex; flex-direction:column; align-items:center; gap:6px;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    background:rgba(10,10,11,0.92); color:#f5f3ee;
    padding:10px 20px; border-radius:10px;
    font-family:'JetBrains Mono',monospace; font-size:11px;
    letter-spacing:0.04em; backdrop-filter:blur(12px);
    border:1px solid rgba(255,255,255,0.12);
    opacity:0; transform:translateY(8px);
    transition: opacity 0.3s, transform 0.3s;
    pointer-events:auto; white-space:nowrap;
  `;
  toast.textContent = message;
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  // Animate out
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

/* ═══════════════════════════════════════════════════════
   INIT — Enlazar botones
   ═══════════════════════════════════════════════════════ */
function init() {
  // Botón guardar
  document.getElementById('btn-save-template')?.addEventListener('click', save);

  // Botón cargar → abre file picker
  document.getElementById('btn-load-template')?.addEventListener('click', load);

  // File input oculto
  document.getElementById('file-template')?.addEventListener('change', handleFileLoad);

  // Botón "Plantilla" del welcome modal
  document.getElementById('welcome-plantilla')?.addEventListener('click', () => {
    document.getElementById('welcome-modal').style.display = 'none';
    load();
  });

  emitTemplateMetaChange();
}

export const TemplateManager = {
  init,
  save,
  load,
  serialize,
  applyTemplate,
  showToast,
  getCurrentTemplateMeta,
  setCurrentTemplateMeta
};

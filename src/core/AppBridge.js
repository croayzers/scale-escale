/* ─────────────────────────────────────────────────────────
   APP BRIDGE — API de acciones para integración con IA
   Registrado en window.EscaleAI tras init()
   ───────────────────────────────────────────────────────── */

import { AppState } from './AppState.js';
import { CATALOG_CATEGORIES } from '../schemas/CatalogCategories.js';

// ── Pulse helper (misma animación que onboarding) ────────────────────────────
function pulseElement(id, ms = 3000) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.classList.remove('onboard-pulse');
  void el.offsetWidth;
  el.classList.add('onboard-pulse');
  setTimeout(() => el.classList.remove('onboard-pulse'), ms);
  return true;
}

// ── Mapa botón → ID del elemento ────────────────────────────────────────────
const MENU_BTN = {
  zones:     'btn-zones-menu',
  grid:      'btn-grid-menu',
  settings:  'btn-settings',
  template:  'btn-template-menu',
  print:     'btn-print-menu',
  pro:       'btn-pro-menu',
  company:   'btn-company',
  inventory: 'dock-inventory-btn',
  layers:    'btn-layers-toggle',
  calibrate: 'btn-calibrate',
  upload:    'btn-upload-plan',
  account:   'btn-account',
};

// ── Acciones ─────────────────────────────────────────────────────────────────

function openCatalog(category) {
  const cat = category ?? 'tables';
  const btn = document.querySelector(`#dock-items button[data-cat="${cat}"]`);
  if (!btn) return { ok: false, error: `Categoría no encontrada: ${cat}` };
  btn.click();
  return { ok: true, opened: cat };
}

function closeCatalog() {
  document.querySelectorAll('#dock-items button').forEach(b => b.classList.remove('active'));
  document.dispatchEvent(new CustomEvent('escale:catalog-close'));
  return { ok: true };
}

function openMenu(menu) {
  const id = MENU_BTN[menu];
  if (!id) return { ok: false, error: `Menú desconocido: ${menu}. Válidos: ${Object.keys(MENU_BTN).join(', ')}` };
  const btn = document.getElementById(id);
  if (!btn) return { ok: false, error: `Botón no encontrado: #${id}` };
  btn.click();
  return { ok: true, opened: menu };
}

function clickButton(id) {
  const el = document.getElementById(id);
  if (!el) return { ok: false, error: `Elemento no encontrado: #${id}` };
  el.click();
  return { ok: true, clicked: id };
}

function highlight(elementId, ms = 3500) {
  const ok = pulseElement(elementId, ms);
  return ok
    ? { ok: true, highlighted: elementId }
    : { ok: false, error: `Elemento no encontrado: #${elementId}` };
}

function showHint(message, autoHideMs = 6000) {
  const el = document.getElementById('cal-banner');
  if (!el) return { ok: false, error: 'Banner no disponible' };
  el.innerHTML = `<div class="cal-banner-body">
    <span class="cal-banner-icon">🤖</span>
    <span class="cal-banner-text">${message}</span>
    <button class="cal-banner-close" aria-label="Cerrar">✕</button>
  </div>`;
  el.classList.remove('hidden');
  if (autoHideMs > 0) setTimeout(() => el.classList.add('hidden'), autoHideMs);
  return { ok: true };
}

function getState() {
  const activeCat = document.querySelector('#dock-items button.active[data-cat]')?.dataset?.cat ?? null;
  return {
    camera: AppState.camera ?? 'iso',
    planLoaded: !!window.__ESCALE_STATE__?.planLoaded,
    calibrated: !!(AppState.calibration?.calibrated ?? window.__ESCALE_STATE__?.calibrated),
    sceneItemCount: AppState.items?.length ?? 0,
    selectedItemCount: AppState.selectedIds?.size ?? 0,
    selectedItemIds: [...(AppState.selectedIds ?? new Set())],
    catalogOpen: !!activeCat,
    activeCatalogCategory: activeCat,
    menus: {
      settingsOpen: !document.getElementById('settings-modal')?.classList.contains('hidden'),
      inventoryOpen: !document.getElementById('inventory-panel')?.classList.contains('hidden'),
    }
  };
}

function getItems() {
  return (AppState.items ?? []).map(item => ({
    id: item.id,
    name: item.name ?? item.assetProfile ?? item.type ?? '?',
    category: item.category ?? null,
    x: item.x ?? 0,
    z: item.z ?? 0,
    rotation: item.rotation ?? 0,
    locked: item.locked ?? false,
    count: item.count ?? 1,
  }));
}

function getCatalogSnapshot() {
  const catalog = window.__ESCALE_CATALOG__ ?? [];
  const byCategory = {};
  CATALOG_CATEGORIES.forEach(cat => { byCategory[cat.key] = []; });
  catalog.forEach(item => {
    if (byCategory[item.category]) byCategory[item.category].push(item.name ?? item.id);
  });
  return byCategory;
}

// Mapa semántico de todos los elementos de UI que la IA puede referenciar
function getUIMap() {
  return {
    header: {
      'btn-upload-plan':   'Subir plano de imagen (JPG/PNG/WEBP)',
      'btn-calibrate':     'Medir plano — calibrar escala real',
      'btn-zones-menu':    'Zonas — dibujar áreas operativas sobre el plano',
      'btn-grid-menu':     'Grid — ajustar rejilla de trabajo',
      'btn-settings':      'Ajustes de la aplicación',
      'btn-template-menu': 'Plantillas guardadas',
      'btn-print-menu':    'Exportar / imprimir PDF',
      'btn-pro-menu':      'Funciones PRO',
      'btn-company':       'Configuración de empresa (logo, nombre)',
      'btn-layers-toggle': 'Panel de capas',
      'btn-account':       'Cuenta y licencia',
    },
    dock: Object.fromEntries(
      CATALOG_CATEGORIES.map(c => [`dock-cat-${c.key}`, `Catálogo · ${c.label}${c.pro ? ' (PRO)' : ''}`])
    ),
    catalogCategories: CATALOG_CATEGORIES.map(c => ({ key: c.key, label: c.label, pro: !!c.pro })),
    menus: Object.keys(MENU_BTN),
  };
}

// ── Init ─────────────────────────────────────────────────────────────────────
function init() {
  window.EscaleAI = {
    openCatalog,
    closeCatalog,
    openMenu,
    clickButton,
    highlight,
    showHint,
    getState,
    getItems,
    getCatalogSnapshot,
    getUIMap,
  };
}

export const AppBridge = {
  init,
  openCatalog,
  closeCatalog,
  openMenu,
  clickButton,
  highlight,
  showHint,
  getState,
  getItems,
  getCatalogSnapshot,
  getUIMap,
};

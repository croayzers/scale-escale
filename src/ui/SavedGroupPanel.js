/* ─────────────────────────────────────────────────────────
   SAVED GROUP PANEL — Panel de grupos guardados en inventario
   ───────────────────────────────────────────────────────── */

import { AppState } from '../core/AppState.js';
import { SavedGroupLibrary } from '../core/SavedGroupLibrary.js';
import { SavedGroupPlacer } from '../core/SavedGroupPlacer.js';

function toast(msg, kind = 'info') {
  document.dispatchEvent(new CustomEvent('escale:toast', { detail: { msg, kind } }));
}

function getPanel() { return document.getElementById('saved-group-panel'); }

function isOpen() {
  return !getPanel()?.classList.contains('hidden');
}

function open() {
  const panel = getPanel();
  if (!panel) return;
  panel.classList.remove('hidden');
  document.getElementById('dock-savedgroups-btn')?.classList.add('active');
  // Cargar datos frescos de la nube al abrir
  SavedGroupLibrary.load().then(() => refresh()).catch(err => console.warn('[SavedGroupPanel]', err));
}

function close() {
  getPanel()?.classList.add('hidden');
  document.getElementById('dock-savedgroups-btn')?.classList.remove('active');
}

function refresh() {
  const grid = document.getElementById('saved-group-grid');
  if (!grid) return;
  const groups = SavedGroupLibrary.getAll();
  if (!groups.length) {
    grid.innerHTML = `<p class="sg-empty">Selecciona 2 o más elementos, haz clic derecho y elige <strong>Guardar grupo</strong> para empezar.</p>`;
    return;
  }
  grid.innerHTML = groups.map(renderGroupCard).join('');
  if (window.lucide) lucide.createIcons({ nodes: [grid] });
  grid.querySelectorAll('[data-sg-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleCardAction(btn.dataset.sgAction, btn.dataset.sgId);
    });
  });
}

function renderGroupCard(def) {
  const meta = def.createdByName
    ? `${def.itemCount} elementos · <span style="opacity:.6">${escHtml(def.createdByName)}</span>`
    : `${def.itemCount} elemento${def.itemCount !== 1 ? 's' : ''}`;
  return `
  <div class="sg-card" data-sg-id="${def.id}">
    <div class="sg-card-thumb">
      ${def.thumbnail || `<i data-lucide="bookmark" style="width:24px;height:24px;opacity:0.3"></i>`}
    </div>
    <div class="sg-card-name" title="${escHtml(def.name)}">${escHtml(def.name)}</div>
    <div class="sg-card-meta">${meta}</div>
    <div class="sg-card-actions">
      <button class="btn primary" data-sg-action="place" data-sg-id="${def.id}" title="Colocar en escena">Colocar</button>
      <button class="btn ghost sg-card-more" data-sg-action="menu" data-sg-id="${def.id}" title="Más opciones">
        <i data-lucide="more-vertical" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  </div>`;
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function handleCardAction(action, id) {
  const def = SavedGroupLibrary.getById(id);
  if (!def) return;

  if (action === 'place') {
    SavedGroupPlacer.activatePlacement(def);
    close();
    return;
  }

  if (action === 'menu') {
    showCardMenu(id, def);
    return;
  }

  if (action === 'rename') {
    const newName = prompt('Nuevo nombre:', def.name);
    if (newName?.trim()) {
      SavedGroupLibrary.renameSavedGroup(id, newName.trim());
    }
    return;
  }

  if (action === 'delete') {
    if (confirm(`¿Eliminar el grupo "${def.name}"? Las instancias ya colocadas no se verán afectadas.`)) {
      SavedGroupLibrary.deleteSavedGroup(id);
    }
    return;
  }
}

function showCardMenu(id, def) {
  // Mini menú contextual inline
  let existing = document.getElementById('sg-card-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'sg-card-menu';
  menu.style.cssText = `
    position:fixed;z-index:200;background:rgba(245,243,238,0.97);
    border:1px solid rgba(0,0,0,0.1);border-radius:10px;
    padding:6px;min-width:140px;
    box-shadow:0 8px 24px -8px rgba(10,10,11,0.25);
    backdrop-filter:blur(12px);
  `;
  menu.innerHTML = `
    <button class="ctx-action-btn" data-sg-action="rename" data-sg-id="${id}" style="width:100%">
      <i data-lucide="pencil" class="w-3.5 h-3.5"></i> Renombrar
    </button>
    <button class="ctx-action-btn danger" data-sg-action="delete" data-sg-id="${id}" style="width:100%">
      <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Eliminar
    </button>
  `;

  // Posicionamiento junto al botón
  const btn = document.querySelector(`[data-sg-action="menu"][data-sg-id="${id}"]`);
  if (btn) {
    const r = btn.getBoundingClientRect();
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${r.left}px`;
  } else {
    menu.style.top = '50%';
    menu.style.left = '50%';
  }

  document.body.appendChild(menu);
  if (window.lucide) lucide.createIcons({ nodes: [menu] });

  menu.querySelectorAll('[data-sg-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleCardAction(btn.dataset.sgAction, btn.dataset.sgId);
      menu.remove();
    });
  });

  // Cerrar al hacer clic fuera
  const onClickOutside = e => {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', onClickOutside, true); }
  };
  setTimeout(() => document.addEventListener('click', onClickOutside, true), 0);
}

function promptAndSave() {
  if (AppState.selectedIds.size < 2) {
    toast('Selecciona 2 o más elementos para guardar como grupo', 'warning');
    return;
  }
  const name = prompt('Nombre del grupo:');
  if (name?.trim()) {
    SavedGroupLibrary.saveCurrentSelection(name.trim());
  }
}

function init() {
  document.getElementById('saved-group-close')?.addEventListener('click', close);
  document.getElementById('saved-group-save-btn')?.addEventListener('click', promptAndSave);
  document.addEventListener('escale:saved-groups-changed', () => { if (isOpen()) refresh(); });
  document.addEventListener('escale:inventory-close', close);
}

export const SavedGroupPanel = { init, open, close, isOpen, refresh };
window.SavedGroupPanel = SavedGroupPanel;

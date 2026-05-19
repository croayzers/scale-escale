/* ─────────────────────────────────────────────────────────
   COMPANY MANAGER — Datos de empresa (nombre/mail/logo)
   ────────────────────────────────────────────────────────
   Persistencia: localStorage bajo la clave 'escale_company'.
   Estos datos aparecen en la cabecera y pie del PDF exportado.
   ───────────────────────────────────────────────────────── */

import { AppState } from '../core/AppState.js';

const STORAGE_KEY = 'escale_company';
let pending = null;

function init() {
  // Restaurar de localStorage si existe
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      AppState.company = { ...AppState.company, ...data };
    }
  } catch (e) { /* localStorage no disponible o JSON inválido */ }

  syncBrandUI();

  document.getElementById('btn-company')?.addEventListener('click', openModal);
  document.getElementById('company-close')?.addEventListener('click', closeModal);
  document.getElementById('company-cancel')?.addEventListener('click', closeModal);

  document.getElementById('company-modal')?.addEventListener('click', e => {
    if (e.target.id === 'company-modal') closeModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('company-modal')?.classList.contains('visible')) {
      closeModal();
    }
  });

  document.getElementById('company-name')?.addEventListener('input', e => {
    if (pending) pending.name = e.target.value.trim();
  });
  document.getElementById('company-email')?.addEventListener('input', e => {
    if (pending) pending.email = e.target.value.trim();
  });

  document.getElementById('company-logo-load')?.addEventListener('click', () => {
    document.getElementById('company-logo-input').click();
  });
  document.getElementById('company-logo-input')?.addEventListener('change', handleLogoFile);
  document.getElementById('company-logo-clear')?.addEventListener('click', () => {
    if (pending) {
      pending.logo = null;
      syncModalUI();
    }
  });

  document.getElementById('company-save')?.addEventListener('click', () => {
    if (!pending) return;
    AppState.company = { ...pending };
    save();
    syncBrandUI();
    closeModal();
  });
}

function openModal() {
  pending = { ...AppState.company };
  syncModalUI();
  document.getElementById('company-modal').classList.add('visible');
}

function closeModal() {
  document.getElementById('company-modal').classList.remove('visible');
  pending = null;
}

function handleLogoFile(e) {
  const file = e.target.files[0];
  if (!file || !pending) return;
  if (file.size > 1_000_000) {
    alert('El logo es demasiado grande (max 1 MB). Comprime la imagen primero.');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    pending.logo = ev.target.result;
    syncModalUI();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.company));
  } catch (e) {
    console.warn('No se pudo guardar empresa en localStorage:', e);
  }
}

function syncModalUI() {
  if (!pending) return;
  document.getElementById('company-name').value  = pending.name  || '';
  document.getElementById('company-email').value = pending.email || '';

  const thumbImg = document.getElementById('company-logo-thumb-img');
  const emptyTxt = document.getElementById('company-logo-empty');
  const clearBtn = document.getElementById('company-logo-clear');
  const label    = document.getElementById('company-logo-label');

  if (pending.logo) {
    thumbImg.src = pending.logo;
    thumbImg.classList.remove('hidden');
    emptyTxt.classList.add('hidden');
    clearBtn.classList.remove('hidden');
    label.textContent = 'Reemplazar logo';
  } else {
    thumbImg.classList.add('hidden');
    emptyTxt.classList.remove('hidden');
    clearBtn.classList.add('hidden');
    label.textContent = 'Cargar logo';
  }
}

function syncBrandUI() {
  const { name, logo } = AppState.company;
  const brandEl = document.getElementById('brand-name');
  if (brandEl) brandEl.textContent = name || 'E-scale';

  const preview = document.getElementById('company-logo-preview');
  if (!preview) return;
  if (logo) {
    preview.classList.remove('hidden');
    preview.src = logo;
  } else {
    preview.classList.add('hidden');
  }
}

export const CompanyManager = { init, syncBrandUI };

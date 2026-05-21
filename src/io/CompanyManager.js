import { AppState } from '../core/AppState.js';
import { DashboardSync } from './DashboardSync.js';
import { CloudSync } from '../services/CloudSync.js';
import { SubscriptionManager } from '../services/SubscriptionManager.js';

const STORAGE_KEY = 'escale_company';
const DEFAULT_PRIMARY = '#2563EB';
const DEFAULT_SECONDARY = '#D4FF3A';
const PALETTE = [
  '#2563EB', '#0F766E', '#16A34A', '#D4FF3A', '#F59E0B',
  '#EF4444', '#EC4899', '#8B5CF6', '#111827', '#F5F3EE'
];

let pending = null;
let welcomePromptQueued = false;

function normalizeColor(value) {
  const raw = String(value || '').trim();
  const hexMatch = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return `#${hex.split('').map(ch => ch + ch).join('')}`.toUpperCase();
    }
    return `#${hex}`.toUpperCase();
  }

  const rgbMatch = raw.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch.slice(1).map(Number);
    if (parts.every(n => n >= 0 && n <= 255)) {
      return `#${parts.map(n => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
    }
  }

  return null;
}

function colorFor(company, key) {
  const fallback = key === 'colorPrimary' ? DEFAULT_PRIMARY : DEFAULT_SECONDARY;
  return normalizeColor(company?.[key]) || fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeColor(hex) || DEFAULT_PRIMARY;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function applyBrandColors(company = AppState.company) {
  const primary = colorFor(company, 'colorPrimary');
  const secondary = colorFor(company, 'colorSecondary');
  const root = document.documentElement;

  root.style.setProperty('--brand-primary', primary);
  root.style.setProperty('--brand-primary-rgb', hexToRgb(primary));
  root.style.setProperty('--brand-secondary', secondary);
  root.style.setProperty('--accent', secondary);
}

function init() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      AppState.company = { ...AppState.company, ...data };
    }
  } catch (e) {
    console.warn('No se pudo cargar el perfil de empresa:', e);
  }

  applyBrandColors(AppState.company);
  syncBrandUI();
  buildPalettes();
  DashboardSync.flushPending().catch(error => {
    console.warn('No se pudo vaciar la cola del dashboard local:', error);
  });

  document.getElementById('btn-company')?.addEventListener('click', openModal);
  document.getElementById('company-close')?.addEventListener('click', closeModal);
  document.getElementById('company-cancel')?.addEventListener('click', closeModal);

  wireColorField('primary', 'colorPrimary');
  wireColorField('secondary', 'colorSecondary');

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
  document.getElementById('company-venue')?.addEventListener('input', e => {
    if (pending) pending.venue = e.target.value.trim();
  });

  document.getElementById('company-logo-load')?.addEventListener('click', () => {
    document.getElementById('company-logo-input')?.click();
  });
  document.getElementById('company-logo-input')?.addEventListener('change', handleLogoFile);
  document.getElementById('company-logo-clear')?.addEventListener('click', () => {
    if (pending) {
      pending.logo = null;
      syncModalUI();
    }
  });

  document.getElementById('company-save')?.addEventListener('click', savePending);
}

function buildPalettes() {
  ['primary', 'secondary'].forEach(kind => {
    const palette = document.getElementById(`company-color-${kind}-palette`);
    if (!palette || palette.children.length) return;
    PALETTE.forEach(color => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brand-swatch';
      btn.dataset.color = color;
      btn.title = color;
      btn.style.background = color;
      palette.appendChild(btn);
    });
  });
}

function wireColorField(kind, key) {
  const text = document.getElementById(`company-color-${kind}`);
  const picker = document.getElementById(`company-color-${kind}-picker`);
  const palette = document.getElementById(`company-color-${kind}-palette`);

  text?.addEventListener('input', () => {
    commitColor(kind, key, text.value, { syncText: false });
  });
  text?.addEventListener('blur', () => {
    commitColor(kind, key, text.value, { syncText: true });
  });
  picker?.addEventListener('input', () => {
    commitColor(kind, key, picker.value, { syncText: true });
  });
  palette?.addEventListener('click', e => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    commitColor(kind, key, btn.dataset.color, { syncText: true });
  });
}

function commitColor(kind, key, value, { syncText }) {
  if (!pending) return false;
  const normalized = normalizeColor(value);
  setColorError(kind, !normalized);
  if (!normalized) return false;

  pending[key] = normalized;
  updateColorUI(kind, normalized, syncText);
  applyBrandColors({ ...AppState.company, ...pending });
  return true;
}

function updateColorUI(kind, color, syncText = true) {
  const text = document.getElementById(`company-color-${kind}`);
  const picker = document.getElementById(`company-color-${kind}-picker`);
  const preview = document.getElementById(`company-color-${kind}-preview`);
  const palette = document.getElementById(`company-color-${kind}-palette`);

  if (syncText && text) text.value = color;
  if (picker) picker.value = color;
  if (preview) preview.style.background = color;
  palette?.querySelectorAll('.brand-swatch').forEach(btn => {
    btn.classList.toggle('active', normalizeColor(btn.dataset.color) === color);
  });
}

function setColorError(kind, visible) {
  document.getElementById(`company-color-${kind}-error`)?.classList.toggle('visible', visible);
}

async function savePending() {
  if (!pending) return;
  const primaryOk = commitColor('primary', 'colorPrimary', document.getElementById('company-color-primary')?.value, { syncText: true });
  const secondaryOk = commitColor('secondary', 'colorSecondary', document.getElementById('company-color-secondary')?.value, { syncText: true });
  if (!primaryOk || !secondaryOk) return;

  if (pending.logo && !SubscriptionManager.hasFeature('ownLogo')) {
    SubscriptionManager.ensureFeature('ownLogo');
    pending.logo = null;
    pending.logoAssetId = '';
    pending.logoFileName = '';
    pending.logoRelativePath = '';
  }

  AppState.company = { ...pending };
  const syncErrors = [];

  try {
    await DashboardSync.syncCompany(AppState.company);
  } catch (error) {
    syncErrors.push(`dashboard local: ${error.message}`);
    console.warn('No se pudo sincronizar la empresa con el dashboard local:', error);
  }

  try {
    await CloudSync.syncCompany(AppState.company);
  } catch (error) {
    syncErrors.push(`cloud sync: ${error.message}`);
    console.warn('No se pudo sincronizar la empresa con servicios cloud:', error);
  }

  save();
  syncBrandUI();
  closeModal({ keepPreview: true });

  if (syncErrors.length) {
    alert(`Los datos se guardaron en la app, pero hubo sincronizaciones pendientes.\n\n${syncErrors.join('\n')}`);
  }
}

function openModal() {
  pending = { ...AppState.company };
  syncModalUI();
  document.getElementById('company-modal')?.classList.add('visible');
}

function closeModal({ keepPreview = false } = {}) {
  document.getElementById('company-modal')?.classList.remove('visible');
  pending = null;
  if (!keepPreview) applyBrandColors(AppState.company);
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
    applyBrandColors(AppState.company);
  } catch (e) {
    console.warn('No se pudo guardar empresa en localStorage:', e);
  }
}

function syncModalUI() {
  if (!pending) return;
  document.getElementById('company-name').value = pending.name || '';
  document.getElementById('company-email').value = pending.email || '';
  document.getElementById('company-venue').value = pending.venue || '';

  const primary = colorFor(pending, 'colorPrimary');
  const secondary = colorFor(pending, 'colorSecondary');
  updateColorUI('primary', primary, true);
  updateColorUI('secondary', secondary, true);
  setColorError('primary', false);
  setColorError('secondary', false);

  const thumbImg = document.getElementById('company-logo-thumb-img');
  const emptyTxt = document.getElementById('company-logo-empty');
  const clearBtn = document.getElementById('company-logo-clear');
  const label = document.getElementById('company-logo-label');

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

function requestAfterWelcome() {
  if (welcomePromptQueued) return;
  welcomePromptQueued = true;

  const tryOpen = () => {
    const companyModal = document.getElementById('company-modal');
    const blockingModalVisible = [
      'plan-format-modal',
      'dwg-info-modal',
      'export-modal',
      'export-preview-modal'
    ].some(id => document.getElementById(id)?.classList.contains('visible'));

    if (companyModal?.classList.contains('visible')) {
      welcomePromptQueued = false;
      return;
    }

    if (blockingModalVisible) {
      setTimeout(tryOpen, 220);
      return;
    }

    welcomePromptQueued = false;
    openModal();
  };

  setTimeout(tryOpen, 180);
}

export const CompanyManager = {
  init,
  openModal,
  requestAfterWelcome,
  syncBrandUI,
  applyBrandColors
};

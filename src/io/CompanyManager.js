import { AppState } from '../core/AppState.js';
import { DashboardSync } from './DashboardSync.js';
import { CloudSync } from '../services/CloudSync.js';
import { SubscriptionManager } from '../services/SubscriptionManager.js';
import { AuthManager } from '../services/AuthManager.js';
import { ServiceConfig } from '../services/ServiceConfig.js';

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

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
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

function currentDraft() {
  return pending || AppState.company;
}

function currentEmailDraft() {
  const formValue = document.getElementById('company-email')?.value;
  return cleanText(formValue || currentDraft().email || AppState.company.authEmail);
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.company));
    applyBrandColors(AppState.company);
  } catch (error) {
    console.warn('No se pudo guardar empresa en localStorage:', error);
  }
}

function persistDraftState() {
  const draft = currentDraft();
  if (!draft) return;

  AppState.company = {
    ...AppState.company,
    ...draft,
    email: cleanText(draft.email || AppState.company.authEmail || AppState.company.email)
  };
  save();
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
  palette?.addEventListener('click', event => {
    const button = event.target.closest('[data-color]');
    if (!button) return;
    commitColor(kind, key, button.dataset.color, { syncText: true });
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
  palette?.querySelectorAll('.brand-swatch').forEach(button => {
    button.classList.toggle('active', normalizeColor(button.dataset.color) === color);
  });
}

function setColorError(kind, visible) {
  document.getElementById(`company-color-${kind}-error`)?.classList.toggle('visible', visible);
}

function setButtonRecommended(buttonId, recommended) {
  document.getElementById(buttonId)?.classList.toggle('recommended', recommended);
}

function syncAuthUi() {
  const authEnabled = ServiceConfig.hasFeature('auth');
  const cloudEnabled = ServiceConfig.hasFeature('cloudSync');
  const authenticated = AuthManager.isAuthenticated();
  const hint = AuthManager.suggestProvider(currentEmailDraft());

  const statusTitle = document.getElementById('company-auth-status-title');
  const statusText = document.getElementById('company-auth-status-text');
  const accountHint = document.getElementById('company-auth-hint');
  const signOutButton = document.getElementById('company-auth-signout');
  const portalButton = document.getElementById('company-auth-portal');
  const licenseBanner = document.getElementById('company-license-banner');
  const licenseBannerText = document.getElementById('company-license-banner-text');
  const footerMeta = document.getElementById('company-auth-meta');

  if (!authEnabled) {
    statusTitle.textContent = 'Modo local';
    statusText.textContent = 'En este entorno no hay autenticacion cloud disponible.';
    accountHint.textContent = 'Puedes seguir trabajando en local y activar acceso cloud cuando publiques en Vercel.';
    footerMeta.textContent = 'Sin validacion remota';
    signOutButton?.classList.add('hidden');
    portalButton?.classList.add('hidden');
    licenseBanner?.classList.add('hidden');
    return;
  }

  if (authenticated) {
    const providerName = AuthManager.providerLabel(AppState.company.authProvider || 'email');
    const planName = SubscriptionManager.currentPlan().name;
    statusTitle.textContent = `Sesión activa · ${planName}`;
    statusText.textContent = AppState.company.authEmail || 'Cuenta autenticada';
    accountHint.textContent = AppState.company.licenseNeedsInvite && AppState.company.licenseDetectedOrganizationName
      ? `Hemos detectado ${AppState.company.licenseDetectedOrganizationName}, pero tu licencia solo se desbloquea cuando el propietario te añade o cuando entras con el correo de compra.`
      : `Licencia validada por ${providerName}. La app usa esta identidad para restaurar tu plan sin depender del navegador.`;
    footerMeta.textContent = cloudEnabled
      ? `Proveedor: ${providerName} · Estado ${AppState.company.cloudSyncStatus || 'connected'}`
      : `Proveedor: ${providerName}`;
    signOutButton?.classList.remove('hidden');
    portalButton?.classList.toggle('hidden', !AppState.company.billingCustomerId || SubscriptionManager.currentPlanCode() === 'free_lite');
  } else {
    statusTitle.textContent = hint.title;
    statusText.textContent = 'Tu plan se detecta al verificar la identidad del correo.';
    accountHint.textContent = hint.description;
    footerMeta.textContent = 'Sin iniciar sesión';
    signOutButton?.classList.add('hidden');
    portalButton?.classList.add('hidden');
  }

  setButtonRecommended('company-auth-google', hint.primaryProvider === 'google');
  setButtonRecommended('company-auth-microsoft', hint.primaryProvider === 'azure');
  setButtonRecommended('company-auth-email-link', hint.primaryProvider === 'email');

  if (licenseBanner && licenseBannerText) {
    if (AppState.company.licenseNeedsInvite && AppState.company.licenseDetectedOrganizationName) {
      licenseBanner.classList.remove('hidden');
      licenseBannerText.textContent = `Dominio detectado: ${AppState.company.licenseDetectedOrganizationName}. Aun no desbloqueamos esa licencia por seguridad.`;
    } else {
      licenseBanner.classList.add('hidden');
      licenseBannerText.textContent = '';
    }
  }

  syncAccountChip();
}

function syncAccountChip() {
  const button = document.getElementById('btn-account');
  const label = document.getElementById('account-chip-label');
  const meta = document.getElementById('account-chip-meta');
  if (!button || !label || !meta) return;

  if (AuthManager.isAuthenticated()) {
    label.textContent = AppState.company.authEmail || 'Cuenta conectada';
    meta.textContent = SubscriptionManager.currentPlan().name;
    button.classList.add('is-connected');
    return;
  }

  label.textContent = 'Acceder';
  meta.textContent = 'Licencia';
  button.classList.remove('is-connected');
}

async function handleAuthAction(kind) {
  try {
    if (pending) {
      pending.email = currentEmailDraft();
      pending.name = cleanText(document.getElementById('company-name')?.value || pending.name);
      pending.venue = cleanText(document.getElementById('company-venue')?.value || pending.venue);
    }
    persistDraftState();

    if (kind === 'email') {
      const email = currentEmailDraft();
      if (!email) {
        alert('Indica primero un correo para enviarte el enlace.');
        document.getElementById('company-email')?.focus();
        return;
      }
      const { error } = await AuthManager.signInWithOtp(email);
      if (error) throw error;
      alert(`Te hemos enviado un enlace de acceso a ${email}.`);
      return;
    }

    const provider = kind === 'microsoft' ? 'azure' : kind;
    const { error } = await AuthManager.signInWithProvider(provider, currentEmailDraft());
    if (error) throw error;
  } catch (error) {
    alert(error.message || 'No se pudo iniciar el acceso.');
  }
}

async function handleCustomerPortal() {
  try {
    await SubscriptionManager.openCustomerPortal();
  } catch (error) {
    alert(error.message || 'No se pudo abrir la gestion del plan.');
  }
}

async function savePending() {
  if (!pending) return;
  const primaryOk = commitColor('primary', 'colorPrimary', document.getElementById('company-color-primary')?.value, { syncText: true });
  const secondaryOk = commitColor('secondary', 'colorSecondary', document.getElementById('company-color-secondary')?.value, { syncText: true });
  if (!primaryOk || !secondaryOk) return;

  pending.email = cleanText(document.getElementById('company-email')?.value || pending.email || AppState.company.authEmail);
  pending.name = cleanText(document.getElementById('company-name')?.value || pending.name);
  pending.venue = cleanText(document.getElementById('company-venue')?.value || pending.venue);

  if (pending.logo && !SubscriptionManager.hasFeature('ownLogo')) {
    SubscriptionManager.ensureFeature('ownLogo');
    pending.logo = null;
    pending.logoAssetId = '';
    pending.logoFileName = '';
    pending.logoRelativePath = '';
  }

  AppState.company = { ...AppState.company, ...pending };
  const syncErrors = [];

  try {
    await DashboardSync.syncCompany(AppState.company);
  } catch (error) {
    syncErrors.push(`dashboard local: ${error.message}`);
    console.warn('No se pudo sincronizar la empresa con el dashboard local:', error);
  }

  try {
    const cloudResponse = await CloudSync.syncCompany(AppState.company);
    if (cloudResponse?.reason === 'auth_required') {
      AppState.company.cloudSyncStatus = 'needs_auth';
    }
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
  pending = {
    ...AppState.company,
    email: cleanText(AppState.company.email || AppState.company.authEmail)
  };
  syncModalUI();
  syncAuthUi();
  document.getElementById('company-modal')?.classList.add('visible');
}

function closeModal({ keepPreview = false } = {}) {
  document.getElementById('company-modal')?.classList.remove('visible');
  pending = null;
  if (!keepPreview) applyBrandColors(AppState.company);
}

function handleLogoFile(event) {
  const file = event.target.files[0];
  if (!file || !pending) return;
  if (file.size > 1_000_000) {
    alert('El logo es demasiado grande (max 1 MB). Comprime la imagen primero.');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = readEvent => {
    pending.logo = readEvent.target.result;
    syncModalUI();
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function syncModalUI() {
  if (!pending) return;
  document.getElementById('company-name').value = pending.name || '';
  document.getElementById('company-email').value = pending.email || AppState.company.authEmail || '';
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

  syncAuthUi();
}

function syncBrandUI() {
  const { name, logo } = AppState.company;
  const brandEl = document.getElementById('brand-name');
  if (brandEl) brandEl.textContent = name || 'E-scale';

  const preview = document.getElementById('company-logo-preview');
  if (preview) {
    if (logo) {
      preview.classList.remove('hidden');
      preview.src = logo;
    } else {
      preview.classList.add('hidden');
    }
  }

  syncAccountChip();
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

function init() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      AppState.company = { ...AppState.company, ...data };
    }
  } catch (error) {
    console.warn('No se pudo cargar el perfil de empresa:', error);
  }

  if (!AppState.company.email && AppState.company.authEmail) {
    AppState.company.email = AppState.company.authEmail;
  }

  applyBrandColors(AppState.company);
  syncBrandUI();
  buildPalettes();
  DashboardSync.flushPending().catch(error => {
    console.warn('No se pudo vaciar la cola del dashboard local:', error);
  });

  document.getElementById('btn-company')?.addEventListener('click', openModal);
  document.getElementById('btn-account')?.addEventListener('click', openModal);
  document.getElementById('company-close')?.addEventListener('click', closeModal);
  document.getElementById('company-cancel')?.addEventListener('click', closeModal);

  wireColorField('primary', 'colorPrimary');
  wireColorField('secondary', 'colorSecondary');

  document.getElementById('company-modal')?.addEventListener('click', event => {
    if (event.target.id === 'company-modal') closeModal();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('company-modal')?.classList.contains('visible')) {
      closeModal();
    }
  });

  document.getElementById('company-name')?.addEventListener('input', event => {
    if (pending) pending.name = event.target.value.trim();
  });
  document.getElementById('company-email')?.addEventListener('input', event => {
    if (pending) pending.email = event.target.value.trim();
    syncAuthUi();
  });
  document.getElementById('company-venue')?.addEventListener('input', event => {
    if (pending) pending.venue = event.target.value.trim();
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

  document.getElementById('company-auth-google')?.addEventListener('click', () => void handleAuthAction('google'));
  document.getElementById('company-auth-microsoft')?.addEventListener('click', () => void handleAuthAction('microsoft'));
  document.getElementById('company-auth-email-link')?.addEventListener('click', () => void handleAuthAction('email'));
  document.getElementById('company-auth-signout')?.addEventListener('click', async () => {
    await AuthManager.signOut();
    syncAuthUi();
  });
  document.getElementById('company-auth-portal')?.addEventListener('click', () => void handleCustomerPortal());

  document.getElementById('company-save')?.addEventListener('click', () => void savePending());

  document.addEventListener('escale:auth-changed', () => {
    if (pending && !pending.email && AppState.company.authEmail) {
      pending.email = AppState.company.authEmail;
    }
    save();
    syncAuthUi();
    syncBrandUI();
  });

  document.addEventListener('escale:license-state', () => {
    syncAuthUi();
    syncBrandUI();
  });
}

export const CompanyManager = {
  init,
  openModal,
  requestAfterWelcome,
  syncBrandUI,
  applyBrandColors
};

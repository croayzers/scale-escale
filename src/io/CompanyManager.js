import { AppState } from '../core/AppState.js';
import { DashboardSync } from './DashboardSync.js';
import { CloudSync } from '../services/CloudSync.js';
import { SubscriptionManager } from '../services/SubscriptionManager.js';
import { AuthManager } from '../services/AuthManager.js';

const STORAGE_KEY = 'escale_company';
const PROFILE_INDEX_KEY = 'escale_company_profiles';
const DEFAULT_PRIMARY = '#2563EB';
const DEFAULT_SECONDARY = '#D4FF3A';
const PALETTE = [
  '#2563EB', '#0F766E', '#16A34A', '#D4FF3A', '#F59E0B',
  '#EF4444', '#EC4899', '#8B5CF6', '#111827', '#F5F3EE'
];

let pending = null;
let onboardingActive = false;

function hasAccessScreen() {
  return Boolean(
    document.getElementById('access-modal') &&
    document.getElementById('access-email') &&
    document.getElementById('access-title') &&
    document.getElementById('access-profile-summary')
  );
}

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

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function extractDomain(email) {
  const normalized = cleanEmail(email);
  const at = normalized.indexOf('@');
  return at > 0 ? normalized.slice(at + 1) : '';
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

function saveCompanyState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.company));
    applyBrandColors(AppState.company);
  } catch (error) {
    console.warn('No se pudo guardar empresa en localStorage:', error);
  }
}

function readProfileIndex() {
  try {
    const raw = localStorage.getItem(PROFILE_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('No se pudo leer el indice local de empresas:', error);
    return [];
  }
}

function writeProfileIndex(profiles) {
  try {
    localStorage.setItem(PROFILE_INDEX_KEY, JSON.stringify(profiles.slice(0, 12)));
  } catch (error) {
    console.warn('No se pudo persistir el indice local de empresas:', error);
  }
}

function profileFromCompany(company = AppState.company) {
  const email = cleanEmail(company.email || company.authEmail);
  return {
    email,
    domain: extractDomain(email),
    name: cleanText(company.name),
    venue: cleanText(company.venue),
    logo: typeof company.logo === 'string' ? company.logo : null,
    colorPrimary: colorFor(company, 'colorPrimary'),
    colorSecondary: colorFor(company, 'colorSecondary'),
    subscriptionPlanCode: company.subscriptionPlanCode || 'free_lite',
    subscriptionPlan: company.subscriptionPlan || 'Free Lite',
    recordStatus: company.recordStatus || 'Activo',
    savedAt: new Date().toISOString()
  };
}

function storeCompanyProfile(company = AppState.company) {
  const profile = profileFromCompany(company);
  if (!profile.email && !profile.name) return;

  const profiles = readProfileIndex().filter(entry => (
    !(profile.email && entry.email === profile.email) &&
    !(profile.domain && entry.domain === profile.domain)
  ));
  profiles.unshift(profile);
  writeProfileIndex(profiles);
}

function findStoredProfile(email) {
  const normalizedEmail = cleanEmail(email);
  const domain = extractDomain(normalizedEmail);
  const profiles = readProfileIndex();

  return (
    profiles.find(profile => normalizedEmail && profile.email === normalizedEmail) ||
    profiles.find(profile => domain && profile.domain === domain) ||
    profiles[0] ||
    null
  );
}

function mergeProfile(profile, { forceEmail = false } = {}) {
  if (!profile) return;

  AppState.company = {
    ...AppState.company,
    name: profile.name || AppState.company.name,
    venue: profile.venue || AppState.company.venue,
    logo: profile.logo || AppState.company.logo,
    colorPrimary: profile.colorPrimary || AppState.company.colorPrimary,
    colorSecondary: profile.colorSecondary || AppState.company.colorSecondary,
    subscriptionPlanCode: profile.subscriptionPlanCode || AppState.company.subscriptionPlanCode,
    subscriptionPlan: profile.subscriptionPlan || AppState.company.subscriptionPlan,
    recordStatus: profile.recordStatus || AppState.company.recordStatus,
    ...(forceEmail && profile.email ? { email: profile.email } : {})
  };
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

function currentDraft() {
  return pending || AppState.company;
}

function currentEmailDraft() {
  return cleanEmail(
    document.getElementById('company-email')?.value ||
    document.getElementById('access-email')?.value ||
    currentDraft().email ||
    AppState.company.authEmail
  );
}

function buildPalettes() {
  ['primary', 'secondary'].forEach(kind => {
    const palette = document.getElementById(`company-color-${kind}-palette`);
    if (!palette || palette.children.length) return;
    PALETTE.forEach(color => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'brand-swatch';
      button.dataset.color = color;
      button.title = color;
      button.style.background = color;
      palette.appendChild(button);
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

function syncAccessUi() {
  if (!hasAccessScreen()) return;
  const email = currentEmailDraft();
  const hint = AuthManager.suggestProvider(email);
  const profile = findStoredProfile(email);

  const emailInput = document.getElementById('access-email');
  const title = document.getElementById('access-title');
  const description = document.getElementById('access-description');
  const summary = document.getElementById('access-profile-summary');
  if (!emailInput || !title || !description || !summary) return;

  emailInput.value = email || '';
  title.textContent = hint.title;
  description.textContent = hint.description;
  summary.textContent = profile
    ? `${profile.name || 'Perfil guardado'} · ${profile.subscriptionPlan || 'Free Lite'}`
    : 'Introduce tu correo para recuperar datos guardados en este equipo.';

  setButtonRecommended('access-google', hint.primaryProvider === 'google');
  setButtonRecommended('access-microsoft', hint.primaryProvider === 'azure');
  setButtonRecommended('access-email-link', hint.primaryProvider === 'email');
}

function syncAuthUi() {
  const authenticated = AuthManager.isAuthenticated();
  const statusTitle = document.getElementById('company-auth-status-title');
  const statusText = document.getElementById('company-auth-status-text');
  const accountHint = document.getElementById('company-auth-hint');
  const signOutButton = document.getElementById('company-auth-signout');
  const switchButton = document.getElementById('company-auth-switch');
  const portalButton = document.getElementById('company-auth-portal');
  const footerMeta = document.getElementById('company-auth-meta');
  const providerChip = document.getElementById('company-auth-provider-chip');
  const planChip = document.getElementById('company-auth-plan-chip');

  if (!statusTitle || !statusText || !accountHint || !footerMeta || !providerChip || !planChip) return;

  if (authenticated) {
    const providerName = AuthManager.providerLabel(AppState.company.authProvider || 'email');
    providerChip.textContent = providerName;
    planChip.textContent = SubscriptionManager.currentPlan().name;
    statusTitle.textContent = `Acceso listo · ${SubscriptionManager.currentPlan().name}`;
    statusText.textContent = AppState.company.authEmail || 'Cuenta local';
    accountHint.textContent = 'En esta fase el acceso es local y no sale a Google ni Microsoft. La app usa este correo para recuperar tus datos guardados.';
    footerMeta.textContent = `Modo local · ${providerName}`;
    signOutButton?.classList.remove('hidden');
    switchButton?.classList.remove('hidden');
    portalButton?.classList.add('hidden');
  } else {
    providerChip.textContent = 'Correo';
    planChip.textContent = 'Free Lite';
    statusTitle.textContent = 'Identifica tu cuenta';
    statusText.textContent = 'Primero elegimos correo y método de acceso.';
    accountHint.textContent = 'Después pasarás a los datos de empresa con autocompletado si ya existen en este equipo o con el mismo dominio.';
    footerMeta.textContent = 'Sin iniciar sesión';
    signOutButton?.classList.add('hidden');
    switchButton?.classList.remove('hidden');
    portalButton?.classList.add('hidden');
  }
  syncAccountChip();
}

function syncAccountChip() {
  const button = document.getElementById('btn-account');
  const label = document.getElementById('account-chip-label');
  const meta = document.getElementById('account-chip-meta');
  if (!button || !label || !meta) return;

  if (AuthManager.isAuthenticated()) {
    label.textContent = AppState.company.authEmail || 'Cuenta local';
    meta.textContent = SubscriptionManager.currentPlan().name;
    button.classList.add('is-connected');
    return;
  }

  label.textContent = 'Acceder';
  meta.textContent = 'Licencia';
  button.classList.remove('is-connected');
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

function openAccessModal() {
  if (!hasAccessScreen()) {
    onboardingActive = false;
    return false;
  }
  onboardingActive = true;
  const accessModal = document.getElementById('access-modal');
  if (accessModal) accessModal.style.display = 'flex';
  syncAccessUi();
  document.getElementById('access-email')?.focus();
  return true;
}

function closeAccessModal() {
  const accessModal = document.getElementById('access-modal');
  if (accessModal) accessModal.style.display = 'none';
}

function prefillPendingFromEmail(email) {
  const profile = findStoredProfile(email);
  if (!profile) return;

  if (!pending) {
    pending = { ...AppState.company };
  }

  pending.name = pending.name || profile.name || '';
  pending.venue = pending.venue || profile.venue || '';
  pending.logo = pending.logo || profile.logo || null;
  pending.colorPrimary = pending.colorPrimary || profile.colorPrimary || AppState.company.colorPrimary;
  pending.colorSecondary = pending.colorSecondary || profile.colorSecondary || AppState.company.colorSecondary;
  pending.subscriptionPlanCode = profile.subscriptionPlanCode || pending.subscriptionPlanCode;
  pending.subscriptionPlan = profile.subscriptionPlan || pending.subscriptionPlan;
}

function syncModalUI() {
  if (!pending) return;

  prefillPendingFromEmail(pending.email || AppState.company.authEmail);

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

function openModal({ onboarding = false } = {}) {
  pending = {
    ...AppState.company,
    email: cleanEmail(AppState.company.email || AppState.company.authEmail)
  };
  onboardingActive = onboarding || onboardingActive;
  syncModalUI();
  document.getElementById('company-modal')?.classList.add('visible');
}

function finalizeOnboarding() {
  onboardingActive = false;
  document.dispatchEvent(new CustomEvent('escale:onboarding-company-complete'));
}

function closeModal({ keepPreview = false, completeOnboarding = false } = {}) {
  document.getElementById('company-modal')?.classList.remove('visible');
  pending = null;
  if (!keepPreview) applyBrandColors(AppState.company);
  if (onboardingActive && !completeOnboarding) {
    if (!openAccessModal()) {
      onboardingActive = false;
    }
    return;
  }
  if (completeOnboarding) {
    finalizeOnboarding();
  } else {
    onboardingActive = false;
  }
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

async function handleAccessChoice(kind) {
  const email = cleanEmail(document.getElementById('access-email')?.value || AppState.company.email || AppState.company.authEmail);
  if (!email) {
    alert('Escribe primero tu correo para continuar.');
    document.getElementById('access-email')?.focus();
    return;
  }

  const profile = findStoredProfile(email);
  if (profile) {
    mergeProfile(profile);
  }

  AppState.company.email = email;
  AppState.company.authEmail = email;
  await AuthManager.mockSignIn(kind === 'microsoft' ? 'azure' : kind, email);
  saveCompanyState();
  closeAccessModal();
  openModal({ onboarding: true });
}

async function savePending() {
  if (!pending) return;
  const primaryOk = commitColor('primary', 'colorPrimary', document.getElementById('company-color-primary')?.value, { syncText: true });
  const secondaryOk = commitColor('secondary', 'colorSecondary', document.getElementById('company-color-secondary')?.value, { syncText: true });
  if (!primaryOk || !secondaryOk) return;

  pending.email = cleanEmail(document.getElementById('company-email')?.value || pending.email || AppState.company.authEmail);
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

  storeCompanyProfile(AppState.company);
  saveCompanyState();
  syncBrandUI();
  closeModal({ keepPreview: true, completeOnboarding: true });

  if (syncErrors.length) {
    alert(`Los datos se guardaron en la app, pero hubo sincronizaciones pendientes.\n\n${syncErrors.join('\n')}`);
  }
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

  if (!AppState.company.email) {
    const profile = findStoredProfile('');
    if (profile) mergeProfile(profile, { forceEmail: true });
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

  document.getElementById('btn-company')?.addEventListener('click', () => openModal());
  document.getElementById('btn-account')?.addEventListener('click', openAccessModal);
  document.getElementById('company-close')?.addEventListener('click', () => closeModal());
  document.getElementById('company-cancel')?.addEventListener('click', () => closeModal());

  document.getElementById('access-google')?.addEventListener('click', () => void handleAccessChoice('google'));
  document.getElementById('access-microsoft')?.addEventListener('click', () => void handleAccessChoice('microsoft'));
  document.getElementById('access-email-link')?.addEventListener('click', () => void handleAccessChoice('email'));
  document.getElementById('access-email')?.addEventListener('input', () => syncAccessUi());

  wireColorField('primary', 'colorPrimary');
  wireColorField('secondary', 'colorSecondary');

  document.getElementById('company-modal')?.addEventListener('click', event => {
    if (event.target.id === 'company-modal') closeModal();
  });
  document.getElementById('access-modal')?.addEventListener('click', event => {
    if (event.target.id === 'access-modal') {
      document.getElementById('access-email')?.focus();
    }
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
    if (pending) {
      pending.email = event.target.value.trim();
      prefillPendingFromEmail(pending.email);
    }
    syncModalUI();
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

  document.getElementById('company-auth-switch')?.addEventListener('click', () => {
    document.getElementById('company-modal')?.classList.remove('visible');
    pending = null;
    openAccessModal();
  });
  document.getElementById('company-auth-signout')?.addEventListener('click', async () => {
    await AuthManager.signOut();
    AppState.company.authEmail = '';
    AppState.company.authProvider = '';
    AppState.company.authStatus = 'anonymous';
    saveCompanyState();
    syncAuthUi();
    openAccessModal();
  });

  document.getElementById('company-save')?.addEventListener('click', () => void savePending());

  document.addEventListener('escale:auth-changed', () => {
    if (!AppState.company.email && AppState.company.authEmail) {
      AppState.company.email = AppState.company.authEmail;
    }
    saveCompanyState();
    syncAuthUi();
    syncBrandUI();
  });

  document.addEventListener('escale:license-state', () => {
    syncAuthUi();
    syncBrandUI();
  });

  openAccessModal();
}

export const CompanyManager = {
  init,
  openModal,
  requestAfterWelcome: () => {},
  syncBrandUI,
  applyBrandColors
};

import { AppState } from '../core/AppState.js';
import { PLAN_CATALOG, getPlanDefinition } from '../core/PlanCatalog.js';
import { CloudApi } from './CloudApi.js';
import { ServiceConfig } from './ServiceConfig.js';

const FEATURE_PLAN_REQUIREMENTS = {
  ownLogo: 'pro',
  pdfExport: 'pro',
  emailPdfToOwner: 'pro',
  emailPdfToClient: 'premium',
  supplierExcelImport: 'pro',
  crmIntegration: 'premium',
  erpIntegration: 'premium',
  sharepointIntegration: 'premium',
  companyReporting: 'pro'
};

let listenersBound = false;

function normalizePlanCode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'free_lite';
  if (raw === 'free' || raw === 'free lite' || raw === 'free_lite') return 'free_lite';
  if (raw === 'pro') return 'pro';
  if (raw === 'premium') return 'premium';
  return PLAN_CATALOG[raw] ? raw : 'free_lite';
}

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function currentPlanCode() {
  return normalizePlanCode(AppState.company.subscriptionPlanCode || AppState.company.subscriptionPlan);
}

function currentPlan() {
  return getPlanDefinition(currentPlanCode());
}

function setPlan(planCode, extras = {}) {
  const code = normalizePlanCode(planCode);
  const plan = getPlanDefinition(code);
  AppState.company = {
    ...AppState.company,
    ...extras,
    subscriptionPlanCode: code,
    subscriptionPlan: plan.name,
    subscriptionStatus: extras.subscriptionStatus || AppState.company.subscriptionStatus || 'Activo'
  };
  document.dispatchEvent(new CustomEvent('escale:plan-changed', {
    detail: { planCode: code, plan }
  }));
  return plan;
}

function emitLicenseState(detail = {}) {
  document.dispatchEvent(new CustomEvent('escale:license-state', {
    detail: {
      planCode: currentPlanCode(),
      authenticated: AppState.company.authStatus === 'authenticated',
      organizationId: AppState.company.organizationId,
      ...detail
    }
  }));
}

function applyAnonymousFallback(reason = 'needs_auth') {
  const plan = setPlan('free_lite', {
    organizationId: '',
    organizationRole: '',
    billingCustomerId: '',
    subscriptionStatus: reason === 'needs_auth'
      ? 'Inicia sesion para validar licencia'
      : 'Sin licencia validada',
    licenseSource: reason,
    licenseDetectedDomain: '',
    licenseDetectedOrganizationName: '',
    licenseNeedsInvite: false,
    cloudSyncStatus: ServiceConfig.hasFeature('cloudSync') ? 'needs_auth' : 'local_only'
  });
  emitLicenseState({ reason });
  return plan;
}

function applyBootstrapResponse(response) {
  const planCode = normalizePlanCode(response?.planCode || 'free_lite');
  const organization = response?.organization || null;
  const auth = response?.auth || null;
  const license = response?.license || {};

  if (auth?.email && !cleanText(AppState.company.email)) {
    AppState.company.email = auth.email;
  }

  const plan = setPlan(planCode, {
    organizationId: organization?.id || '',
    organizationRole: license.role || '',
    billingCustomerId: response?.billing?.stripeCustomerId || '',
    subscriptionStatus: response?.billing?.subscriptionStatus || (planCode === 'free_lite' ? 'Free Lite' : 'Activo'),
    authEmail: auth?.email || AppState.company.authEmail,
    authUserId: auth?.userId || AppState.company.authUserId,
    authProvider: auth?.provider || AppState.company.authProvider,
    authDisplayName: auth?.fullName || AppState.company.authDisplayName,
    authStatus: response?.authenticated ? 'authenticated' : AppState.company.authStatus,
    licenseSource: license.source || 'cloud',
    licenseDetectedDomain: license.detectedDomain || '',
    licenseDetectedOrganizationName: license.detectedOrganization?.displayName || '',
    licenseNeedsInvite: Boolean(license.needsInvite),
    cloudSyncStatus: response?.authenticated ? 'connected' : 'needs_auth'
  });

  emitLicenseState({
    source: license.source || 'cloud',
    detectedOrganization: license.detectedOrganization || null,
    needsInvite: Boolean(license.needsInvite)
  });
  return plan;
}

async function hydrateFromCloud(reason = 'manual') {
  if (!ServiceConfig.hasFeature('cloudSync')) return currentPlan();

  const token = window.__ESCALE_AUTH__?.getAccessToken?.() || '';
  if (!token) return applyAnonymousFallback('needs_auth');

  try {
    const response = await CloudApi.bootstrapSession({
      company: AppState.company,
      client: {
        href: window.location.href,
        hostname: window.location.hostname,
        userAgent: navigator.userAgent,
        reason
      }
    });

    if (response?.ok === false) {
      return applyAnonymousFallback(response.reason || 'cloud_error');
    }

    return applyBootstrapResponse(response || {});
  } catch (error) {
    console.warn('[SubscriptionManager] No se pudo hidratar la suscripcion desde backend:', error);
    return applyAnonymousFallback('cloud_error');
  }
}

function hasFeature(featureKey) {
  return Boolean(currentPlan().features?.[featureKey]);
}

function featureLabel(featureKey) {
  return {
    ownLogo: 'logo corporativo',
    pdfExport: 'exportacion PDF',
    emailPdfToOwner: 'envio del PDF al email del usuario',
    emailPdfToClient: 'envio del PDF al cliente',
    supplierExcelImport: 'precios de proveedores por Excel',
    crmIntegration: 'integracion CRM',
    erpIntegration: 'integracion ERP',
    sharepointIntegration: 'integracion SharePoint',
    companyReporting: 'reportes empresariales'
  }[featureKey] || featureKey;
}

async function openCheckout(planCode = 'pro') {
  const response = await CloudApi.createCheckoutSession({
    planCode,
    company: AppState.company,
    returnUrl: window.location.href
  });

  if (response?.url) {
    window.location.href = response.url;
    return true;
  }

  alert('Billing todavia no esta configurado en este entorno. La funcionalidad ya queda preparada para Stripe.');
  return false;
}

async function openCustomerPortal() {
  const response = await CloudApi.openCustomerPortal({
    organizationId: AppState.company.organizationId,
    customerId: AppState.company.billingCustomerId,
    returnUrl: window.location.href
  });

  if (response?.url) {
    window.location.href = response.url;
    return true;
  }

  alert('El portal de cliente todavia no esta disponible en este entorno.');
  return false;
}

function showUpgradePrompt(featureKey) {
  const requiredPlan = FEATURE_PLAN_REQUIREMENTS[featureKey] || 'pro';
  const plan = getPlanDefinition(requiredPlan);
  const message = `La funcionalidad "${featureLabel(featureKey)}" pertenece al plan ${plan.name}.\n\nQuieres abrir el checkout de suscripcion?`;

  if (window.confirm(message)) {
    void openCheckout(requiredPlan);
  }
}

function ensureFeature(featureKey) {
  if (hasFeature(featureKey)) return true;
  showUpgradePrompt(featureKey);
  return false;
}

function bindAuthListeners() {
  if (listenersBound) return;
  listenersBound = true;

  document.addEventListener('escale:auth-changed', () => {
    if (AppState.company.authStatus === 'authenticated') {
      void hydrateFromCloud('auth_changed');
      return;
    }
    applyAnonymousFallback('needs_auth');
  });
}

async function init() {
  setPlan(currentPlanCode() || 'free_lite', {
    subscriptionStatus: AppState.company.subscriptionStatus || 'Local'
  });

  bindAuthListeners();

  if (!ServiceConfig.hasFeature('cloudSync')) return currentPlan();
  return await hydrateFromCloud('init');
}

export const SubscriptionManager = {
  init,
  hydrateFromCloud,
  currentPlanCode,
  currentPlan,
  setPlan,
  hasFeature,
  ensureFeature,
  openCheckout,
  openCustomerPortal,
  normalizePlanCode
};

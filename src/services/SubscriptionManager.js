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

function normalizePlanCode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'free_lite';
  if (raw === 'free' || raw === 'free lite' || raw === 'free_lite') return 'free_lite';
  if (raw === 'pro') return 'pro';
  if (raw === 'premium') return 'premium';
  return PLAN_CATALOG[raw] ? raw : 'free_lite';
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
  const message = `La funcionalidad "${featureLabel(featureKey)}" pertenece al plan ${plan.name}.\n\n¿Quieres abrir el checkout de suscripcion?`;

  if (window.confirm(message)) {
    void openCheckout(requiredPlan);
  }
}

function ensureFeature(featureKey) {
  if (hasFeature(featureKey)) return true;
  showUpgradePrompt(featureKey);
  return false;
}

async function init() {
  setPlan(currentPlanCode() || 'free_lite', {
    subscriptionStatus: AppState.company.subscriptionStatus || 'Local'
  });

  if (!ServiceConfig.hasFeature('cloudSync')) return currentPlan();

  try {
    const response = await CloudApi.bootstrapSession({
      company: AppState.company,
      client: {
        href: window.location.href,
        hostname: window.location.hostname,
        userAgent: navigator.userAgent
      }
    });

    if (response?.organization || response?.planCode) {
      setPlan(response.planCode || currentPlanCode(), {
        organizationId: response.organization?.id || AppState.company.organizationId,
        billingCustomerId: response.billing?.stripeCustomerId || AppState.company.billingCustomerId,
        subscriptionStatus: response.billing?.subscriptionStatus || AppState.company.subscriptionStatus,
        cloudSyncStatus: response.ok === false ? 'pending' : 'connected'
      });
    }
  } catch (error) {
    console.warn('[SubscriptionManager] No se pudo hidratar la suscripcion desde backend:', error);
  }

  return currentPlan();
}

export const SubscriptionManager = {
  init,
  currentPlanCode,
  currentPlan,
  setPlan,
  hasFeature,
  ensureFeature,
  openCheckout,
  openCustomerPortal,
  normalizePlanCode
};

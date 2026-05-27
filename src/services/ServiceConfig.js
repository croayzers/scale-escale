const STORAGE_KEY = 'escale_runtime_overrides';

const DEFAULT_PUBLIC_CONFIG = {
  env: 'local',
  services: {
    supabase: {
      enabled: false,
      url: '',
      anonKey: '',
      storageBuckets: {
        logos: 'company-logos',
        exports: 'export-pdfs'
      }
    },
    stripe: {
      enabled: false,
      publishableKey: '',
      prices: {
        free_lite: '',
        pro: '',
        premium: ''
      }
    },
    resend: {
      enabled: false,
      fromEmail: ''
    },
    posthog: {
      enabled: false,
      key: '',
      host: 'https://eu.posthog.com'
    },
    crisp: {
      enabled: false,
      websiteId: ''
    },
    browserless: {
      enabled: false
    }
  },
  features: {
    auth: false,
    billing: false,
    cloudSync: false,
    analytics: false,
    supportChat: false,
    emailDelivery: false
  },
  urls: {
    publicConfig: '/api/public-config',
    bootstrap: '/api/app/bootstrap',
    companySync: '/api/app/company-sync',
    exportSync: '/api/app/export-sync',
    checkout: '/api/billing/checkout',
    customerPortal: '/api/billing/portal',
    sendExportEmail: '/api/email/send-export',
    sendShareEmail: '/api/email/send-share',
    sendFeedback: '/api/email/send-feedback',
    analyticsCapture: '/api/analytics/capture',
    aiChat: '/api/ai/chat'
  }
};

const state = {
  initialized: false,
  config: structuredClone(DEFAULT_PUBLIC_CONFIG)
};

function mergeDeep(base, extra) {
  if (!extra || typeof extra !== 'object') return base;

  const output = Array.isArray(base) ? [...base] : { ...base };
  Object.entries(extra).forEach(([key, value]) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      output[key] &&
      typeof output[key] === 'object' &&
      !Array.isArray(output[key])
    ) {
      output[key] = mergeDeep(output[key], value);
      return;
    }

    output[key] = value;
  });
  return output;
}

function readOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('[ServiceConfig] No se pudieron leer los overrides runtime:', error);
    return {};
  }
}

async function fetchPublicConfig() {
  try {
    const response = await fetch(DEFAULT_PUBLIC_CONFIG.urls.publicConfig, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      return {};
    }

    return await response.json();
  } catch (error) {
    console.info('[ServiceConfig] Configuracion remota no disponible, usando modo local.');
    return {};
  }
}

async function init() {
  if (state.initialized) return state.config;

  const remoteConfig = await fetchPublicConfig();
  const overrides = readOverrides();

  state.config = mergeDeep(
    mergeDeep(structuredClone(DEFAULT_PUBLIC_CONFIG), remoteConfig),
    overrides
  );
  state.initialized = true;
  window.__ESCALE_SERVICES__ = state.config;
  return state.config;
}

function get() {
  return state.config;
}

function getUrl(key) {
  return state.config.urls?.[key] || DEFAULT_PUBLIC_CONFIG.urls[key] || '';
}

function getService(name) {
  return state.config.services?.[name] || {};
}

function isServiceEnabled(name) {
  return Boolean(getService(name)?.enabled);
}

function hasFeature(name) {
  return Boolean(state.config.features?.[name]);
}

export const ServiceConfig = {
  init,
  get,
  getUrl,
  getService,
  isServiceEnabled,
  hasFeature
};

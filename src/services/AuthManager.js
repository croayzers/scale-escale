import { AppState } from '../core/AppState.js';
import { ServiceConfig } from './ServiceConfig.js';

const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
const MICROSOFT_DOMAINS = new Set(['outlook.com', 'hotmail.com', 'live.com', 'msn.com']);

let supabaseClient = null;
let currentSession = null;
let importPromise = null;

function authRedirectUrl() {
  return window.location.href.split('#')[0];
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function extractDomain(email) {
  const normalized = cleanEmail(email);
  const at = normalized.indexOf('@');
  return at > 0 ? normalized.slice(at + 1) : '';
}

function providerLabel(provider) {
  if (provider === 'google') return 'Google';
  if (provider === 'azure') return 'Microsoft';
  return 'correo';
}

function hydrateAuthState(session) {
  currentSession = session || null;
  const user = session?.user || null;
  const provider = String(user?.app_metadata?.provider || user?.identities?.[0]?.provider || '');
  const fullName = String(
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.preferred_username ||
    ''
  ).trim();

  AppState.company.authUserId = user?.id || '';
  AppState.company.authEmail = user?.email || '';
  AppState.company.authProvider = provider || '';
  AppState.company.authDisplayName = fullName || '';
  AppState.company.authStatus = user ? 'authenticated' : 'anonymous';

  window.__ESCALE_AUTH__ = {
    getAccessToken: () => currentSession?.access_token || '',
    getUser: () => currentSession?.user || null
  };

  document.dispatchEvent(new CustomEvent('escale:auth-changed', {
    detail: {
      userId: AppState.company.authUserId,
      email: AppState.company.authEmail,
      provider: AppState.company.authProvider,
      fullName: AppState.company.authDisplayName
    }
  }));
}

async function loadSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (importPromise) return await importPromise;

  const config = ServiceConfig.getService('supabase');
  if (!config?.url || !config?.anonKey) return null;

  importPromise = import('https://esm.sh/@supabase/supabase-js@2').then(module => {
    supabaseClient = module.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'escale-supabase-auth'
      }
    });
    return supabaseClient;
  }).catch(error => {
    console.warn('[AuthManager] No se pudo cargar Supabase Auth:', error);
    return null;
  });

  return await importPromise;
}

async function init() {
  if (!ServiceConfig.hasFeature('auth')) {
    hydrateAuthState(null);
    return null;
  }

  const client = await loadSupabaseClient();
  if (!client) {
    hydrateAuthState(null);
    return null;
  }

  const { data } = await client.auth.getSession();
  hydrateAuthState(data?.session || null);

  client.auth.onAuthStateChange((_event, session) => {
    hydrateAuthState(session);
  });

  return client;
}

function suggestProvider(email) {
  const normalized = cleanEmail(email);
  const domain = extractDomain(normalized);

  if (!normalized || !domain) {
    return {
      primaryProvider: 'email',
      secondaryProviders: ['google', 'azure'],
      domain: '',
      title: 'Pon tu correo para recuperar tu licencia',
      description: 'La licencia se valida con identidad real. Si compraste con Google u Outlook, entra con esa cuenta.'
    };
  }

  if (GOOGLE_DOMAINS.has(domain)) {
    return {
      primaryProvider: 'google',
      secondaryProviders: ['email', 'azure'],
      domain,
      title: 'Cuenta Google detectada',
      description: 'Lo más rápido es entrar con Google y recuperar la licencia que esté asociada a ese correo.'
    };
  }

  if (MICROSOFT_DOMAINS.has(domain)) {
    return {
      primaryProvider: 'azure',
      secondaryProviders: ['email', 'google'],
      domain,
      title: 'Cuenta Microsoft detectada',
      description: 'Usa Microsoft para Outlook personal o Microsoft 365. Si prefieres, también puedes recibir un enlace por correo.'
    };
  }

  return {
    primaryProvider: 'email',
    secondaryProviders: ['azure', 'google'],
    domain,
    title: `Dominio ${domain} detectado`,
    description: 'Si es un correo de empresa, suele funcionar mejor con Microsoft 365 o Google Workspace. El enlace por correo sigue disponible.'
  };
}

async function signInWithOtp(email) {
  const client = await loadSupabaseClient();
  if (!client) throw new Error('Supabase Auth no esta configurado.');
  const normalized = cleanEmail(email);
  if (!normalized) throw new Error('Necesitas indicar un correo.');

  return await client.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: authRedirectUrl()
    }
  });
}

async function signInWithProvider(provider, emailHint = '') {
  const client = await loadSupabaseClient();
  if (!client) throw new Error('Supabase Auth no esta configurado.');

  const normalizedProvider = provider === 'microsoft' ? 'azure' : provider;
  const queryParams = {
    prompt: 'select_account'
  };

  if (cleanEmail(emailHint)) {
    queryParams.login_hint = cleanEmail(emailHint);
  }

  return await client.auth.signInWithOAuth({
    provider: normalizedProvider,
    options: {
      redirectTo: authRedirectUrl(),
      queryParams,
      ...(normalizedProvider === 'azure'
        ? { scopes: 'email openid profile offline_access' }
        : {})
    }
  });
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  hydrateAuthState(null);
}

function getSession() {
  return currentSession;
}

function isAuthenticated() {
  return Boolean(currentSession?.user?.id);
}

export const AuthManager = {
  init,
  suggestProvider,
  signInWithOtp,
  signInWithProvider,
  signOut,
  getSession,
  isAuthenticated,
  providerLabel
};

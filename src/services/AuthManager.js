import { AppState } from '../core/AppState.js';
import { ServiceConfig } from './ServiceConfig.js';

let supabaseClient = null;
let currentSession = null;
let importPromise = null;

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

function exposeTokenGetter() {
  window.__ESCALE_AUTH__ = {
    getAccessToken: () => currentSession?.access_token || ''
  };
}

function hydrateUser(session) {
  currentSession = session || null;
  AppState.company.authUserId = session?.user?.id || '';
  AppState.company.authEmail = session?.user?.email || '';
  exposeTokenGetter();
  document.dispatchEvent(new CustomEvent('escale:auth-changed', {
    detail: {
      userId: AppState.company.authUserId,
      email: AppState.company.authEmail
    }
  }));
}

async function init() {
  if (!ServiceConfig.hasFeature('auth')) {
    exposeTokenGetter();
    return null;
  }

  const client = await loadSupabaseClient();
  if (!client) {
    exposeTokenGetter();
    return null;
  }

  const { data } = await client.auth.getSession();
  hydrateUser(data?.session || null);

  client.auth.onAuthStateChange((_event, session) => {
    hydrateUser(session);
  });

  return client;
}

async function signInWithOtp(email) {
  const client = await loadSupabaseClient();
  if (!client) throw new Error('Supabase Auth no esta configurado.');
  return await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin
    }
  });
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  hydrateUser(null);
}

function getSession() {
  return currentSession;
}

export const AuthManager = {
  init,
  signInWithOtp,
  signOut,
  getSession
};

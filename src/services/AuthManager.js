import { AppState } from '../core/AppState.js';
import { ServiceConfig } from './ServiceConfig.js';

let currentSession = null;
let supabaseClient = null;
let supabaseSubscription = null;

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function providerLabel(provider) {
  if (provider === 'google') return 'Google';
  if (provider === 'azure' || provider === 'microsoft') return 'Microsoft';
  return 'correo';
}

function exposeTokenGetter() {
  window.__ESCALE_AUTH__ = {
    getAccessToken: () => currentSession?.access_token || '',
    getUser: () => currentSession?.user || null
  };
}

// ── Cookie storage adapter para compartir sesión con el portal Scale ──────────
// @supabase/ssr guarda la sesión como cookies sb-<ref>-auth-token (o chunkeadas
// sb-<ref>-auth-token.0, .1 …). Este adapter las lee/escribe para que E-Scale
// herede la sesión del portal sin necesidad de un nuevo login.

function extractProjectRef(supabaseUrl) {
  const match = String(supabaseUrl || '').match(/https?:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : '';
}

function parseCookies() {
  return Object.fromEntries(
    document.cookie.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [decodeURIComponent(k), decodeURIComponent(v.join('='))];
    }).filter(([k]) => k)
  );
}

function writeCookie(name, value, opts = {}) {
  let str = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  str += `; path=${opts.path || '/'}`;
  if (opts.domain)   str += `; domain=${opts.domain}`;
  if (opts.secure)   str += `; secure`;
  if (opts.sameSite) str += `; samesite=${opts.sameSite}`;
  if (opts.maxAge != null) str += `; max-age=${opts.maxAge}`;
  document.cookie = str;
}

function createCookieStorage(cookieDomain) {
  const isLocal = !cookieDomain ||
    cookieDomain.replace(/^\./, '') === 'localhost' ||
    cookieDomain.replace(/^\./, '') === '127.0.0.1';

  const opts = {
    path: '/',
    sameSite: 'lax',
    ...(cookieDomain && !isLocal ? { domain: cookieDomain } : {}),
    ...(!isLocal ? { secure: true } : {})
  };

  return {
    getItem(key) {
      const cookies = parseCookies();
      let raw = cookies[key] ?? null;
      // Chunks: key.0 + key.1 + …
      if (raw === null) {
        const chunks = [];
        let i = 0;
        while (cookies[`${key}.${i}`] != null) {
          chunks.push(cookies[`${key}.${i}`]);
          i++;
        }
        if (chunks.length > 0) raw = chunks.join('');
      }
      if (raw === null) return null;
      // @supabase/ssr codifica el valor como "base64-<btoa(json)>"
      // El cliente supabase-js estándar espera JSON plano — decodificar aquí.
      if (raw.startsWith('base64-')) {
        try {
          return decodeURIComponent(escape(atob(raw.slice(7))));
        } catch {
          return raw;
        }
      }
      return raw;
    },
    setItem(key, value) {
      writeCookie(key, value, opts);
    },
    removeItem(key) {
      writeCookie(key, '', { ...opts, maxAge: 0 });
      // Limpiar chunks si los hubiese
      const cookies = parseCookies();
      let i = 0;
      while (cookies[`${key}.${i}`] != null) {
        writeCookie(`${key}.${i}`, '', { ...opts, maxAge: 0 });
        i++;
      }
    }
  };
}

function getSupabaseClient() {
  const config = ServiceConfig.getService('supabase');
  const enabled = Boolean(config?.enabled && config?.url && config?.anonKey);
  if (!enabled) return null;
  if (supabaseClient) return supabaseClient;
  if (!window.supabase?.createClient) {
    throw new Error('Supabase Auth no esta disponible. Revisa el script @supabase/supabase-js o el bundle de la app.');
  }
  const cookieDomain = config?.cookieDomain || '';
  const projectRef   = extractProjectRef(config.url);
  supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: createCookieStorage(cookieDomain),
      storageKey: projectRef ? `sb-${projectRef}-auth-token` : undefined
    }
  });
  return supabaseClient;
}

function normalizeSupabaseSession(session) {
  if (!session?.user) return null;
  const user = session.user;
  const metadata = user.user_metadata || {};
  const provider = user.app_metadata?.provider || metadata.provider || 'email';
  return {
    local: false,
    provider,
    access_token: session.access_token || '',
    refresh_token: session.refresh_token || '',
    user: {
      id: user.id,
      email: user.email || '',
      app_metadata: { ...(user.app_metadata || {}), provider },
      user_metadata: {
        ...metadata,
        fullName: cleanText(metadata.fullName || metadata.full_name || metadata.name || metadata.display_name || '')
      }
    }
  };
}

function hydrateAuthState(session) {
  currentSession = session || null;
  const user = session?.user || null;
  const provider = String(session?.provider || user?.app_metadata?.provider || '');
  const fullName = cleanText(
    session?.user?.user_metadata?.fullName
    || session?.user?.user_metadata?.full_name
    || session?.user?.user_metadata?.name
    || ''
  );

  AppState.company.authUserId = user?.id || '';
  AppState.company.authEmail = user?.email || '';
  AppState.company.authProvider = provider || '';
  AppState.company.authDisplayName = fullName;
  AppState.company.authStatus = user ? 'authenticated' : 'anonymous';

  exposeTokenGetter();

  document.dispatchEvent(new CustomEvent('escale:auth-changed', {
    detail: {
      userId: AppState.company.authUserId,
      email: AppState.company.authEmail,
      provider: AppState.company.authProvider,
      local: false,
      fullName
    }
  }));
}

function getPortalUrl() {
  const cfg = ServiceConfig.get();
  const url = cfg?.portalUrl;
  // Ignorar valores mal configurados (ej. el nombre de la var en vez de la URL)
  if (url && url.startsWith('http')) return url.replace(/\/$/, '');
  return 'https://thescaleapps.com';
}

function redirectToPortalLogin(returnUrl) {
  const portal = getPortalUrl();
  const back   = returnUrl || window.location.href;
  window.location.href = `${portal}/login?returnUrl=${encodeURIComponent(back)}`;
}

// E-Scale no tiene login propio: la sesión vive en el portal Scale y se
// comparte vía cookie (createCookieStorage). Si no hay sesión, se redirige
// al portal a autenticar; al volver, la cookie ya está puesta.
async function init() {
  const client = getSupabaseClient();
  if (!client) {
    console.warn('[AuthManager] Supabase no configurado: revisa ServiceConfig.');
    hydrateAuthState(null);
    return null;
  }

  const { data, error } = await client.auth.getSession();
  if (error) console.warn('[AuthManager] No se pudo recuperar la sesion Supabase:', error.message);

  const session = normalizeSupabaseSession(data?.session);
  if (!session) {
    redirectToPortalLogin(window.location.href);
    return null;
  }

  hydrateAuthState(session);

  if (!supabaseSubscription) {
    const { data: listener } = client.auth.onAuthStateChange((_event, rawSession) => {
      const normalized = normalizeSupabaseSession(rawSession);
      if (!normalized) {
        redirectToPortalLogin(window.location.href);
        return;
      }
      hydrateAuthState(normalized);
    });
    supabaseSubscription = listener?.subscription || null;
  }

  return currentSession;
}

async function signOut() {
  try {
    await getSupabaseClient()?.auth?.signOut();
  } catch (error) {
    console.warn('[AuthManager] No se pudo cerrar la sesion Supabase:', error);
  }
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
  signOut,
  getSession,
  isAuthenticated,
  providerLabel,
  redirectToPortalLogin,
  getPortalUrl,
  getSupabaseClient: () => supabaseClient
};

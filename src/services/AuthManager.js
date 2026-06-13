import { AppState } from '../core/AppState.js';
import { ServiceConfig } from './ServiceConfig.js';

const LOCAL_AUTH_KEY = 'escale_auth_local';
const LOCAL_AUTH_USERS_KEY = 'escale_auth_users_local';
const GOOGLE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
const MICROSOFT_DOMAINS = new Set(['outlook.com', 'hotmail.com', 'live.com', 'msn.com']);

let currentSession = null;
let supabaseClient = null;
let supabaseSubscription = null;

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function extractDomain(email) {
  const normalized = cleanEmail(email);
  const at = normalized.indexOf('@');
  return at > 0 ? normalized.slice(at + 1) : '';
}

function providerLabel(provider) {
  if (provider === 'google') return 'Google';
  if (provider === 'azure' || provider === 'microsoft') return 'Microsoft';
  return 'correo';
}

function uidFromEmail(email, provider) {
  const base = `${provider}:${cleanEmail(email)}`;
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = ((hash << 5) - hash) + base.charCodeAt(index);
    hash |= 0;
  }
  return `local-${Math.abs(hash)}`;
}

function buildLocalSession(email, provider = 'email', options = {}) {
  const normalizedEmail = cleanEmail(email);
  const normalizedProvider = provider === 'microsoft' ? 'azure' : provider;
  const fullName = cleanText(options.fullName);

  return {
    local: true,
    provider: normalizedProvider,
    access_token: '',
    user: {
      id: uidFromEmail(normalizedEmail, normalizedProvider),
      email: normalizedEmail,
      app_metadata: { provider: normalizedProvider },
      user_metadata: fullName ? { fullName } : {}
    }
  };
}

function saveLocalSession(session) {
  try {
    if (!session?.user?.email) {
      localStorage.removeItem(LOCAL_AUTH_KEY);
      return;
    }

    localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify({
      email: session.user.email,
      provider: session.provider || session.user?.app_metadata?.provider || 'email',
      fullName: cleanText(session.user?.user_metadata?.fullName)
    }));
  } catch (error) {
    console.warn('[AuthManager] No se pudo persistir la sesion local:', error);
  }
}

function readLocalSession() {
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload?.email) return null;
    return buildLocalSession(payload.email, payload.provider || 'email', {
      fullName: payload.fullName || ''
    });
  } catch (error) {
    console.warn('[AuthManager] No se pudo leer la sesion local:', error);
    return null;
  }
}

function readLocalUsers() {
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('[AuthManager] No se pudo leer el indice local de accesos:', error);
    return [];
  }
}

function writeLocalUsers(users) {
  try {
    localStorage.setItem(LOCAL_AUTH_USERS_KEY, JSON.stringify(users.slice(0, 24)));
  } catch (error) {
    console.warn('[AuthManager] No se pudo persistir el indice local de accesos:', error);
  }
}

function findLocalAccount(email) {
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail) return null;
  return readLocalUsers().find(user => cleanEmail(user?.email) === normalizedEmail) || null;
}

function upsertLocalAccount(account = {}) {
  const normalizedEmail = cleanEmail(account.email);
  if (!normalizedEmail) return null;

  const normalizedProvider = account.provider === 'microsoft' ? 'azure' : (account.provider || 'email');
  const now = new Date().toISOString();
  const users = readLocalUsers().filter(user => cleanEmail(user?.email) !== normalizedEmail);
  const existing = findLocalAccount(normalizedEmail);
  const next = {
    email: normalizedEmail,
    provider: normalizedProvider,
    fullName: cleanText(account.fullName || existing?.fullName || ''),
    password: normalizedProvider === 'email'
      ? String(account.password ?? existing?.password ?? '')
      : String(existing?.password ?? ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  users.unshift(next);
  writeLocalUsers(users);
  return next;
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
  AppState.company.authStatus = user
    ? (session?.local ? 'authenticated_local' : 'authenticated')
    : 'anonymous';

  exposeTokenGetter();

  document.dispatchEvent(new CustomEvent('escale:auth-changed', {
    detail: {
      userId: AppState.company.authUserId,
      email: AppState.company.authEmail,
      provider: AppState.company.authProvider,
      local: Boolean(session?.local),
      fullName
    }
  }));
}

async function init() {
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await client.auth.getSession();
      if (error) console.warn('[AuthManager] No se pudo recuperar la sesion Supabase:', error.message);

      const cloudSession = normalizeSupabaseSession(data?.session);

      if (!cloudSession) {
        // Sin sesión en Supabase → redirigir al portal para autenticar
        redirectToPortalLogin(window.location.href);
        return null;
      }

      hydrateAuthState(cloudSession);

      if (!supabaseSubscription) {
        const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
          const normalized = normalizeSupabaseSession(session);
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
  } catch (error) {
    console.warn('[AuthManager] Supabase Auth no disponible, usando modo local:', error);
  }

  // Supabase no configurado: modo local/demo (sin redirección)
  const localSession = readLocalSession();
  hydrateAuthState(localSession);
  return localSession;
}

function suggestProvider(email) {
  const normalized = cleanEmail(email);
  const domain = extractDomain(normalized);

  if (!normalized || !domain) {
    return {
      primaryProvider: 'email',
      domain: '',
      title: 'Pon tu correo para continuar',
      description: 'Luego podras elegir Google o entrar con correo.'
    };
  }

  if (GOOGLE_DOMAINS.has(domain)) {
    return {
      primaryProvider: 'google',
      domain,
      title: 'Cuenta Google detectada',
      description: 'Usa Google si ese correo es el que sueles utilizar con E-scale.'
    };
  }

  if (MICROSOFT_DOMAINS.has(domain)) {
    return {
      primaryProvider: 'email',
      domain,
      title: 'Correo detectado',
      description: 'Microsoft queda oculto por ahora. Puedes entrar con correo o usar Google.'
    };
  }

  return {
    primaryProvider: 'email',
    domain,
    title: `Dominio ${domain} detectado`,
    description: 'Si ya usaste este dominio en este equipo, recuperaremos los datos guardados.'
  };
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

async function mockSignIn(provider, email, options = {}) {
  const normalizedEmail = cleanEmail(email);
  const normalizedProvider = provider === 'microsoft' ? 'azure' : provider;
  const fullName = cleanText(options.fullName);
  const password = String(options.password || '');
  const createAccount = Boolean(options.createAccount);

  if (!normalizedEmail) throw new Error('Necesitas indicar un correo.');

  // ─── Supabase email auth ──────────────────────────────────
  if (normalizedProvider === 'email') {
    const client = getSupabaseClient();
    if (client) {
      if (createAccount) {
        // El alta vive en el portal Scale — redirigir en vez de crear cuenta aquí
        redirectToPortalLogin();
        return { data: null, error: null, redirecting: true };
      } else {
        const { data, error } = await client.auth.signInWithPassword({
          email: normalizedEmail,
          password
        });
        if (error) throw new Error('Usuario o contraseña incorrectos.');
        const session = normalizeSupabaseSession(data.session);
        saveLocalSession(session);
        hydrateAuthState(session);
        return { data: { session }, error: null };
      }
    }
  }

  // ─── Fallback local (sin Supabase) ───────────────────────
  const storedAccount = findLocalAccount(normalizedEmail);

  if (normalizedProvider === 'email') {
    if (createAccount) {
      if (!password) {
        throw new Error('Escribe una contraseña para crear la cuenta.');
      }
      if (storedAccount?.password && storedAccount.password !== password) {
        throw new Error('Ya existe una cuenta local con ese correo. Inicia sesion para continuar.');
      }
      upsertLocalAccount({ email: normalizedEmail, provider: normalizedProvider, fullName, password });
    } else {
      if (!storedAccount) {
        throw new Error('Usuario o contraseña incorrectos.');
      }
      if (storedAccount.password) {
        if (!password || storedAccount.password !== password) {
          throw new Error('Usuario o contraseña incorrectos.');
        }
      }
    }
  } else if (createAccount || storedAccount || fullName) {
    upsertLocalAccount({ email: normalizedEmail, provider: normalizedProvider, fullName });
  }

  const account = findLocalAccount(normalizedEmail);
  const session = buildLocalSession(normalizedEmail, normalizedProvider, {
    fullName: fullName || account?.fullName || ''
  });

  saveLocalSession(session);
  hydrateAuthState(session);
  return { data: { session }, error: null };
}

async function signInWithGoogle(options = {}) {
  const client = getSupabaseClient();
  if (client) {
    const redirectTo = options.redirectTo || `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });
    if (error) throw error;
    return { data, error: null, redirecting: true };
  }

  const email = cleanEmail(options.email);
  if (!email) throw new Error('En modo local necesitas indicar un correo para simular Google.');
  return mockSignIn('google', email, options);
}

async function signOut() {
  saveLocalSession(null);
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
  suggestProvider,
  mockSignIn,
  signInWithGoogle,
  signOut,
  getSession,
  isAuthenticated,
  providerLabel,
  findLocalAccount,
  redirectToPortalLogin,
  getPortalUrl,
  getSupabaseClient: () => supabaseClient
};

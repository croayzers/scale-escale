const {
  env,
  supabaseProjectUrl,
  supabasePublicKey,
  supabaseRestUrl,
  supabaseStorageUrl,
  supabaseServerKey
} = require('./env');
const { normalizePlanCode, planName } = require('./plans');

// Schema compartido: companies + company_members (00_scale_core.sql)
// Incluye campos de perfil comunes (03_company_profile_fields.sql)
const COMPANY_SELECT = 'id,nombre,pais,apps,flags,logo_url,billing_email,phone,website,cif,created_at';

// Normaliza una fila de `companies` al shape que esperan los endpoints y el cliente.
// Agrega campos de escale.empresa_config (config) y subscriptions (sub) si se pasan.
// Los campos comunes (logo_url, billing_email, phone, website, cif) tienen prioridad
// en public.companies; escale.empresa_config es fallback para retrocompatibilidad.
function companyToOrg(company, { config = null, sub = null, rol = '' } = {}) {
  const planCode = normalizePlanCode(sub?.plan || 'free_lite');
  return {
    id: company.id,
    nombre: company.nombre || '',
    display_name: company.nombre || '',   // backward compat
    displayName: company.nombre || '',
    legal_name: company.nombre || '',
    billing_email: company.billing_email || config?.billing_email || null,
    phone:         company.phone         || config?.phone         || null,
    website:       company.website       || config?.website       || null,
    cif:           company.cif           || config?.cif           || null,
    // logo_url en public.companies es URL completa; config.logo_url es ruta relativa
    logo_url:  company.logo_url  || null,
    logo_path: company.logo_url  || config?.logo_url || null,
    venue_default: config?.venue_default || null,
    current_tier_code: planCode,
    apps: company.apps || [],
    flags: company.flags || {},
    pais: company.pais || 'ES',
    created_at: company.created_at,
    _rol: rol
  };
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com'
]);

const ROLE_PRIORITY = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1
};

const PLAN_PRIORITY = {
  premium: 3,
  pro: 2,
  free_lite: 1
};

function hasSupabaseServiceRole() {
  return Boolean(supabaseProjectUrl() && supabaseServerKey());
}

function isJwtLike(value) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(value || ''));
}

function supabaseHeaders(extra = {}) {
  const key = supabaseServerKey();
  return {
    apikey: key,
    ...(isJwtLike(key) ? { Authorization: `Bearer ${key}` } : {}),
    ...extra
  };
}

function isMissingSchemaObjectError(error) {
  const message = String(error?.message || error || '');
  return /PGRST20[045]|Could not find the table|relation .* does not exist|column .* does not exist|schema cache/i.test(message);
}

async function supabaseRest(path, { method = 'GET', query = '', body, headers = {} } = {}) {
  const baseUrl = supabaseRestUrl();
  if (!baseUrl || !supabaseServerKey()) {
    return null;
  }

  const response = await fetch(`${baseUrl}/${path}${query}`, {
    method,
    headers: {
      ...supabaseHeaders(body ? { 'Content-Type': 'application/json', Prefer: 'return=representation' } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase REST ${method} ${path} failed: ${text}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Wrapper que enruta al schema escale.* via PostgREST schema headers
async function escaleRest(path, { method = 'GET', query = '', body, headers = {} } = {}) {
  const schemaHeader = method === 'GET'
    ? { 'Accept-Profile': 'escale' }
    : { 'Content-Profile': 'escale', 'Accept-Profile': 'escale' };
  return supabaseRest(path, { method, query, body, headers: { ...schemaHeader, ...headers } });
}

function sanitizeSlug(value) {
  return String(value || 'escale')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'escale';
}

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function extractEmailDomain(email) {
  const clean = cleanEmail(email);
  const at = clean.indexOf('@');
  return at > 0 ? clean.slice(at + 1) : '';
}

function emailLocalPart(email) {
  const clean = cleanEmail(email);
  const at = clean.indexOf('@');
  return at > 0 ? clean.slice(0, at) : clean;
}

function isPublicEmailDomain(domain) {
  return PUBLIC_EMAIL_DOMAINS.has(String(domain || '').toLowerCase());
}

function planPriority(planCode) {
  return PLAN_PRIORITY[normalizePlanCode(planCode)] || 0;
}

function rolePriority(role) {
  return ROLE_PRIORITY[String(role || '').toLowerCase()] || 0;
}

function preferredOrganizationScore(candidate, preferredOrganizationId) {
  if (!candidate?.organization?.id) return -1;
  if (preferredOrganizationId && candidate.organization.id === preferredOrganizationId) return 100;
  return (planPriority(candidate.organization.current_tier_code) * 10) + rolePriority(candidate.role);
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function uploadStorageObject(bucket, objectPath, dataUrl) {
  const parsed = dataUrlToBuffer(dataUrl);
  if (!parsed || !bucket) return null;
  const storageBaseUrl = supabaseStorageUrl();
  if (!storageBaseUrl) return null;

  const response = await fetch(
    `${storageBaseUrl}/object/${bucket}/${objectPath}`,
    {
      method: 'POST',
      headers: supabaseHeaders({
        'Content-Type': parsed.mimeType,
        'x-upsert': 'true'
      }),
      body: parsed.buffer
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase Storage upload failed: ${text}`);
  }

  return objectPath;
}

function userDisplayName(user) {
  const metadata = user?.user_metadata || {};
  return cleanText(
    metadata.full_name ||
    metadata.name ||
    metadata.user_name ||
    metadata.preferred_username ||
    ''
  );
}

function userProvider(user) {
  return cleanText(
    user?.app_metadata?.provider ||
    user?.identities?.[0]?.provider ||
    'email'
  );
}

function normalizeUser(user) {
  if (!user?.id || !user?.email) return null;
  return {
    id: user.id,
    email: cleanEmail(user.email),
    provider: userProvider(user) || 'email',
    fullName: userDisplayName(user),
    raw: user
  };
}

async function getAuthUser(accessToken) {
  const projectUrl = supabaseProjectUrl();
  const apiKey = supabasePublicKey() || supabaseServerKey();
  if (!projectUrl || !apiKey || !accessToken) return null;

  const response = await fetch(`${projectUrl}/auth/v1/user`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase Auth user lookup failed: ${text}`);
  }

  const payload = await response.json();
  return normalizeUser(payload);
}

// ── Helpers internos para escale.empresa_config y subscriptions ──────────────

async function findEscaleConfig(companyId) {
  if (!companyId) return null;
  try {
    const rows = await escaleRest('empresa_config', {
      query: `?select=logo_url,venue_default,billing_email,cif,phone&company_id=eq.${companyId}&limit=1`
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch { return null; }
}

async function findSubscription(companyId) {
  if (!companyId) return null;
  try {
    const rows = await supabaseRest('subscriptions', {
      query: `?select=company_id,tier_id,estado,stripe_customer_id,stripe_subscription_id&company_id=eq.${companyId}&limit=1`
    });
    if (!Array.isArray(rows) || !rows[0]) return null;
    const row = rows[0];
    // tier_id es el nombre real en public.subscriptions; plan es el alias que usa companyToOrg
    return { ...row, plan: row.tier_id };
  } catch { return null; }
}

async function enrichCompany(company) {
  if (!company?.id) return company;
  const [config, sub] = await Promise.all([findEscaleConfig(company.id), findSubscription(company.id)]);
  return companyToOrg(company, { config, sub });
}

// ── Funciones públicas (misma firma que antes para no cambiar los endpoints) ──

async function findOrganizationById(companyId) {
  if (!companyId) return null;
  const rows = await supabaseRest('companies', {
    query: `?select=${COMPANY_SELECT}&id=eq.${companyId}&limit=1`
  });
  return Array.isArray(rows) && rows[0] ? enrichCompany(rows[0]) : null;
}

async function findOrganizationByEmail(email) {
  const clean = cleanEmail(email);
  if (!clean) return null;
  // Busca por billing_email en escale.empresa_config
  try {
    const cfgRows = await escaleRest('empresa_config', {
      query: `?select=company_id&billing_email=ilike.${encodeURIComponent(clean)}&limit=1`
    });
    const companyId = Array.isArray(cfgRows) && cfgRows[0]?.company_id;
    if (companyId) return findOrganizationById(companyId);
  } catch { /* tabla puede no tener billing_email aún */ }
  return null;
}

async function findOrganizationsByDomain(domain) {
  const cleanDomain = cleanText(domain).toLowerCase();
  if (!cleanDomain) return [];
  try {
    const cfgRows = await escaleRest('empresa_config', {
      query: `?select=company_id&billing_email=ilike.${encodeURIComponent(`*@${cleanDomain}`)}&limit=8`
    });
    if (!Array.isArray(cfgRows) || !cfgRows.length) return [];
    const ids = cfgRows.map(r => r.company_id).filter(Boolean);
    if (!ids.length) return [];
    const rows = await supabaseRest('companies', {
      query: `?select=${COMPANY_SELECT}&id=in.(${ids.join(',')})&limit=8`
    });
    return Array.isArray(rows) ? await Promise.all(rows.map(enrichCompany)) : [];
  } catch { return []; }
}

async function listUserMemberships(userId) {
  if (!userId) return [];
  const memberRows = await supabaseRest('company_members', {
    query: `?select=company_id,rol&user_id=eq.${userId}`
  });
  if (!Array.isArray(memberRows) || !memberRows.length) return [];

  const ids = memberRows.map(r => r.company_id).filter(Boolean);
  if (!ids.length) return [];

  // Fetch companies AND subscriptions en paralelo.
  // Las subscriptions son opcionales: si fallan (RLS, columna faltante, etc.)
  // la auth sigue funcionando y el plan queda como free_lite.
  const [companyRows, subRows] = await Promise.all([
    supabaseRest('companies', {
      query: `?select=${COMPANY_SELECT}&id=in.(${ids.join(',')})`
    }),
    supabaseRest('subscriptions', {
      query: `?select=company_id,tier_id,estado&company_id=in.(${ids.join(',')})`
    }).catch(() => null)
  ]);

  const byId = new Map((Array.isArray(companyRows) ? companyRows : []).map(c => [c.id, c]));
  // tier_id → plan alias para que companyToOrg lo lea correctamente
  const subById = new Map(
    (Array.isArray(subRows) ? subRows : []).map(s => [s.company_id, { ...s, plan: s.tier_id }])
  );

  return memberRows
    .filter(r => byId.has(r.company_id))
    .map(r => ({
      id: `${r.company_id}:${userId}`,
      organizationId: r.company_id,
      companyId: r.company_id,
      role: r.rol,
      status: 'active',
      organization: companyToOrg(byId.get(r.company_id), {
        sub: subById.get(r.company_id) || null,
        rol: r.rol
      })
    }));
}

async function ensureOrganizationMembership(companyId, userId, rol = 'viewer') {
  if (!companyId || !userId) return null;
  const result = await supabaseRest('company_members', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: { company_id: companyId, user_id: userId, rol }
  });
  return Array.isArray(result) && result[0] ? result[0] : { company_id: companyId, user_id: userId, rol };
}

async function setOrganizationOwner(companyId, userId) {
  if (!companyId || !userId) return null;
  return ensureOrganizationMembership(companyId, userId, 'owner');
}

async function setUserActiveCompany(userId, companyId) {
  if (!userId || !companyId) return;
  await supabaseRest('user_profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: { user_id: userId, active_company_id: companyId }
  }).catch(() => null);
}

async function upsertUserProfileFromAuth(user, persona = 'company') {
  if (!user?.id) return null;

  try {
    const rows = await supabaseRest('user_profiles', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: {
        user_id: user.id,
        full_name: user.fullName || null,
        persona
      }
    });

    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (error) {
    if (isMissingSchemaObjectError(error)) {
      console.warn('[Supabase] user_profiles no existe o no esta en cache. Continua login sin perfil persistido.');
      return null;
    }
    throw error;
  }
}

async function findOwnedOrganizations(userId) {
  if (!userId) return [];
  const memberRows = await supabaseRest('company_members', {
    query: `?select=company_id&user_id=eq.${userId}&rol=eq.owner&limit=8`
  });
  if (!Array.isArray(memberRows) || !memberRows.length) return [];

  const ids = memberRows.map(r => r.company_id).filter(Boolean);
  if (!ids.length) return [];
  const companyRows = await supabaseRest('companies', {
    query: `?select=${COMPANY_SELECT}&id=in.(${ids.join(',')})`
  });
  return (Array.isArray(companyRows) ? companyRows : []).map(c => companyToOrg(c, { rol: 'owner' }));
}

async function syncOrganizationProfile(companyId, company = {}) {
  const organization = await findOrganizationById(companyId);
  if (!organization) return null;

  const logoBucket = env('ESCALE_SUPABASE_BUCKET_LOGOS', 'company-logos');
  const nombre = cleanText(company.name) || organization.nombre || 'E-scale';
  const companyEmail = cleanEmail(company.email);
  const currentBillingEmail = cleanEmail(organization.billing_email);
  const canUpdateBillingEmail = !currentBillingEmail || normalizePlanCode(organization.current_tier_code) === 'free_lite';
  const billingEmail = canUpdateBillingEmail ? (companyEmail || currentBillingEmail || null) : (currentBillingEmail || null);

  // Subir logo si viene como data URL → ruta relativa en Storage
  let logoRelativePath = organization.logo_path || null;
  let logoFullUrl = organization.logo_url || null;
  if (company.logoDataUrl) {
    const fileExt = dataUrlToBuffer(company.logoDataUrl)?.mimeType?.includes('png') ? 'png' : 'jpg';
    logoRelativePath = await uploadStorageObject(
      logoBucket,
      `${companyId}/logo-${Date.now()}.${fileExt}`,
      company.logoDataUrl
    );
    // Construir URL completa para public.companies.logo_url
    if (logoRelativePath) {
      const base = supabaseProjectUrl();
      const bucket = logoBucket;
      logoFullUrl = base ? `${base}/storage/v1/object/public/${bucket}/${logoRelativePath}` : null;
    }
  }

  // ── Campos comunes → public.companies ──────────────────────
  const publicPatch = { nombre };
  if (billingEmail !== undefined) publicPatch.billing_email = billingEmail;
  if (logoFullUrl)                publicPatch.logo_url = logoFullUrl;
  if (company.phone !== undefined)   publicPatch.phone   = cleanText(company.phone)   || null;
  if (company.website !== undefined) publicPatch.website = cleanText(company.website) || null;
  if (company.cif !== undefined)     publicPatch.cif     = cleanText(company.cif)     || null;
  await supabaseRest('companies', { method: 'PATCH', query: `?id=eq.${companyId}`, body: publicPatch });

  // ── Campos específicos de E-Scale → escale.empresa_config ──
  await escaleRest('empresa_config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: {
      company_id: companyId,
      billing_email: billingEmail,
      venue_default: cleanText(company.venueName) || organization.venue_default || null,
      logo_url: logoRelativePath,
      phone: publicPatch.phone ?? organization.phone ?? null,
      cif:   publicPatch.cif   ?? organization.cif   ?? null
    }
  });

  return { ...organization, nombre, billing_email: billingEmail, logo_path: logoRelativePath, logo_url: logoFullUrl };
}

async function getOrCreatePersonalOrganization(user, company = {}) {
  const owned = await findOwnedOrganizations(user.id);
  const preferred = owned.sort((a, b) => planPriority(b.current_tier_code) - planPriority(a.current_tier_code))[0];
  if (preferred) return preferred;

  const exactMatch = await findOrganizationByEmail(user.email);
  if (exactMatch) {
    const ownerRows = await supabaseRest('company_members', {
      query: `?select=user_id&company_id=eq.${exactMatch.id}&rol=eq.owner&limit=1`
    });
    const existingOwner = Array.isArray(ownerRows) && ownerRows[0]?.user_id;
    const rol = (!existingOwner || existingOwner === user.id) ? 'owner' : 'admin';
    await ensureOrganizationMembership(exactMatch.id, user.id, rol);
    return findOrganizationById(exactMatch.id);
  }

  const nombre = cleanText(company.name) || user.fullName || emailLocalPart(user.email) || 'Mi espacio';
  const rows = await supabaseRest('companies', {
    method: 'POST',
    body: { nombre, pais: 'ES', apps: [], flags: {} }
  });
  const created = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (created?.id) {
    await ensureOrganizationMembership(created.id, user.id, 'owner');
    await escaleRest('empresa_config', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: { company_id: created.id, billing_email: user.email || null, venue_default: cleanText(company.venueName) || null }
    });
  }
  return created ? companyToOrg(created, { rol: 'owner' }) : null;
}

async function resolveAuthenticatedContext(accessToken, company = {}) {
  const user = await getAuthUser(accessToken);
  if (!user) {
    return {
      authenticated: false,
      reason: 'invalid_access_token',
      planCode: 'free_lite'
    };
  }

  await upsertUserProfileFromAuth(user);

  try {
    // Leer active_company_id del Portal como preferencia de organización
    let preferredOrganizationId = cleanText(company.organizationId || company.id);
    if (!preferredOrganizationId) {
      try {
        const profileRows = await supabaseRest('user_profiles', {
          query: `?select=active_company_id&user_id=eq.${user.id}&limit=1`
        });
        if (Array.isArray(profileRows) && profileRows[0]?.active_company_id) {
          preferredOrganizationId = profileRows[0].active_company_id;
        }
      } catch { /* non-fatal */ }
    }

    const memberships = await listUserMemberships(user.id);
    const selectedMembership = memberships
      .sort((left, right) => preferredOrganizationScore(right, preferredOrganizationId) - preferredOrganizationScore(left, preferredOrganizationId))[0];

    if (selectedMembership?.organization?.id) {
      const billing = await findBillingCustomer(selectedMembership.organization.id);
      return {
        authenticated: true,
        user,
        organization: selectedMembership.organization,
        role: selectedMembership.role,
        source: 'membership',
        planCode: normalizePlanCode(selectedMembership.organization.current_tier_code),
        billing,
        detectedOrganization: null,
        detectedDomain: extractEmailDomain(user.email),
        needsInvite: false
      };
    }

    const exactEmailOrganization = await findOrganizationByEmail(user.email);
    if (exactEmailOrganization?.id) {
      const ownerRows = await supabaseRest('company_members', {
        query: `?select=user_id&company_id=eq.${exactEmailOrganization.id}&rol=eq.owner&limit=1`
      });
      const existingOwner = Array.isArray(ownerRows) && ownerRows[0]?.user_id;
      const role = (existingOwner && existingOwner !== user.id) ? 'admin' : 'owner';
      await ensureOrganizationMembership(exactEmailOrganization.id, user.id, role);

      const organization = await findOrganizationById(exactEmailOrganization.id);
      const billing = await findBillingCustomer(exactEmailOrganization.id);
      return {
        authenticated: true,
        user,
        organization,
        role,
        source: 'billing_email',
        planCode: normalizePlanCode(organization?.current_tier_code),
        billing,
        detectedOrganization: null,
        detectedDomain: extractEmailDomain(user.email),
        needsInvite: false
      };
    }

    const detectedDomain = extractEmailDomain(user.email);

    // ── Requisito 1: mismo dominio corporativo ────────────────────────────────
    if (detectedDomain && !isPublicEmailDomain(detectedDomain)) {
      const candidates = await findOrganizationsByDomain(detectedDomain);
      const paidCandidates = candidates.filter(candidate => normalizePlanCode(candidate.current_tier_code) !== 'free_lite');
      if (paidCandidates.length === 1) {
        const domainOrg = paidCandidates[0];
        await ensureOrganizationMembership(domainOrg.id, user.id, 'editor');
        const organization = await findOrganizationById(domainOrg.id);
        const billing = await findBillingCustomer(domainOrg.id);
        return {
          authenticated: true,
          user,
          organization,
          role: 'editor',
          source: 'domain',
          planCode: normalizePlanCode(organization?.current_tier_code),
          billing,
          detectedOrganization: null,
          detectedDomain,
          needsInvite: false
        };
      }
    }

    // ── Requisito 2: invitación pendiente por email ───────────────────────────
    if (user.email) {
      const invite = await findPendingInvitationByEmail(user.email);
      if (invite?.company_id) {
        await ensureOrganizationMembership(invite.company_id, user.id, invite.invited_role || 'editor');
        await acceptInvitation(invite.id);
        const invitedOrg = await findOrganizationById(invite.company_id);
        const billing = invitedOrg?.id ? await findBillingCustomer(invitedOrg.id) : null;
        return {
          authenticated: true,
          user,
          organization: invitedOrg,
          role: invite.invited_role || 'editor',
          source: 'invitation',
          planCode: normalizePlanCode(invitedOrg?.current_tier_code),
          billing,
          detectedOrganization: null,
          detectedDomain,
          needsInvite: false
        };
      }
    }

    // ── Sin requisito cumplido: org personal propia ───────────────────────────
    const organization = await getOrCreatePersonalOrganization(user, company);
    const billing = organization?.id ? await findBillingCustomer(organization.id) : null;

    return {
      authenticated: true,
      user,
      organization,
      role: 'owner',
      source: 'personal_free',
      planCode: normalizePlanCode(organization?.current_tier_code),
      billing,
      detectedOrganization,
      detectedDomain,
      needsInvite: Boolean(detectedOrganization)
    };
  } catch (error) {
    if (!isMissingSchemaObjectError(error)) throw error;
    console.warn('[Supabase] Esquema de app incompleto. Login continua en Free Lite hasta aplicar supabase/schema.sql.');
    return {
      authenticated: true,
      user,
      organization: null,
      role: '',
      source: 'auth_only_schema_missing',
      planCode: 'free_lite',
      billing: null,
      detectedOrganization: null,
      detectedDomain: extractEmailDomain(user.email),
      needsInvite: false,
      dbNeedsMigration: true
    };
  }
}

async function upsertOrganization(company) {
  if (!hasSupabaseServiceRole()) return { ok: false, skipped: true };

  const hasIdentity = Boolean(cleanText(company.name) || cleanEmail(company.email));
  if (!hasIdentity) return { ok: false, skipped: true, reason: 'insufficient_company_identity' };

  const planCode = normalizePlanCode(company.subscriptionPlanCode || company.subscriptionPlan);
  const logoBucket = env('ESCALE_SUPABASE_BUCKET_LOGOS', 'company-logos');
  const nombre = cleanText(company.name) || 'E-scale';

  let existingCompany = await findOrganizationByEmail(company.email);
  let logoUrl = existingCompany?.logo_path || '';

  if (company.logoDataUrl) {
    const fileExt = dataUrlToBuffer(company.logoDataUrl)?.mimeType?.includes('png') ? 'png' : 'jpg';
    logoUrl = await uploadStorageObject(
      logoBucket,
      `${existingCompany?.id || 'new'}/logo-${Date.now()}.${fileExt}`,
      company.logoDataUrl
    );
  }

  let companyRow;
  if (existingCompany?.id) {
    const rows = await supabaseRest('companies', {
      method: 'PATCH',
      query: `?id=eq.${existingCompany.id}`,
      body: { nombre }
    });
    companyRow = Array.isArray(rows) && rows[0] ? rows[0] : { ...existingCompany, nombre };
  } else {
    const rows = await supabaseRest('companies', {
      method: 'POST',
      body: { nombre, pais: 'ES', apps: [], flags: {} }
    });
    companyRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  if (companyRow?.id) {
    await escaleRest('empresa_config', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: {
        company_id: companyRow.id,
        billing_email: cleanEmail(company.email) || null,
        venue_default: cleanText(company.venueName) || null,
        logo_url: logoUrl || null
      }
    });
  }

  const org = companyRow ? companyToOrg(companyRow, { sub: { plan: planCode } }) : null;
  return {
    ok: true,
    organization: org,
    company: {
      organizationId: companyRow?.id,
      subscriptionPlanCode: planCode,
      subscriptionPlan: planName(planCode),
      logoRelativePath: logoUrl
    }
  };
}

async function findBillingCustomer(companyId) {
  if (!companyId) return null;
  try {
    const rows = await supabaseRest('subscriptions', {
      query: `?select=company_id,tier_id,estado,stripe_customer_id,stripe_subscription_id,stripe_price_id&company_id=eq.${companyId}&limit=1`
    });
    if (!Array.isArray(rows) || !rows[0]) return null;
    const row = rows[0];
    return { ...row, plan: row.tier_id, subscription_status: row.estado };
  } catch { return null; }
}

async function insertExportJob({ organizationId, exportPayload, attachmentPath, createdByUserId = null }) {
  const rows = await escaleRest('export_jobs', {
    method: 'POST',
    body: {
      company_id: organizationId,
      created_by_user_id: createdByUserId || null,
      export_type: exportPayload.exportType,
      status: 'completed',
      event_name: cleanText(exportPayload.eventName) || null,
      venue_name: cleanText(exportPayload.venueName) || null,
      pdf_storage_path: attachmentPath || null,
      total_pax: Number(exportPayload.totalPax || 0),
      total_inventory_items: Number(exportPayload.totalInventoryItems || 0),
      total_inventory_categories: Number(exportPayload.totalInventoryCategories || 0),
      scene_snapshot: exportPayload.sceneSnapshot || {},
      metadata: {
        filename: exportPayload.filename || '',
        source: 'web-app'
      },
      completed_at: new Date().toISOString()
    }
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function insertExportLines(exportJobId, inventoryLines = []) {
  if (!exportJobId || !inventoryLines.length) return [];
  return await escaleRest('export_inventory_lines', {
    method: 'POST',
    body: inventoryLines.map(line => ({
      export_job_id: exportJobId,
      category: cleanText(line.category) || 'Otros',
      item_type: cleanText(line.itemType) || 'item',
      item_label: cleanText(line.itemLabel) || 'Item',
      quantity: Number(line.quantity || 0),
      pax: Number(line.pax || 0),
      unit_price_eur: line.unitPriceEur ?? null
    }))
  });
}

async function insertAuditEvent(organizationId, eventType, payload, actorUserId = null) {
  if (!organizationId) return null;
  return await escaleRest('audit_events', {
    method: 'POST',
    body: {
      company_id: organizationId,
      actor_user_id: actorUserId || null,
      event_type: eventType,
      event_payload: payload || {}
    }
  });
}

async function searchFloorPlans(q, limit = 24, { city, type } = {}) {
  const parts = [`?select=id,venue_name,city,type,zone,thumbnail_url,image_url`];
  if (q) parts.push(`&venue_name=ilike.${encodeURIComponent(`*${q}*`)}`);
  if (city) parts.push(`&city=eq.${encodeURIComponent(city)}`);
  if (type) parts.push(`&type=eq.${encodeURIComponent(type)}`);
  parts.push(`&order=venue_name.asc`, `&limit=${limit}`);

  const rows = await escaleRest('floor_plans', { query: parts.join('') });
  return Array.isArray(rows) ? rows : [];
}

async function getFloorPlanFilters() {
  const rows = await escaleRest('floor_plans', {
    query: '?select=city,type&limit=500'
  });
  if (!Array.isArray(rows)) return { cities: [], types: [] };
  const cities = [...new Set(rows.map(r => r.city).filter(Boolean))].sort();
  const types  = [...new Set(rows.map(r => r.type).filter(Boolean))].sort();
  return { cities, types };
}

async function searchCommunityFloorPlans(q, limit = 500, { city, type } = {}) {
  const parts = [`?select=id,name,venue,ciudad,tipo,created_by_display_name,created_at`];
  if (q) parts.push(`&name=ilike.${encodeURIComponent(`*${q}*`)}`);
  if (city) parts.push(`&ciudad=eq.${encodeURIComponent(city)}`);
  if (type) parts.push(`&tipo=eq.${encodeURIComponent(type)}`);
  parts.push(`&order=created_at.desc`, `&limit=${limit}`);
  try {
    const rows = await escaleRest('org_floor_plans', { query: parts.join('') });
    if (Array.isArray(rows)) return rows;
  } catch { /* fallback sin ciudad/tipo */ }
  const fallback = [`?select=id,name,venue,created_by_display_name,created_at`];
  if (q) fallback.push(`&name=ilike.${encodeURIComponent(`*${q}*`)}`);
  fallback.push(`&order=created_at.desc`, `&limit=${limit}`);
  const rows = await escaleRest('org_floor_plans', { query: fallback.join('') });
  return Array.isArray(rows) ? rows : [];
}

async function getCommunityFloorPlanFilters() {
  const rows = await escaleRest('org_floor_plans', { query: '?select=ciudad,tipo&limit=500' });
  if (!Array.isArray(rows)) return { cities: [], types: [] };
  const cities = [...new Set(rows.map(r => r.ciudad).filter(Boolean))].sort();
  const types  = [...new Set(rows.map(r => r.tipo).filter(Boolean))].sort();
  return { cities, types };
}

async function loadCommunityFloorPlan(id) {
  if (!id) return null;
  const rows = await escaleRest('org_floor_plans', {
    query: `?select=id,name,width_m,length_m,opacity,image_data_url&id=eq.${encodeURIComponent(id)}&limit=1`
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/* ── org_floor_plans — operaciones con service role (bypass RLS) ── */

async function listOrgFloorPlans(orgId) {
  // ciudad/tipo son columnas opcionales añadidas por migración; se intentan primero,
  // si la tabla aún no las tiene (400) se reintenta sin ellas.
  const base = `?company_id=eq.${encodeURIComponent(orgId)}&order=created_at.desc&limit=500`;
  try {
    const rows = await escaleRest('org_floor_plans', {
      query: `${base}&select=id,name,venue,ciudad,tipo,width_m,length_m,opacity,created_by_display_name,created_at`
    });
    if (Array.isArray(rows)) return rows;
  } catch { /* columnas opcionales no existen — fallback */ }
  const rows = await escaleRest('org_floor_plans', {
    query: `${base}&select=id,name,venue,width_m,length_m,opacity,created_by_display_name,created_at`
  });
  return Array.isArray(rows) ? rows : [];
}

async function saveOrgFloorPlan({ orgId, userId, userName, name, venue, ciudad, tipo, cliente, widthM, lengthM, opacity, imageDataUrl }) {
  const clean = cleanText(name);
  const dup = await escaleRest('org_floor_plans', {
    query: `?select=id&company_id=eq.${encodeURIComponent(orgId)}&name=eq.${encodeURIComponent(clean)}&limit=1`
  });
  if (Array.isArray(dup) && dup.length > 0) return { skipped: true };

  const body = {
    company_id: orgId,
    created_by_user_id: userId || null,
    created_by_display_name: userName || null,
    name: clean,
    venue: venue || null,
    width_m: widthM || null,
    length_m: lengthM || null,
    opacity: opacity ?? null,
    image_data_url: imageDataUrl || null,
  };

  // Intentar con ciudad/tipo/cliente; si fallan (columnas no existen) reintentar sin ellas
  try {
    const rows = await escaleRest('org_floor_plans', {
      method: 'POST',
      body: { ...body, ciudad: ciudad || null, tipo: tipo || null, cliente: cliente || null }
    });
    if (Array.isArray(rows) && rows[0]) return rows[0];
  } catch {
    /* columnas opcionales no existen aún — continuar sin ellas */
  }
  const rows = await escaleRest('org_floor_plans', { method: 'POST', body });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function loadOrgFloorPlanById(orgId, id) {
  const rows = await escaleRest('org_floor_plans', {
    query: `?select=id,name,width_m,length_m,opacity,image_data_url,ciudad,tipo,cliente,venue&id=eq.${encodeURIComponent(id)}&company_id=eq.${encodeURIComponent(orgId)}&limit=1`
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/* ── Org Templates (server-side, bypass RLS) ──────────────────────────────── */

async function listOrgTemplates(orgId, kind) {
  let query = `?company_id=eq.${encodeURIComponent(orgId)}&order=created_at.desc&limit=200&select=id,name,kind,created_by_display_name,created_at`;
  if (kind) query += `&kind=eq.${encodeURIComponent(kind)}`;
  const rows = await escaleRest('org_templates', { query });
  return Array.isArray(rows) ? rows : [];
}

async function saveOrgTemplate({ orgId, userId, userName, name, kind, data }) {
  const clean = cleanText(name);
  const dup = await escaleRest('org_templates', {
    query: `?select=id&company_id=eq.${encodeURIComponent(orgId)}&kind=eq.${encodeURIComponent(kind)}&name=eq.${encodeURIComponent(clean)}&limit=1`
  });
  if (Array.isArray(dup) && dup.length > 0) return { skipped: true };
  const rows = await escaleRest('org_templates', {
    method: 'POST',
    body: { company_id: orgId, created_by_user_id: userId || null, created_by_display_name: userName || null, name: clean, kind, data }
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function loadOrgTemplateById(orgId, id) {
  const rows = await escaleRest('org_templates', {
    query: `?select=id,name,kind,data&id=eq.${encodeURIComponent(id)}&company_id=eq.${encodeURIComponent(orgId)}&limit=1`
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function deleteOrgTemplate(orgId, id) {
  if (!orgId || !id) return;
  await escaleRest('org_templates', {
    method: 'DELETE',
    query: `?id=eq.${encodeURIComponent(id)}&company_id=eq.${encodeURIComponent(orgId)}`
  });
}

async function deleteOrgFloorPlan(orgId, id) {
  if (!orgId || !id) return;
  await escaleRest('org_floor_plans', {
    method: 'DELETE',
    query: `?id=eq.${encodeURIComponent(id)}&company_id=eq.${encodeURIComponent(orgId)}`
  });
}

async function uploadExportAttachment(organizationId, filename, dataUrl) {
  const bucket = env('ESCALE_SUPABASE_BUCKET_EXPORTS', 'export-pdfs');
  const safeFilename = sanitizeSlug(filename.replace(/\.[^.]+$/, '')) || 'export';
  const ext = filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'bin';
  return await uploadStorageObject(bucket, `${organizationId}/${safeFilename}.${ext}`, dataUrl);
}

// ── Collaboration sessions ────────────────────────────────────────────────────

async function createCollabSession({ hostUserId, hostDisplayName, sessionName, guestRole, sceneSnapshot, planSnapshot }) {
  // Clean up expired sessions on every new creation
  cleanupExpiredCollabSessions().catch(() => {});

  const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await escaleRest('collab_sessions', {
    method: 'POST',
    body: {
      host_user_id: hostUserId || null,
      host_display_name: cleanText(hostDisplayName) || 'Host',
      session_name: cleanText(sessionName) || 'Colaboración',
      guest_role: guestRole === 'viewer' ? 'viewer' : 'editor',
      scene_snapshot: sceneSnapshot || [],
      plan_snapshot: planSnapshot || {},
      expires_at: expiresAt
    }
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function countCollabParticipants(sessionId) {
  if (!sessionId) return 0;
  const rows = await escaleRest('collab_participants', {
    query: `?session_id=eq.${sessionId}&select=id`
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function cleanupExpiredCollabSessions() {
  await escaleRest('collab_sessions', {
    method: 'DELETE',
    query: `?expires_at=lt.${new Date().toISOString()}`
  });
}

async function findCollabSessionByToken(inviteToken) {
  if (!inviteToken) return null;
  const rows = await escaleRest('collab_sessions', {
    query: `?select=id,session_name,host_display_name,guest_role,scene_snapshot,plan_snapshot,status,expires_at&invite_token=eq.${encodeURIComponent(inviteToken)}&status=eq.active&limit=1`
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function insertCollabParticipant({ sessionId, userId, displayName, email, role }) {
  if (!sessionId || !displayName) return null;
  const rows = await escaleRest('collab_participants', {
    method: 'POST',
    body: {
      session_id: sessionId,
      user_id: userId || null,
      display_name: cleanText(displayName).slice(0, 60),
      email: email ? cleanEmail(email) : null,
      role: role || 'editor'
    }
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function endCollabSession(sessionId) {
  if (!sessionId) return null;
  const rows = await escaleRest('collab_sessions', {
    method: 'PATCH',
    query: `?id=eq.${sessionId}`,
    body: { status: 'ended' }
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/* ════════════════════════════════════════════════════════
   INVITACIONES (organization_invitations)
   ════════════════════════════════════════════════════════ */

async function findPendingInvitationByEmail(email) {
  if (!email) return null;
  const rows = await escaleRest('org_invitations', {
    query: `?invited_email=eq.${encodeURIComponent(email.toLowerCase())}&status=eq.pending&expires_at=gt.${new Date().toISOString()}&limit=1&select=id,company_id,invited_role`
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function acceptInvitation(invitationId) {
  if (!invitationId) return;
  await escaleRest('org_invitations', {
    method: 'PATCH',
    query: `?id=eq.${invitationId}`,
    body: { status: 'accepted' }
  });
}

async function findAuthUserByEmail(email) {
  const url = supabaseProjectUrl();
  const key = supabaseServerKey();
  if (!url || !key || !email) return null;
  try {
    const res = await fetch(
      `${url}/auth/v1/admin/users?filter=${encodeURIComponent(email.toLowerCase())}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const users = Array.isArray(data) ? data : (data.users || []);
    return users.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
  } catch { return null; }
}

async function createOrgInvitation(organizationId, invitedEmail, role, invitedByUserId, invitedByName) {
  const rows = await escaleRest('org_invitations', {
    method: 'POST',
    body: {
      company_id:         organizationId,
      invited_email:      invitedEmail.toLowerCase().trim(),
      invited_role:       role || 'editor',
      invited_by_user_id: invitedByUserId || null,
      invited_by_name:    invitedByName   || null,
    },
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function listOrgInvitations(organizationId) {
  if (!organizationId) return [];
  const rows = await escaleRest('org_invitations', {
    query: `?company_id=eq.${organizationId}&status=eq.pending&select=id,invited_email,invited_role,invited_by_name,created_at,expires_at&order=created_at.desc`
  });
  return Array.isArray(rows) ? rows : [];
}

async function deleteOrgInvitation(invitationId) {
  if (!invitationId) return;
  await escaleRest('org_invitations', {
    method: 'DELETE',
    query: `?id=eq.${invitationId}`
  });
}

async function listOrgMembers(companyId) {
  if (!companyId) return [];
  const rows = await supabaseRest('company_members', {
    query: `?company_id=eq.${companyId}&select=user_id,rol,user_profiles(display_name,email)&order=rol.asc`
  });
  return (Array.isArray(rows) ? rows : []).map(r => ({ ...r, role: r.rol }));
}

async function removeOrgMember(companyId, userId) {
  if (!companyId || !userId) return;
  await supabaseRest('company_members', {
    method: 'DELETE',
    query: `?company_id=eq.${companyId}&user_id=eq.${userId}`
  });
}

module.exports = {
  hasSupabaseServiceRole,
  sanitizeSlug,
  cleanText,
  cleanEmail,
  extractEmailDomain,
  isPublicEmailDomain,
  getAuthUser,
  findOrganizationById,
  findOrganizationByEmail,
  findBillingCustomer,
  listUserMemberships,
  ensureOrganizationMembership,
  setUserActiveCompany,
  resolveAuthenticatedContext,
  findAuthUserByEmail,
  findPendingInvitationByEmail,
  acceptInvitation,
  createOrgInvitation,
  listOrgInvitations,
  deleteOrgInvitation,
  listOrgMembers,
  removeOrgMember,
  syncOrganizationProfile,
  upsertOrganization,
  insertExportJob,
  insertExportLines,
  insertAuditEvent,
  uploadExportAttachment,
  searchFloorPlans,
  getFloorPlanFilters,
  searchCommunityFloorPlans,
  getCommunityFloorPlanFilters,
  loadCommunityFloorPlan,
  listOrgFloorPlans,
  saveOrgFloorPlan,
  loadOrgFloorPlanById,
  deleteOrgFloorPlan,
  listOrgTemplates,
  saveOrgTemplate,
  loadOrgTemplateById,
  deleteOrgTemplate,
  createCollabSession,
  findCollabSessionByToken,
  countCollabParticipants,
  insertCollabParticipant,
  endCollabSession,
  cleanupExpiredCollabSessions
};

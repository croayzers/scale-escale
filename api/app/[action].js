// ============================================================================
// E-SCALE · /api/app/:action  (router consolidado de sesión/empresa/export)
// ----------------------------------------------------------------------------
// Unifica bootstrap / company-sync / export-sync en una sola función
// serverless (límite de 12 funciones del plan Hobby de Vercel). Las URLs
// públicas NO cambian: rewrites en vercel.json mapean /api/app/bootstrap,
// /api/app/company-sync y /api/app/export-sync a este [action].js.
//
//   POST /api/app/bootstrap     → sesión + plan + organización (login de cada usuario)
//   POST /api/app/company-sync  → sincroniza el perfil de empresa
//   POST /api/app/export-sync   → registra un export (inventario/PDF)
//
// La lógica de cada acción es idéntica a la de los handlers previos; solo
// cambia el enrutado por req.query.action (o última parte del path).
// ============================================================================

const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const { normalizePlanCode, planName } = require('../../lib/plans');
const {
  resolveAuthenticatedContext,
  findBillingCustomer,
  insertAuditEvent,
  syncOrganizationProfile,
  uploadExportAttachment,
  insertExportJob,
  insertExportLines
} = require('../../lib/supabase');
const { publicConfig, supabaseProjectUrl, env } = require('../../lib/env');

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function readAction(req) {
  const fromQuery = String(req.query?.action || '').trim().toLowerCase();
  if (fromQuery) return fromQuery;
  const path = String(req.url || '').split('?')[0];
  const last = path.split('/').filter(Boolean).pop() || '';
  return last.toLowerCase();
}

// Si ya es URL completa (public.companies.logo_url) la devuelve tal cual.
// Si es ruta relativa (legado escale.empresa_config.logo_url) construye la URL.
function buildLogoUrl(logoPath) {
  if (!logoPath) return null;
  if (/^https?:\/\//i.test(logoPath)) return logoPath;
  const base = supabaseProjectUrl();
  if (!base) return null;
  const bucket = env('ESCALE_SUPABASE_BUCKET_LOGOS', 'company-logos');
  return `${base}/storage/v1/object/public/${bucket}/${logoPath}`;
}

// ── POST /api/app/bootstrap ──────────────────────────────────────────────────
async function handleBootstrap(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  const body = await readJsonBody(req);
  const company = body.company || {};
  const config = publicConfig();
  const basePlanCode = normalizePlanCode(company.subscriptionPlanCode || company.subscriptionPlan);

  if (!config.features.cloudSync) {
    return json(res, 200, {
      ok: true,
      authenticated: false,
      planCode: basePlanCode,
      planName: planName(basePlanCode),
      license: { source: 'local', requiresAuth: false, needsInvite: false },
      publicConfig: config
    });
  }

  const accessToken = readBearerToken(req);
  if (!accessToken) {
    return json(res, 200, {
      ok: true,
      authenticated: false,
      planCode: 'free_lite',
      planName: planName('free_lite'),
      license: { source: 'anonymous', requiresAuth: true, needsInvite: false },
      publicConfig: config
    });
  }

  const access = await resolveAuthenticatedContext(accessToken, company);
  const planCode = normalizePlanCode(access?.organization?.current_tier_code || access?.planCode || basePlanCode);
  const org = access?.organization || null;
  // logo_url (URL completa en public.companies) tiene prioridad sobre logo_path (ruta relativa).
  const logoUrl = org?.logo_url || buildLogoUrl(org?.logo_path) || null;
  const orgFull = org ? {
    ...org,
    logoUrl,
    billing_email: org.billing_email || null,
    phone:         org.phone         || null,
    website:       org.website       || null,
    cif:           org.cif           || null
  } : null;

  return json(res, 200, {
    ok: true,
    authenticated: Boolean(access?.authenticated),
    auth: access?.authenticated ? {
      userId: access.user.id,
      email: access.user.email,
      provider: access.user.provider,
      fullName: access.user.fullName
    } : null,
    planCode,
    planName: planName(planCode),
    organization: orgFull,
    billing: access?.billing ? {
      stripeCustomerId: access.billing.stripe_customer_id,
      stripeSubscriptionId: access.billing.stripe_subscription_id,
      stripePriceId: access.billing.stripe_price_id,
      subscriptionStatus: access.billing.subscription_status
    } : null,
    license: {
      source: access?.source || 'anonymous',
      role: access?.role || '',
      requiresAuth: !access?.authenticated,
      dbNeedsMigration: Boolean(access?.dbNeedsMigration),
      needsInvite: Boolean(access?.needsInvite),
      detectedDomain: access?.detectedDomain || '',
      detectedOrganization: access?.detectedOrganization || null
    },
    publicConfig: config
  });
}

// ── POST /api/app/company-sync ───────────────────────────────────────────────
async function handleCompanySync(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  const body = await readJsonBody(req);
  const company = body.company || {};
  if (!company.name && !company.email) return badRequest(res, 'Company payload is required.');

  const accessToken = readBearerToken(req);
  if (!accessToken) return json(res, 200, { ok: false, skipped: true, reason: 'auth_required' });

  const access = await resolveAuthenticatedContext(accessToken, company);
  if (!access?.authenticated || !access.organization?.id) {
    return json(res, 200, { ok: false, skipped: true, reason: access?.reason || 'auth_required' });
  }

  const organization = await syncOrganizationProfile(access.organization.id, company);
  const billing = await findBillingCustomer(organization?.id || access.organization.id);

  await insertAuditEvent(
    organization?.id || access.organization.id,
    'company_synced',
    {
      email: company.email || '',
      venue: company.venue || '', venueName: company.venueName || '',
      source: access.source || 'membership'
    },
    access.user?.id || null
  );

  return json(res, 200, {
    ok: true,
    syncedAt: new Date().toISOString(),
    company: {
      organizationId: organization?.id || access.organization.id,
      billingCustomerId: billing?.stripe_customer_id || '',
      logoRelativePath: organization?.logo_path || '',
      subscriptionPlanCode: organization?.current_tier_code || access.organization.current_tier_code || 'free_lite',
      subscriptionPlan: planName(organization?.current_tier_code || access.organization.current_tier_code || 'free_lite'),
      subscriptionStatus: billing?.subscription_status || 'active'
    },
    organization,
    license: {
      source: access.source || 'membership',
      role: access.role || '',
      needsInvite: Boolean(access.needsInvite),
      detectedOrganization: access.detectedOrganization || null
    }
  });
}

// ── POST /api/app/export-sync ────────────────────────────────────────────────
async function handleExportSync(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  const body = await readJsonBody(req);
  const company = body.company || {};
  const exportPayload = body.export || {};
  if (!exportPayload.exportType) return badRequest(res, 'Export payload is required.');

  const accessToken = readBearerToken(req);
  if (!accessToken) return json(res, 200, { ok: false, skipped: true, reason: 'auth_required' });

  const access = await resolveAuthenticatedContext(accessToken, company);
  if (!access?.authenticated || !access.organization?.id) {
    return json(res, 200, { ok: false, skipped: true, reason: access?.reason || 'auth_required' });
  }

  const organization = await syncOrganizationProfile(access.organization.id, company);

  let attachmentPath = '';
  if (body.attachment?.dataUrl && body.attachment?.filename) {
    attachmentPath = await uploadExportAttachment(
      organization?.id || access.organization.id,
      body.attachment.filename,
      body.attachment.dataUrl
    );
  }

  const exportJob = await insertExportJob({
    organizationId: organization?.id || access.organization.id,
    exportPayload,
    attachmentPath,
    createdByUserId: access.user?.id || null
  });

  await insertExportLines(exportJob?.id, exportPayload.inventoryLines || []);
  await insertAuditEvent(
    organization?.id || access.organization.id,
    'export_synced',
    {
      exportType: exportPayload.exportType,
      filename: exportPayload.filename || '',
      storagePath: attachmentPath,
      source: access.source || 'membership'
    },
    access.user?.id || null
  );

  return json(res, 200, {
    ok: true,
    exportJobId: exportJob?.id || '',
    storagePath: attachmentPath,
    syncedAt: new Date().toISOString()
  });
}

const ROUTES = {
  bootstrap: handleBootstrap,
  'company-sync': handleCompanySync,
  'export-sync': handleExportSync
};

module.exports = async function handler(req, res) {
  try {
    const action = readAction(req);
    const route = ROUTES[action];
    if (!route) return json(res, 404, { ok: false, reason: 'unknown_action' });
    return await route(req, res);
  } catch (error) {
    return serverError(res, error);
  }
};

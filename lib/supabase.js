const { env } = require('./env');
const { normalizePlanCode, planName } = require('./plans');

function hasSupabaseServiceRole() {
  return Boolean(env('ESCALE_SUPABASE_URL') && env('ESCALE_SUPABASE_SERVICE_ROLE_KEY'));
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: env('ESCALE_SUPABASE_SERVICE_ROLE_KEY'),
    Authorization: `Bearer ${env('ESCALE_SUPABASE_SERVICE_ROLE_KEY')}`,
    ...extra
  };
}

async function supabaseRest(path, { method = 'GET', query = '', body, headers = {} } = {}) {
  const baseUrl = env('ESCALE_SUPABASE_URL');
  if (!baseUrl || !env('ESCALE_SUPABASE_SERVICE_ROLE_KEY')) {
    return null;
  }

  const response = await fetch(`${baseUrl}/rest/v1/${path}${query}`, {
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

  const response = await fetch(
    `${env('ESCALE_SUPABASE_URL')}/storage/v1/object/${bucket}/${objectPath}`,
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

async function findOrganizationByEmail(email) {
  const cleanEmail = cleanText(email);
  if (!cleanEmail) return null;

  const rows = await supabaseRest('organizations', {
    query: `?select=id,slug,display_name,current_tier_code,billing_email,logo_path,venue_default&billing_email=eq.${encodeURIComponent(cleanEmail)}&limit=1`
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function upsertOrganization(company) {
  if (!hasSupabaseServiceRole()) {
    return {
      ok: false,
      skipped: true
    };
  }

  const hasIdentity = Boolean(cleanText(company.name) || cleanText(company.email));
  if (!hasIdentity) {
    return {
      ok: false,
      skipped: true,
      reason: 'insufficient_company_identity'
    };
  }

  const planCode = normalizePlanCode(company.subscriptionPlanCode || company.subscriptionPlan);
  const slugBase = sanitizeSlug(company.name || company.email || 'escale');
  const logoBucket = env('ESCALE_SUPABASE_BUCKET_LOGOS', 'company-logos');
  let organization = await findOrganizationByEmail(company.email);

  let logoPath = organization?.logo_path || '';
  if (company.logoDataUrl) {
    const fileExt = dataUrlToBuffer(company.logoDataUrl)?.mimeType?.includes('png') ? 'png' : 'jpg';
    logoPath = await uploadStorageObject(
      logoBucket,
      `${slugBase}/logo-${Date.now()}.${fileExt}`,
      company.logoDataUrl
    );
  }

  const payload = {
    slug: organization?.slug || slugBase,
    display_name: cleanText(company.name) || 'E-scale',
    legal_name: cleanText(company.name) || 'E-scale',
    billing_email: cleanText(company.email) || null,
    current_tier_code: planCode,
    venue_default: cleanText(company.venue) || null,
    logo_path: logoPath || null
  };

  if (organization?.id) {
    const rows = await supabaseRest('organizations', {
      method: 'PATCH',
      query: `?id=eq.${organization.id}`,
      body: payload
    });
    organization = Array.isArray(rows) && rows[0] ? rows[0] : { ...organization, ...payload };
  } else {
    const rows = await supabaseRest('organizations', {
      method: 'POST',
      body: payload
    });
    organization = Array.isArray(rows) && rows[0] ? rows[0] : payload;
  }

  return {
    ok: true,
    organization,
    company: {
      organizationId: organization.id,
      subscriptionPlanCode: planCode,
      subscriptionPlan: planName(planCode),
      logoRelativePath: logoPath
    }
  };
}

async function findBillingCustomer(organizationId) {
  if (!organizationId) return null;
  const rows = await supabaseRest('billing_customers', {
    query: `?select=organization_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,subscription_status,current_period_end,cancel_at_period_end&organization_id=eq.${organizationId}&limit=1`
  });
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function insertExportJob({ organizationId, exportPayload, attachmentPath }) {
  const rows = await supabaseRest('export_jobs', {
    method: 'POST',
    body: {
      organization_id: organizationId,
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
  return await supabaseRest('export_inventory_lines', {
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

async function insertAuditEvent(organizationId, eventType, payload) {
  if (!organizationId) return null;
  return await supabaseRest('audit_events', {
    method: 'POST',
    body: {
      organization_id: organizationId,
      event_type: eventType,
      event_payload: payload || {}
    }
  });
}

async function uploadExportAttachment(organizationId, filename, dataUrl) {
  const bucket = env('ESCALE_SUPABASE_BUCKET_EXPORTS', 'export-pdfs');
  const safeFilename = sanitizeSlug(filename.replace(/\.[^.]+$/, '')) || 'export';
  const ext = filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'bin';
  return await uploadStorageObject(bucket, `${organizationId}/${safeFilename}.${ext}`, dataUrl);
}

module.exports = {
  hasSupabaseServiceRole,
  upsertOrganization,
  findBillingCustomer,
  insertExportJob,
  insertExportLines,
  insertAuditEvent,
  uploadExportAttachment
};

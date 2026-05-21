const { json, methodNotAllowed, readJsonBody, serverError, badRequest } = require('../lib/http');
const { upsertOrganization, findBillingCustomer, insertAuditEvent } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const body = await readJsonBody(req);
    const company = body.company || {};
    if (!company.name && !company.email) {
      return badRequest(res, 'Company payload is required.');
    }

    const sync = await upsertOrganization(company);
    if (!sync?.ok) {
      return json(res, 200, {
        ok: false,
        skipped: true,
        reason: 'cloud_sync_not_configured'
      });
    }

    const billing = await findBillingCustomer(sync.organization.id);
    await insertAuditEvent(sync.organization.id, 'company_synced', {
      email: company.email || '',
      venue: company.venue || ''
    });

    return json(res, 200, {
      ok: true,
      syncedAt: new Date().toISOString(),
      company: {
        ...sync.company,
        billingCustomerId: billing?.stripe_customer_id || '',
        subscriptionStatus: billing?.subscription_status || company.subscriptionStatus || 'Activo'
      },
      organization: sync.organization
    });
  } catch (error) {
    return serverError(res, error);
  }
};

const { json, methodNotAllowed, readJsonBody, serverError, badRequest } = require('../../lib/http');
const { planName } = require('../../lib/plans');
const {
  resolveAuthenticatedContext,
  findBillingCustomer,
  insertAuditEvent,
  syncOrganizationProfile
} = require('../../lib/supabase');

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const body = await readJsonBody(req);
    const company = body.company || {};

    if (!company.name && !company.email) {
      return badRequest(res, 'Company payload is required.');
    }

    const accessToken = readBearerToken(req);
    if (!accessToken) {
      return json(res, 200, {
        ok: false,
        skipped: true,
        reason: 'auth_required'
      });
    }

    const access = await resolveAuthenticatedContext(accessToken, company);
    if (!access?.authenticated || !access.organization?.id) {
      return json(res, 200, {
        ok: false,
        skipped: true,
        reason: access?.reason || 'auth_required'
      });
    }

    const organization = await syncOrganizationProfile(access.organization.id, company);
    const billing = await findBillingCustomer(organization?.id || access.organization.id);

    await insertAuditEvent(
      organization?.id || access.organization.id,
      'company_synced',
      {
        email: company.email || '',
        venue: company.venue || '',
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
  } catch (error) {
    return serverError(res, error);
  }
};

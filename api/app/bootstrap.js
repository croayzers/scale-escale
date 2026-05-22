const { json, methodNotAllowed, readJsonBody, serverError } = require('../../lib/http');
const { normalizePlanCode, planName } = require('../../lib/plans');
const { resolveAuthenticatedContext } = require('../../lib/supabase');
const { publicConfig } = require('../../lib/env');

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
    const config = publicConfig();
    const basePlanCode = normalizePlanCode(company.subscriptionPlanCode || company.subscriptionPlan);

    if (!config.features.cloudSync) {
      return json(res, 200, {
        ok: true,
        authenticated: false,
        planCode: basePlanCode,
        planName: planName(basePlanCode),
        license: {
          source: 'local',
          requiresAuth: false,
          needsInvite: false
        },
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
        license: {
          source: 'anonymous',
          requiresAuth: true,
          needsInvite: false
        },
        publicConfig: config
      });
    }

    const access = await resolveAuthenticatedContext(accessToken, company);
    const planCode = normalizePlanCode(access?.organization?.current_tier_code || access?.planCode || basePlanCode);

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
      organization: access?.organization || null,
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
        needsInvite: Boolean(access?.needsInvite),
        detectedDomain: access?.detectedDomain || '',
        detectedOrganization: access?.detectedOrganization || null
      },
      publicConfig: config
    });
  } catch (error) {
    return serverError(res, error);
  }
};

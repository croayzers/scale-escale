const { json, methodNotAllowed, readJsonBody, serverError } = require('../../lib/http');
const { normalizePlanCode, planName } = require('../../lib/plans');
const { findBillingCustomer, upsertOrganization } = require('../../lib/supabase');
const { publicConfig } = require('../../lib/env');

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
        planCode: basePlanCode,
        planName: planName(basePlanCode),
        publicConfig: config
      });
    }

    const syncResult = await upsertOrganization(company);
    const billing = syncResult?.organization?.id
      ? await findBillingCustomer(syncResult.organization.id)
      : null;

    return json(res, 200, {
      ok: true,
      planCode: syncResult?.organization?.current_tier_code || basePlanCode,
      planName: planName(syncResult?.organization?.current_tier_code || basePlanCode),
      organization: syncResult?.organization || null,
      billing: billing ? {
        stripeCustomerId: billing.stripe_customer_id,
        stripeSubscriptionId: billing.stripe_subscription_id,
        stripePriceId: billing.stripe_price_id,
        subscriptionStatus: billing.subscription_status
      } : null,
      publicConfig: config
    });
  } catch (error) {
    return serverError(res, error);
  }
};

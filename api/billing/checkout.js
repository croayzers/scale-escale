const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const { normalizePlanCode } = require('../../lib/plans');
const { priceIdForPlan, stripeFormPost } = require('../../lib/stripe');
const { env } = require('../../lib/env');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const body = await readJsonBody(req);
    const planCode = normalizePlanCode(body.planCode);
    const priceId = priceIdForPlan(planCode);
    if (!priceId) return badRequest(res, `No hay Stripe Price ID configurado para ${planCode}.`);

    const baseUrl = env('ESCALE_PUBLIC_APP_URL') || body.returnUrl || 'http://localhost:3000/';
    const company = body.company || {};

    const session = await stripeFormPost('checkout/sessions', {
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      customer_email: company.email || '',
      success_url: `${baseUrl.split('?')[0]}?stripe=success&plan=${planCode}`,
      cancel_url: `${baseUrl.split('?')[0]}?stripe=cancelled`,
      allow_promotion_codes: 'true',
      'automatic_tax[enabled]': 'true',
      'tax_id_collection[enabled]': 'true',
      'metadata[plan_code]': planCode,
      'metadata[company_name]': company.name || '',
      'metadata[company_email]': company.email || ''
    });

    return json(res, 200, {
      ok: true,
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    return serverError(res, error);
  }
};

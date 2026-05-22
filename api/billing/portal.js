const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const { stripeFormPost } = require('../../lib/stripe');
const { env } = require('../../lib/env');
const { findBillingCustomer } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const body = await readJsonBody(req);
    let customerId = body.customerId || '';

    if (!customerId && body.organizationId) {
      const billing = await findBillingCustomer(body.organizationId);
      customerId = billing?.stripe_customer_id || '';
    }

    if (!customerId) {
      return badRequest(res, 'No se encontro un customer de Stripe para abrir el portal.');
    }

    const session = await stripeFormPost('billing_portal/sessions', {
      customer: customerId,
      return_url: body.returnUrl || env('ESCALE_PUBLIC_APP_URL') || 'http://localhost:3000/'
    });

    return json(res, 200, {
      ok: true,
      url: session.url
    });
  } catch (error) {
    return serverError(res, error);
  }
};

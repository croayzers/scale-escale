// ============================================================================
// E-SCALE · /api/billing/:action  (router consolidado de Stripe self-service)
// ----------------------------------------------------------------------------
// Unifica checkout / portal en una sola función serverless (límite de 12
// funciones del plan Hobby de Vercel). Las URLs públicas NO cambian: rewrites
// en vercel.json mapean /api/billing/checkout y /api/billing/portal aquí.
//
//   POST /api/billing/checkout → crea una Checkout Session de suscripción
//   POST /api/billing/portal   → crea una sesión del Billing Portal
//
// IMPORTANTE: el WEBHOOK de Stripe (api/billing/webhook.js) NO se fusiona aquí:
// necesita leer el body CRUDO para verificar la firma y tiene su propia URL fija
// registrada en Stripe. Se mantiene como función independiente.
// ============================================================================

const { json, methodNotAllowed, readJsonBody, badRequest, serverError } = require('../../lib/http');
const { normalizePlanCode } = require('../../lib/plans');
const { priceIdForPlan, stripeFormPost } = require('../../lib/stripe');
const { env } = require('../../lib/env');
const { findBillingCustomer } = require('../../lib/supabase');

function readAction(req) {
  const fromQuery = String(req.query?.action || '').trim().toLowerCase();
  if (fromQuery) return fromQuery;
  const path = String(req.url || '').split('?')[0];
  const last = path.split('/').filter(Boolean).pop() || '';
  return last.toLowerCase();
}

// ── POST /api/billing/checkout ───────────────────────────────────────────────
async function handleCheckout(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

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

  return json(res, 200, { ok: true, url: session.url, sessionId: session.id });
}

// ── POST /api/billing/portal ─────────────────────────────────────────────────
async function handlePortal(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

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

  return json(res, 200, { ok: true, url: session.url });
}

const ROUTES = {
  checkout: handleCheckout,
  portal: handlePortal
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

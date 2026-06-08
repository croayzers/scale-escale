const { env, supabaseRestUrl, supabaseServerKey } = require('../../lib/env');
const { json, methodNotAllowed, serverError } = require('../../lib/http');
const { normalizePlanCode } = require('../../lib/plans');

const PRICE_TO_TIER = {
  [env('ESCALE_STRIPE_PRICE_PRO')]:     'pro',
  [env('ESCALE_STRIPE_PRICE_PREMIUM')]: 'premium'
};

function supabaseHeaders() {
  const key = supabaseServerKey();
  return {
    apikey: key,
    ...(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(key || ''))
      ? { Authorization: `Bearer ${key}` }
      : {}),
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

async function supabaseRest(path, method, body, query = '', schema = null) {
  const baseUrl = supabaseRestUrl();
  if (!baseUrl) {
    throw new Error('ESCALE_SUPABASE_URL no esta configurada correctamente.');
  }
  const url = `${baseUrl}/${path}${query}`;
  const schemaHeaders = schema
    ? (method === 'GET' ? { 'Accept-Profile': schema } : { 'Content-Profile': schema, 'Accept-Profile': schema })
    : {};
  const res = await fetch(url, {
    method,
    headers: { ...supabaseHeaders(), ...schemaHeaders },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${path} failed: ${text || `HTTP ${res.status}`}`);
  }
  return text ? JSON.parse(text) : null;
}

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function verifySignature(rawBody, sigHeader, secret) {
  const crypto = require('crypto');
  const parts = {};
  sigHeader.split(',').forEach(item => {
    const [key, val] = item.split('=');
    parts[key.trim()] = val;
  });
  const timestamp = parts.t;
  const sig = parts.v1;
  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  const webhookSecret = env('ESCALE_STRIPE_WEBHOOK_SECRET');
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  if (webhookSecret && sig) {
    try {
      if (!verifySignature(rawBody.toString(), sig, webhookSecret)) {
        return res.status(400).json({ error: 'Invalid signature' });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Signature verification failed' });
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        const email = session.customer_email 
          || session.customer_details?.email 
          || session.metadata?.company_email;
        const planCode = normalizePlanCode(session.metadata?.plan_code || 'pro');
        const companyName = cleanText(session.metadata?.company_name || session.customer_details?.name || '');
        const slug = sanitizeSlug(companyName || email);

        console.log('[webhook] checkout.session.completed', { customerId, subscriptionId, email, planCode });

        if (!customerId) {
          console.error('[webhook] No customerId');
          break;
        }

        if (!email) {
          console.error('[webhook] No email');
          break;
        }

        // Buscar org por email
        let orgRows = await supabaseRest('organizations', 'GET', null,
          `?select=id,slug&billing_email=eq.${encodeURIComponent(email)}&limit=1`);
        let orgId = Array.isArray(orgRows) && orgRows[0] ? orgRows[0].id : null;

        // Si no existe, crear org
        if (!orgId) {
          const created = await supabaseRest('organizations', 'POST', {
            slug,
            display_name: companyName || 'E-scale',
            legal_name: companyName || 'E-scale',
            billing_email: email,
            current_tier_code: planCode
          });
          orgId = Array.isArray(created) && created[0] ? created[0].id : null;
          console.log('[webhook] Created org', orgId);
        }

        if (!orgId) {
          console.error('[webhook] Failed to create org');
          break;
        }

        // Actualizar tier
        await supabaseRest('organizations', 'PATCH', {
          current_tier_code: planCode,
          updated_at: new Date().toISOString()
        }, `?id=eq.${orgId}`);

        // Upsert billing_customer
        const existing = await supabaseRest('billing_customers', 'GET', null,
          `?select=organization_id&organization_id=eq.${orgId}&limit=1`);

        if (Array.isArray(existing) && existing[0]) {
          await supabaseRest('billing_customers', 'PATCH', {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_price_id: env(`ESCALE_STRIPE_PRICE_${planCode.toUpperCase()}`),
            subscription_status: 'active',
            updated_at: new Date().toISOString()
          }, `?organization_id=eq.${orgId}`);
        } else {
          await supabaseRest('billing_customers', 'POST', {
            organization_id: orgId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_price_id: env(`ESCALE_STRIPE_PRICE_${planCode.toUpperCase()}`),
            subscription_status: 'active'
          });
        }

        // Audit
        await supabaseRest('audit_events', 'POST', {
          company_id: orgId,
          event_type: 'subscription_started',
          event_payload: { plan_code: planCode, stripe_customer_id: customerId }
        }, '', 'escale');

        console.log(`[webhook] SUCCESS org=${orgId} plan=${planCode}`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const priceId = sub.items?.data?.[0]?.price?.id;
        const tier = PRICE_TO_TIER[priceId] || 'pro';
        const customerId = sub.customer;

        const rows = await supabaseRest('billing_customers', 'GET', null,
          `?select=organization_id&stripe_customer_id=eq.${customerId}&limit=1`);
        const billing = Array.isArray(rows) && rows[0] ? rows[0] : null;

        if (billing) {
          await supabaseRest('billing_customers', 'PATCH', {
            stripe_price_id: priceId,
            subscription_status: sub.status,
            current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            cancel_at_period_end: sub.cancel_at_period_end || false,
            updated_at: new Date().toISOString()
          }, `?organization_id=eq.${billing.organization_id}`);

          await supabaseRest('organizations', 'PATCH', {
            current_tier_code: tier,
            updated_at: new Date().toISOString()
          }, `?id=eq.${billing.organization_id}`);
        }
        console.log(`[webhook] subscription.updated customer=${customerId} tier=${tier}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;

        const rows = await supabaseRest('billing_customers', 'GET', null,
          `?select=organization_id&stripe_customer_id=eq.${customerId}&limit=1`);
        const billing = Array.isArray(rows) && rows[0] ? rows[0] : null;

        if (billing) {
          await supabaseRest('billing_customers', 'PATCH', {
            subscription_status: 'cancelled',
            updated_at: new Date().toISOString()
          }, `?organization_id=eq.${billing.organization_id}`);

          await supabaseRest('organizations', 'PATCH', {
            current_tier_code: 'free_lite',
            updated_at: new Date().toISOString()
          }, `?id=eq.${billing.organization_id}`);

          await supabaseRest('audit_events', 'POST', {
            company_id: billing.organization_id,
            event_type: 'subscription_cancelled',
            event_payload: { stripe_customer_id: customerId }
          }, '', 'escale');
        }
        console.log(`[webhook] subscription.deleted customer=${customerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const rows = await supabaseRest('billing_customers', 'GET', null,
          `?select=organization_id&stripe_customer_id=eq.${customerId}&limit=1`);
        const billing = Array.isArray(rows) && rows[0] ? rows[0] : null;

        if (billing) {
          await supabaseRest('billing_customers', 'PATCH', {
            subscription_status: 'past_due',
            updated_at: new Date().toISOString()
          }, `?organization_id=eq.${billing.organization_id}`);

          await supabaseRest('audit_events', 'POST', {
            company_id: billing.organization_id,
            event_type: 'payment_failed',
            event_payload: { stripe_customer_id: customerId, invoice_id: invoice.id }
          }, '', 'escale');
        }
        console.warn(`[webhook] payment_failed customer=${customerId}`);
        break;
      }

      default:
        console.log(`[webhook] Ignored: ${event.type}`);
    }

    return json(res, 200, { received: true });

  } catch (err) {
    console.error('[webhook] Error:', err);
    return serverError(res, err);
  }
};

module.exports.config = { api: { bodyParser: false } };

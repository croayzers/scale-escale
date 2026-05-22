const { env } = require('./env');

function stripeSecret() {
  return env('ESCALE_STRIPE_SECRET_KEY');
}

function priceIdForPlan(planCode) {
  return {
    free_lite: env('ESCALE_STRIPE_PRICE_FREE_LITE'),
    pro: env('ESCALE_STRIPE_PRICE_PRO'),
    premium: env('ESCALE_STRIPE_PRICE_PREMIUM')
  }[planCode] || '';
}

async function stripeFormPost(endpoint, params) {
  const secret = stripeSecret();
  if (!secret) throw new Error('Stripe no esta configurado.');

  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe ${endpoint} failed.`);
  }

  return data;
}

module.exports = {
  priceIdForPlan,
  stripeFormPost
};

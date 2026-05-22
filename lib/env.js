function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function bool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function publicConfig() {
  const supabaseEnabled = Boolean(env('ESCALE_SUPABASE_URL') && env('ESCALE_SUPABASE_ANON_KEY'));
  const billingEnabled = Boolean(
    env('ESCALE_STRIPE_SECRET_KEY') &&
    env('ESCALE_STRIPE_PUBLISHABLE_KEY') &&
    env('ESCALE_STRIPE_PRICE_PRO') &&
    env('ESCALE_STRIPE_PRICE_PREMIUM')
  );
  const cloudSyncEnabled = Boolean(env('ESCALE_SUPABASE_URL') && env('ESCALE_SUPABASE_SERVICE_ROLE_KEY'));
  const emailEnabled = Boolean(env('ESCALE_RESEND_API_KEY') && env('ESCALE_RESEND_FROM_EMAIL'));
  const analyticsEnabled = Boolean(env('ESCALE_POSTHOG_KEY'));
  const supportEnabled = Boolean(env('ESCALE_CRISP_WEBSITE_ID'));

  return {
    ok: true,
    env: env('ESCALE_APP_ENV', process.env.VERCEL_ENV || 'local'),
    services: {
      supabase: {
        enabled: supabaseEnabled,
        url: env('ESCALE_SUPABASE_URL'),
        anonKey: env('ESCALE_SUPABASE_ANON_KEY'),
        storageBuckets: {
          logos: env('ESCALE_SUPABASE_BUCKET_LOGOS', 'company-logos'),
          exports: env('ESCALE_SUPABASE_BUCKET_EXPORTS', 'export-pdfs')
        }
      },
      stripe: {
        enabled: billingEnabled,
        publishableKey: env('ESCALE_STRIPE_PUBLISHABLE_KEY'),
        prices: {
          free_lite: env('ESCALE_STRIPE_PRICE_FREE_LITE'),
          pro: env('ESCALE_STRIPE_PRICE_PRO'),
          premium: env('ESCALE_STRIPE_PRICE_PREMIUM')
        }
      },
      resend: {
        enabled: emailEnabled,
        fromEmail: env('ESCALE_RESEND_FROM_EMAIL')
      },
      posthog: {
        enabled: analyticsEnabled,
        key: env('ESCALE_POSTHOG_KEY'),
        host: env('ESCALE_POSTHOG_HOST', 'https://eu.posthog.com')
      },
      crisp: {
        enabled: supportEnabled,
        websiteId: env('ESCALE_CRISP_WEBSITE_ID')
      },
      browserless: {
        enabled: Boolean(env('ESCALE_BROWSERLESS_API_KEY'))
      }
    },
    features: {
      auth: supabaseEnabled,
      billing: billingEnabled,
      cloudSync: cloudSyncEnabled,
      analytics: analyticsEnabled,
      supportChat: supportEnabled,
      emailDelivery: emailEnabled
    },
    urls: {
      publicConfig: '/api/public-config',
      bootstrap: '/api/app/bootstrap',
      companySync: '/api/app/company-sync',
      exportSync: '/api/app/export-sync',
      checkout: '/api/billing/checkout',
      customerPortal: '/api/billing/portal',
      sendExportEmail: '/api/email/send-export',
      sendShareEmail: '/api/email/send-share',
      analyticsCapture: '/api/analytics/capture'
    }
  };
}

module.exports = {
  env,
  bool,
  publicConfig
};

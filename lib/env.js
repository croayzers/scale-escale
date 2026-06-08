function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function bool(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function trimTrailingSlashes(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function supabaseProjectUrl(rawValue = env('ESCALE_SUPABASE_URL')) {
  const base = trimTrailingSlashes(rawValue);
  if (!base) return '';
  return base.replace(/\/(rest|storage|auth)\/v1$/i, '');
}

function supabasePublicKey() {
  return env('ESCALE_SUPABASE_PUBLISHABLE_KEY') || env('ESCALE_SUPABASE_ANON_KEY');
}

function supabaseServerKey() {
  return env('ESCALE_SUPABASE_SECRET_KEY') || env('ESCALE_SUPABASE_SERVICE_ROLE_KEY');
}

function supabaseRestUrl(rawValue = env('ESCALE_SUPABASE_URL')) {
  const projectUrl = supabaseProjectUrl(rawValue);
  return projectUrl ? `${projectUrl}/rest/v1` : '';
}

function supabaseStorageUrl(rawValue = env('ESCALE_SUPABASE_URL')) {
  const projectUrl = supabaseProjectUrl(rawValue);
  return projectUrl ? `${projectUrl}/storage/v1` : '';
}

function publicConfig() {
  const projectUrl = supabaseProjectUrl();
  const supabaseEnabled = Boolean(projectUrl && supabasePublicKey());
  const billingEnabled = Boolean(
    env('ESCALE_STRIPE_SECRET_KEY') &&
    env('ESCALE_STRIPE_PUBLISHABLE_KEY') &&
    env('ESCALE_STRIPE_PRICE_PRO') &&
    env('ESCALE_STRIPE_PRICE_PREMIUM')
  );
  const cloudSyncEnabled = Boolean(projectUrl && supabaseServerKey());
  const emailEnabled = Boolean(env('ESCALE_RESEND_API_KEY') && env('ESCALE_RESEND_FROM_EMAIL'));
  const analyticsEnabled = Boolean(env('ESCALE_POSTHOG_KEY'));
  const supportEnabled = Boolean(env('ESCALE_CRISP_WEBSITE_ID'));

  return {
    ok: true,
    env: env('ESCALE_APP_ENV', process.env.VERCEL_ENV || 'local'),
    services: {
      supabase: {
        enabled: supabaseEnabled,
        url: projectUrl,
        anonKey: supabasePublicKey(),
        cookieDomain: env('ESCALE_SCALE_COOKIE_DOMAIN', '.thescaleapps.com'),
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
    portalUrl: env('ESCALE_PORTAL_URL', 'https://thescaleapps.com'),
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
  supabaseProjectUrl,
  supabasePublicKey,
  supabaseServerKey,
  supabaseRestUrl,
  supabaseStorageUrl,
  publicConfig
};

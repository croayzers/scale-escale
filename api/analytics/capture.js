const { json, methodNotAllowed, readJsonBody, serverError } = require('../lib/http');
const { env } = require('../lib/env');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const body = await readJsonBody(req);
    const apiKey = env('ESCALE_POSTHOG_KEY');
    if (!apiKey) {
      return json(res, 200, {
        ok: false,
        skipped: true,
        reason: 'posthog_not_configured'
      });
    }

    const response = await fetch(`${env('ESCALE_POSTHOG_HOST', 'https://eu.posthog.com')}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: apiKey,
        event: body.event || 'unknown_event',
        distinct_id: body.payload?.organizationId || body.payload?.email || req.headers['x-forwarded-for'] || 'anonymous',
        properties: {
          ...body.payload,
          source: 'escale-web'
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'PostHog capture failed.');
    }

    return json(res, 200, {
      ok: true
    });
  } catch (error) {
    return serverError(res, error);
  }
};

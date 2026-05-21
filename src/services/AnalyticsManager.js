import { CloudApi } from './CloudApi.js';
import { ServiceConfig } from './ServiceConfig.js';

let bootTracked = false;

function devicePayload() {
  return {
    path: window.location.pathname,
    host: window.location.host,
    language: navigator.language || 'unknown',
    platform: navigator.platform || 'unknown',
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    }
  };
}

async function init() {
  if (bootTracked) return;
  bootTracked = true;

  if (!ServiceConfig.hasFeature('analytics')) return;
  await track('app_loaded', devicePayload());
}

async function track(event, payload = {}) {
  if (!ServiceConfig.hasFeature('analytics')) return { ok: false, skipped: true };
  return await CloudApi.captureEvent(event, payload);
}

export const AnalyticsManager = {
  init,
  track
};

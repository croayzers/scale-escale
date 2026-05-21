import { ServiceConfig } from './ServiceConfig.js';

let supportMounted = false;

function mountCrisp(websiteId) {
  if (!websiteId || supportMounted) return;

  window.$crisp = window.$crisp || [];
  window.CRISP_WEBSITE_ID = websiteId;

  const script = document.createElement('script');
  script.src = 'https://client.crisp.chat/l.js';
  script.async = true;
  document.head.appendChild(script);
  supportMounted = true;
}

function init() {
  if (!ServiceConfig.hasFeature('supportChat')) return;
  const crispConfig = ServiceConfig.getService('crisp');
  if (crispConfig?.websiteId) mountCrisp(crispConfig.websiteId);
}

export const SupportManager = { init };

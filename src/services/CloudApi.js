import { ServiceConfig } from './ServiceConfig.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json'
};

const DEFAULT_TIMEOUT_MS = 10000;

function buildAuthHeaders() {
  const token = window.__ESCALE_AUTH__?.getAccessToken?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!path) return { ok: false, skipped: true, reason: 'missing_path' };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, {
      method,
      headers: {
        ...JSON_HEADERS,
        ...buildAuthHeaders()
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    window.clearTimeout(timeout);

    if (response.status === 404) {
      return { ok: false, skipped: true, reason: 'endpoint_not_found' };
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    window.clearTimeout(timeout);

    if (error.name === 'AbortError') {
      return { ok: false, skipped: true, reason: 'timeout' };
    }

    if (/Failed to fetch/i.test(error.message)) {
      return { ok: false, skipped: true, reason: 'network_unavailable' };
    }

    throw error;
  }
}

function objectToDataUrl(object) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(object);
  });
}

async function blobToAttachment(blob, filename) {
  if (!(blob instanceof Blob)) return null;
  const dataUrl = await objectToDataUrl(blob);
  return {
    filename,
    dataUrl
  };
}

async function bootstrapSession(payload) {
  return await request(ServiceConfig.getUrl('bootstrap'), {
    method: 'POST',
    body: payload
  });
}

async function syncCompany(payload) {
  return await request(ServiceConfig.getUrl('companySync'), {
    method: 'POST',
    body: payload
  });
}

async function recordExport(payload) {
  return await request(ServiceConfig.getUrl('exportSync'), {
    method: 'POST',
    body: payload,
    timeoutMs: 25000
  });
}

async function createCheckoutSession(payload) {
  return await request(ServiceConfig.getUrl('checkout'), {
    method: 'POST',
    body: payload
  });
}

async function openCustomerPortal(payload) {
  return await request(ServiceConfig.getUrl('customerPortal'), {
    method: 'POST',
    body: payload
  });
}

async function sendExportEmail({ blob, filename, ...payload }) {
  return await request(ServiceConfig.getUrl('sendExportEmail'), {
    method: 'POST',
    body: {
      ...payload,
      attachment: await blobToAttachment(blob, filename)
    },
    timeoutMs: 25000
  });
}

async function sendShareEmail({ blob, filename, ...payload }) {
  return await request(ServiceConfig.getUrl('sendShareEmail'), {
    method: 'POST',
    body: {
      ...payload,
      attachment: await blobToAttachment(blob, filename)
    },
    timeoutMs: 25000
  });
}

async function captureEvent(event, payload = {}) {
  return await request(ServiceConfig.getUrl('analyticsCapture'), {
    method: 'POST',
    body: {
      event,
      payload
    }
  });
}

export const CloudApi = {
  bootstrapSession,
  syncCompany,
  recordExport,
  createCheckoutSession,
  openCustomerPortal,
  sendExportEmail,
  sendShareEmail,
  captureEvent
};

import { AppState } from '../core/AppState.js';
import {
  buildInventoryLines,
  getInventoryTotalItems,
  getInventoryTotalPax,
  groupInventoryLines
} from '../core/InventoryRules.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const REQUEST_TIMEOUT_MS = 5000;

function cleanText(value, fallback = 'No informado') {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text || fallback;
}

function companyPayload(company = AppState.company) {
  return {
    id: String(company.id || '').trim(),
    name: cleanText(company.name),
    email: cleanText(company.email),
    venue: cleanText(company.venue),
    logoDataUrl: typeof company.logo === 'string' ? company.logo : '',
    hasLogo: Boolean(company.logo),
    colorPrimary: company.colorPrimary || '',
    colorSecondary: company.colorSecondary || '',
    subscriptionPlan: cleanText(company.subscriptionPlan || 'No informado'),
    subscriptionStatus: cleanText(company.subscriptionStatus || 'No informado'),
    recordStatus: cleanText(company.recordStatus || 'Activo')
  };
}

function exportModeFor(modeLabel) {
  return String(modeLabel || '').toUpperCase().startsWith('3D') ? 'PDF_3D' : 'PDF_PLANO';
}

function getEventName() {
  return cleanText(document.getElementById('inventory-event-name')?.value, 'No informado');
}

function getApiOrigins() {
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const hostname = window.location.hostname || 'localhost';
  const origins = [
    window.location.origin,
    `${protocol}//${hostname}:8787`
  ];

  if (hostname !== 'localhost') origins.push(`${protocol}//localhost:8787`);
  return [...new Set(origins)];
}

async function requestJson(method, path, payload, { silent = false } = {}) {
  const errors = [];

  for (const origin of getApiOrigins()) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${origin}${path}`, {
        method,
        headers: JSON_HEADERS,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      window.clearTimeout(timeout);

      if (response.status === 404) continue;

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      window.clearTimeout(timeout);
      if (!silent) errors.push(`${origin}: ${error.message}`);
    }
  }

  if (silent) return null;
  throw new Error(errors.join(' | ') || 'No se pudo contactar con el dashboard local.');
}

async function flushPending() {
  // Operación no crítica: falla silenciosamente si el server local no está activo
  return await requestJson('POST', '/api/dashboard/flush', {}, { silent: true });
}

function lineCategoryMap(groups) {
  const lookup = new Map();
  groups.forEach(group => {
    group.lines.forEach(line => lookup.set(`${line.type}::${line.label}`, group.label));
  });
  return lookup;
}

function mergeSyncedCompany(sourceCompany, syncedCompany, syncedAt) {
  AppState.company = {
    ...AppState.company,
    ...syncedCompany,
    name: sourceCompany?.name ?? AppState.company.name ?? '',
    email: sourceCompany?.email ?? AppState.company.email ?? '',
    venue: sourceCompany?.venue ?? AppState.company.venue ?? '',
    logo: sourceCompany?.logo ?? AppState.company.logo ?? null,
    colorPrimary: sourceCompany?.colorPrimary ?? AppState.company.colorPrimary ?? null,
    colorSecondary: sourceCompany?.colorSecondary ?? AppState.company.colorSecondary ?? null,
    dashboardSyncedAt: syncedAt || new Date().toISOString()
  };
}

function exportPayload(modeLabel, filename, items = AppState.items) {
  const lines = buildInventoryLines(items);
  const groups = groupInventoryLines(items);
  const categories = lineCategoryMap(groups);

  return {
    exportMode: exportModeFor(modeLabel),
    pdfFilename: cleanText(filename),
    eventName: getEventName(),
    venueName: cleanText(AppState.company.venue),
    capturedAt: new Date().toISOString(),
    totalPax: getInventoryTotalPax(items),
    totalInventoryItems: getInventoryTotalItems(items),
    totalInventoryCategories: groups.length,
    inventoryLines: lines.map(line => ({
      category: categories.get(`${line.type}::${line.label}`) || 'Otros',
      itemType: line.type,
      itemLabel: line.label,
      quantity: line.count,
      pax: line.pax
    }))
  };
}

async function syncCompany(company = AppState.company) {
  // silent: no lanza si el server local no está activo
  const data = await requestJson('POST', '/api/dashboard/company', {
    company: companyPayload(company)
  }, { silent: true });

  if (data?.company) {
    mergeSyncedCompany(company, data.company, data.syncedAt);
  }

  return data;
}

async function recordExport({ modeLabel, filename, items = AppState.items } = {}) {
  const companyData = await syncCompany(AppState.company);
  const data = await requestJson('POST', '/api/dashboard/export', {
    company: companyPayload({ ...AppState.company, ...companyData?.company }),
    export: exportPayload(modeLabel, filename, items)
  });

  if (data?.company) {
    mergeSyncedCompany(AppState.company, data.company, data.syncedAt);
  }

  return data;
}

async function syncPlanning(record) {
  return requestJson('POST', '/api/dashboard/planning', { planning: record }, { silent: true });
}

export const DashboardSync = {
  flushPending,
  syncCompany,
  recordExport,
  syncPlanning
};

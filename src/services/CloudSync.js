import { AppState } from '../core/AppState.js';
import {
  buildInventoryLines,
  getInventoryTotalItems,
  getInventoryTotalPax,
  groupInventoryLines
} from '../core/InventoryRules.js';
import { CloudApi } from './CloudApi.js';
import { AnalyticsManager } from './AnalyticsManager.js';
import { SubscriptionManager } from './SubscriptionManager.js';

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text || fallback;
}

function companyPayload(company = AppState.company) {
  return {
    id: cleanText(company.organizationId || company.id),
    name: cleanText(company.name, 'E-scale'),
    email: cleanText(company.email),
    venue: cleanText(company.venue),
    logoDataUrl: typeof company.logo === 'string' ? company.logo : '',
    colorPrimary: cleanText(company.colorPrimary),
    colorSecondary: cleanText(company.colorSecondary),
    subscriptionPlanCode: SubscriptionManager.currentPlanCode(),
    subscriptionPlan: cleanText(company.subscriptionPlan || SubscriptionManager.currentPlan().name),
    subscriptionStatus: cleanText(company.subscriptionStatus, 'Activo')
  };
}

function exportModeFor(modeLabel) {
  return String(modeLabel || '').toUpperCase().startsWith('3D') ? 'pdf_3d' : 'pdf_plan';
}

async function syncCompany(company = AppState.company) {
  const response = await CloudApi.syncCompany({
    company: companyPayload(company),
    context: {
      host: window.location.host,
      userAgent: navigator.userAgent
    }
  });

  if (response?.ok === false && response?.reason === 'auth_required') {
    AppState.company.cloudSyncStatus = 'needs_auth';
    return response;
  }

  if (response?.company) {
    AppState.company = {
      ...AppState.company,
      organizationId: response.company.organizationId || AppState.company.organizationId,
      billingCustomerId: response.company.billingCustomerId || AppState.company.billingCustomerId,
      logoRelativePath: response.company.logoRelativePath || AppState.company.logoRelativePath,
      subscriptionPlanCode: response.company.subscriptionPlanCode || AppState.company.subscriptionPlanCode,
      subscriptionPlan: response.company.subscriptionPlan || AppState.company.subscriptionPlan,
      subscriptionStatus: response.company.subscriptionStatus || AppState.company.subscriptionStatus,
      organizationRole: response.license?.role || AppState.company.organizationRole,
      licenseSource: response.license?.source || AppState.company.licenseSource,
      licenseDetectedOrganizationName: response.license?.detectedOrganization?.displayName || '',
      licenseNeedsInvite: Boolean(response.license?.needsInvite),
      cloudSyncStatus: response.ok === false ? 'pending' : 'connected',
      lastCloudSyncAt: response.syncedAt || new Date().toISOString()
    };
  }

  await AnalyticsManager.track('company_synced', {
    organizationId: AppState.company.organizationId || '',
    planCode: SubscriptionManager.currentPlanCode()
  });

  return response;
}

async function recordExport({ modeLabel, filename, blob, items = AppState.items } = {}) {
  const groupedLines = groupInventoryLines(items);
  const categoryLookup = new Map();
  groupedLines.forEach(group => {
    group.lines.forEach(line => categoryLookup.set(`${line.type}::${line.label}`, group.label));
  });

  const response = await CloudApi.recordExport({
    company: companyPayload(),
    export: {
      exportType: exportModeFor(modeLabel),
      filename: cleanText(filename, 'escale-export.pdf'),
      eventName: cleanText(document.getElementById('inventory-event-name')?.value, 'No informado'),
      venueName: cleanText(AppState.company.venue, 'No informado'),
      totalPax: getInventoryTotalPax(items),
      totalInventoryItems: getInventoryTotalItems(items),
      totalInventoryCategories: groupedLines.length,
      sceneSnapshot: {
        itemCount: items.length,
        planLoaded: Boolean(AppState.plan.texture)
      },
      inventoryLines: buildInventoryLines(items).map(line => ({
        category: categoryLookup.get(`${line.type}::${line.label}`) || 'Otros',
        itemType: line.type,
        itemLabel: line.label,
        quantity: line.count,
        pax: line.pax
      }))
    },
    attachment: blob ? {
      filename,
      dataUrl: await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      })
    } : null
  });

  await AnalyticsManager.track('export_synced', {
    exportType: exportModeFor(modeLabel),
    filename
  });

  return response;
}

async function sendOwnerExportEmail({ blob, filename, modeLabel }) {
  if (!SubscriptionManager.hasFeature('emailPdfToOwner')) return { ok: false, skipped: true };
  if (!AppState.company.email) return { ok: false, skipped: true, reason: 'missing_email' };

  const eventName = cleanText(document.getElementById('inventory-event-name')?.value, 'tu evento');
  const response = await CloudApi.sendExportEmail({
    to: [AppState.company.email],
    subject: `E-scale · ${modeLabel} · ${eventName}`,
    text: `Adjuntamos el PDF generado para ${eventName}.`,
    html: `<p>Hola,</p><p>Adjuntamos el PDF generado para <strong>${eventName}</strong>.</p><p>${cleanText(AppState.company.name, 'E-scale')}</p>`,
    blob,
    filename,
    metadata: {
      organizationId: AppState.company.organizationId || '',
      modeLabel
    }
  });

  await AnalyticsManager.track('owner_export_email_attempted', {
    delivered: Boolean(response?.ok),
    planCode: SubscriptionManager.currentPlanCode()
  });

  return response;
}

async function sendGuestPlanningEmail({ blob, filename, recipients, eventName, publicLink }) {
  const response = await CloudApi.sendShareEmail({
    to: recipients,
    subject: `Invitacion ${eventName} · Planning de mesas`,
    text: publicLink
      ? `Te compartimos el planning del evento ${eventName}. Link: ${publicLink}`
      : `Te compartimos el planning del evento ${eventName}. Adjuntamos el PDF generado.`,
    html: publicLink
      ? `<p>Hola,</p><p>Te compartimos el planning del evento <strong>${eventName}</strong>.</p><p><a href="${publicLink}">${publicLink}</a></p>`
      : `<p>Hola,</p><p>Te compartimos el planning del evento <strong>${eventName}</strong>.</p><p>Adjuntamos el PDF generado.</p>`,
    blob,
    filename,
    eventName
  });

  await AnalyticsManager.track('guest_planning_email_attempted', {
    recipientCount: recipients.length,
    delivered: Boolean(response?.ok)
  });

  return response;
}

export const CloudSync = {
  syncCompany,
  recordExport,
  sendOwnerExportEmail,
  sendGuestPlanningEmail
};

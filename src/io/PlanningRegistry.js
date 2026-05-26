/* ─────────────────────────────────────────────────────────
   PLANNING REGISTRY — Tabla de plannings por sesión
   Genera un planningId único por sesión, persiste en localStorage
   y se actualiza en cada acción relevante (guardar, exportar, importar, compartir).
   ───────────────────────────────────────────────────────── */

import { AppState } from '../core/AppState.js';
import { DashboardSync } from './DashboardSync.js';

const STORAGE_KEY = 'escale_planning_records';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getEventName() {
  return document.getElementById('inventory-event-name')?.value?.trim() || '';
}

function getRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveRecords(records) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch {}
}

function buildRecord(reason) {
  const c = AppState.company || {};
  const email = c.authEmail || c.email || '';
  const domain = email.split('@')[1] || '';
  const pax = AppState.items.reduce((s, i) => s + (i.chairs || 0), 0);
  const inventario = AppState.items
    .filter(i => i.type !== 'zone')
    .reduce((acc, i) => {
      const key = i.type + (i.subtype ? ':' + i.subtype : '');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  const now = new Date().toISOString();
  return {
    planningId:   c.planningId || '',
    userId:       c.authUserId || '',
    userName:     c.authDisplayName || c.name || '',
    userEmail:    email,
    empresa:      c.name || domain || '',
    cliente:      c.cliente || '',
    dominio:      domain,
    logo:         c.logo ? '[logo]' : '',
    lugar:        c.venue || '',
    nombreEvento: getEventName(),
    pax,
    inventario,
    totalItems:   AppState.items.length,
    lastAction:   reason,
    excelExportado: reason === 'excel-export',
    lastUpdated:  now
  };
}

function record(reason = 'update') {
  const c = AppState.company || {};

  // Generate planningId if not set
  if (!c.planningId) {
    c.planningId = uuid();
    try { localStorage.setItem('escale_company', JSON.stringify(c)); } catch {}
  }

  const rec = buildRecord(reason);
  const records = getRecords();
  const idx = records.findIndex(r => r.planningId === rec.planningId);
  if (idx >= 0) {
    records[idx] = { ...records[idx], ...rec, createdAt: records[idx].createdAt };
  } else {
    rec.createdAt = rec.lastUpdated;
    records.push(rec);
  }
  saveRecords(records);

  // Sync to local dashboard (silently)
  DashboardSync.syncPlanning?.(rec).catch(() => {});

  return rec;
}

function getAll() {
  return getRecords();
}

function getCurrentPlanningId() {
  return AppState.company?.planningId || '';
}

function resetPlanningId() {
  if (AppState.company) AppState.company.planningId = '';
}

export const PlanningRegistry = { record, getAll, getCurrentPlanningId, resetPlanningId };

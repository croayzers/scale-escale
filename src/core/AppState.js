/* ─────────────────────────────────────────────────────────
   APP STATE — Estado Centralizado
   ───────────────────────────────────────────────────────── */

import { SceneManager } from '../scene/SceneManager.js';
import { UIManager } from '../ui/UIManager.js';
import {
  getInventoryTotalItems,
  getInventoryTotalPax,
  isInventoryTracked
} from './InventoryRules.js';

function getEventName() {
  return document.getElementById('inventory-event-name')?.value?.trim() || '';
}

function buildCountsByType(items) {
  return items.reduce((counts, item) => {
    const key = item?.type || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function buildSceneInsights(state, reason = 'snapshot') {
  const items = state.items || [];
  const planCode = String(state.company?.subscriptionPlanCode || 'free_lite').toLowerCase();
  const selectedItems = [...(state.selectedIds || [])];
  const lockedItems = items.filter(item => item.locked).length;
  const zoneItems = items.filter(item => item?.type === 'zone');
  const guestAssignments = items.reduce((sum, item) => (
    sum + (Array.isArray(item.guests) ? item.guests.filter(guest => guest?.name || guest?.email).length : 0)
  ), 0);
  const inventoryItems = items.filter(isInventoryTracked);
  const hasPlan = Boolean(state.plan?.texture || state.plan?.mesh);

  return {
    reason,
    timestamp: new Date().toISOString(),
    hasSceneItems: items.length > 0,
    totalItems: items.length,
    totalZones: zoneItems.length,
    hasZones: zoneItems.length > 0,
    inventoryItems: getInventoryTotalItems(items),
    nonInventoryItems: items.length - inventoryItems.length,
    totalPax: getInventoryTotalPax(items),
    selectedItems: selectedItems.length,
    selectedIds: selectedItems,
    lockedItems,
    unlockedItems: items.length - lockedItems,
    guestAssignments,
    hasPlan,
    planWidthM: state.plan?.widthM ?? 0,
    planLengthM: state.plan?.lengthM ?? 0,
    gridMainSizeM: state.grid?.majorSize ?? 1,
    gridSubSizeM: state.grid?.subSize ?? 0.25,
    gridVisibilityPct: state.grid?.opacity ?? 55,
    gridOffsetX: state.grid?.offsetX ?? 0,
    gridOffsetZ: state.grid?.offsetZ ?? 0,
    eventName: getEventName(),
    companyName: state.company?.name || '',
    planCode,
    hasProAccess: planCode === 'pro' || planCode === 'premium',
    canPromotePro: planCode === 'free_lite' && items.length > 0,
    upgradeHints: {
      showPrintUpsell: planCode === 'free_lite' && items.length > 0,
      showReportingUpsell: planCode === 'free_lite' && inventoryItems.length > 0,
      showShareUpsell: planCode === 'free_lite' && guestAssignments > 0
    },
    itemCountsByType: buildCountsByType(items)
  };
}

export const AppState = {
  items: [],
  selectedId: null,           // último seleccionado (compat)
  selectedIds: new Set(),     // multiselección
  nextId: 1,
  camera: 'iso',
  showCotas: true,
  shadows: true,
  inventoryCollapsed: false,

  plan: {
    texture: null,
    mesh: null,
    widthM: 30,
    lengthM: 30,
    opacity: 0.7,
  },
  calibration: { active: false, p1: null, p2: null },

  company: {
    id: '',
    organizationId: '',
    organizationRole: '',
    authUserId: '',
    authEmail: '',
    authProvider: '',
    authDisplayName: '',
    authStatus: 'anonymous',
    billingCustomerId: '',
    name: '',
    email: '',
    venue: '',
    logo: null,
    logoAssetId: '',
    logoFileName: '',
    logoRelativePath: '',
    colorPrimary: null,
    colorSecondary: null,
    subscriptionPlanCode: 'free_lite',
    subscriptionPlan: 'Free Lite',
    subscriptionStatus: 'Local',
    licenseSource: 'local',
    licenseDetectedDomain: '',
    licenseDetectedOrganizationName: '',
    licenseNeedsInvite: false,
    recordStatus: 'Activo',
    dashboardSyncedAt: '',
    lastCloudSyncAt: '',
    cloudSyncStatus: 'local_only'
  },

  snap: { enabled: true, spacing: 0.25 },
  grid: {
    majorSize: 1,
    subSize: 0.25,
    opacity: 55,
    extent: 60,
    offsetX: 0,
    offsetZ: 0,
    locked: false
  },

  history: [],
  HISTORY_LIMIT: 3,
  _suppressHistory: false,

  getSceneInsights(reason = 'snapshot') {
    return buildSceneInsights(this, reason);
  },

  emitSceneInsights(reason = 'snapshot') {
    const detail = this.getSceneInsights(reason);
    window.__ESCALE_SCENE_INSIGHTS__ = detail;
    document.dispatchEvent(new CustomEvent('escale:scene-insights-changed', { detail }));
    window.dispatchEvent(new CustomEvent('escale:scene-insights-changed', { detail }));
    return detail;
  },

  pushHistory() {
    if (this._suppressHistory) return;
    const snapshot = {
      items: JSON.parse(JSON.stringify(this.items)),
      nextId: this.nextId,
      selectedId: this.selectedId,
      selectedIds: [...this.selectedIds]
    };
    this.history.push(snapshot);
    if (this.history.length > this.HISTORY_LIMIT) this.history.shift();
    UIManager.refreshUndoBadge?.();
  },

  undo() {
    if (this.history.length === 0) return;
    const snapshot = this.history.pop();
    this._suppressHistory = true;
    [...this.items].forEach(i => SceneManager.removeItem(i.id));
    this.items = snapshot.items;
    this.nextId = snapshot.nextId;
    this.selectedId = snapshot.selectedId;
    this.selectedIds = new Set(snapshot.selectedIds || []);
    this.items.forEach(i => SceneManager.spawn(i));
    SceneManager.highlightSelection();
    SceneManager.drawCotas();
    UIManager.refresh();
    UIManager.refreshUndoBadge?.();
    if (this.selectedIds.size === 1) {
      const it = this.items.find(i => i.id === this.selectedId);
      if (it) UIManager.showDetail?.(it); else UIManager.hideDetail?.();
    } else if (this.selectedIds.size > 1) {
      UIManager.showMultiDetail?.([...this.selectedIds]);
    } else {
      UIManager.hideDetail?.();
    }
    this._suppressHistory = false;
    this.emitSceneInsights('undo');
  },

  add(item) {
    this.pushHistory();
    item.id = this.nextId++;
    if (item.y === undefined) item.y = 0;
    if (item.locked === undefined) item.locked = false;
    this.items.push(item);
    SceneManager.spawn(item);
    UIManager.refresh();
    this.emitSceneInsights('add');
    return item;
  },

  remove(id) {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    this.pushHistory();
    SceneManager.removeItem(id);
    this.items.splice(idx, 1);  // primero eliminar del array
    SceneManager.redrawCotas(); // luego redibujar ya sin el item eliminado
    this.selectedIds.delete(id);
    if (this.selectedId === id) {
      this.selectedId = this.selectedIds.size ? [...this.selectedIds].pop() : null;
    }
    if (this.selectedIds.size === 0) UIManager.hideDetail?.();
	UIManager.hideTooltip?.();
    UIManager.refresh();
    this.emitSceneInsights('remove');
  },

  update(id, patch, opts = {}) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    this.pushHistory();
    Object.assign(item, patch);
    SceneManager.rebuild(item);
    UIManager.refresh();
    if (this.selectedId === id && this.selectedIds.size === 1 && !opts.skipDetailRebuild) {
      UIManager.showDetail?.(item);
    }
    if (item.type === 'carpa' && UIManager.updateCarpaPostsCount) {
      UIManager.updateCarpaPostsCount(item);
    }
    this.emitSceneInsights('update');
  },

  replace(id, nextItem, opts = {}) {
    const index = this.items.findIndex(i => i.id === id);
    if (index < 0 || !nextItem) return;
    const current = this.items[index];
    this.pushHistory();
    const keepCategoryStyle = Boolean(
      current.catalogCategory
      && nextItem.catalogCategory
      && current.catalogCategory === nextItem.catalogCategory
    );

    const replacement = {
      ...nextItem,
      id,
      x: current.x,
      z: current.z,
      y: current.y ?? nextItem.y ?? 0,
      rotY: nextItem.rotY && nextItem.rotY !== 0 ? nextItem.rotY : (current.rotY ?? 0),
      locked: current.locked ?? false,
      catalogDefinitionId: nextItem.catalogDefinitionId || current.catalogDefinitionId || '',
      catalogCategory: nextItem.catalogCategory || current.catalogCategory || '',
      catalogName: nextItem.catalogName || current.catalogName || ''
    };

    if (current.labelText && (!replacement.labelText || keepCategoryStyle)) replacement.labelText = current.labelText;
    if (current.color && (!replacement.color || keepCategoryStyle)) replacement.color = current.color;
    if (current.textColor && (!replacement.textColor || keepCategoryStyle)) replacement.textColor = current.textColor;
    if (current.display?.textSize && (!replacement.display?.textSize || keepCategoryStyle)) {
      replacement.display = { ...(replacement.display || {}), textSize: current.display.textSize };
    }

    this.items[index] = replacement;
    SceneManager.rebuild(replacement);
    SceneManager.highlightSelection();
    UIManager.refresh();
    if (this.selectedId === id && this.selectedIds.size === 1 && !opts.skipDetailRebuild) {
      UIManager.showDetail?.(replacement);
    }
    this.emitSceneInsights('replace');
  },

  duplicate(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    const clone = JSON.parse(JSON.stringify(item));
    delete clone.id;
    clone.x = item.x + 2;
    clone.locked = false;
    this.add(clone);
  },

  select(id, additive = false) {
    if (!additive) this.selectedIds.clear();
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.selectedId = this.selectedIds.size ? [...this.selectedIds].pop() : null;
    SceneManager.highlightSelection();
    if (this.selectedIds.size === 1) {
      const item = this.items.find(i => i.id === this.selectedId);
      if (item) UIManager.showDetail?.(item);
    } else if (this.selectedIds.size > 1) {
      UIManager.showMultiDetail?.([...this.selectedIds]);
    } else {
      UIManager.hideDetail?.();
    }
    this.emitSceneInsights('select');
  },

  selectMany(ids, additive = false) {
    if (!additive) this.selectedIds.clear();
    ids.forEach(id => this.selectedIds.add(id));
    this.selectedId = this.selectedIds.size ? [...this.selectedIds].pop() : null;
    SceneManager.highlightSelection();
    if (this.selectedIds.size === 1) {
      const item = this.items.find(i => i.id === this.selectedId);
      if (item) UIManager.showDetail?.(item);
    } else if (this.selectedIds.size > 1) {
      UIManager.showMultiDetail?.([...this.selectedIds]);
    }
    this.emitSceneInsights('select-many');
  },

  deselect() {
    this.selectedIds.clear();
    this.selectedId = null;
    SceneManager.highlightSelection();
    UIManager.hideDetail?.();
    UIManager.hideTooltip?.();
    this.emitSceneInsights('deselect');
  },

  toggleLock(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    item.locked = !item.locked;
    UIManager.refresh();
    if (this.selectedIds.size === 1 && this.selectedId === id) {
      UIManager.showDetail?.(item);
    }
    this.emitSceneInsights('toggle-lock');
  },

  clear() {
    this.pushHistory();
    [...this.items].forEach(item => SceneManager.removeItem(item.id));
    this.items = [];
    this.selectedIds.clear();
    this.selectedId = null;
    UIManager.hideDetail?.();
    UIManager.hideTooltip?.();
    UIManager.refresh();
    this.emitSceneInsights('clear');
  }
};

window.AppState = AppState;
window.getEscaleSceneInsights = reason => AppState.getSceneInsights(reason);

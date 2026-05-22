/* ─────────────────────────────────────────────────────────
   APP STATE — Estado Centralizado
   ───────────────────────────────────────────────────────── */

import { SceneManager } from '../scene/SceneManager.js';
import { UIManager } from '../ui/UIManager.js';

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

  history: [],
  HISTORY_LIMIT: 3,
  _suppressHistory: false,

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
  },

  add(item) {
    this.pushHistory();
    item.id = this.nextId++;
    if (item.locked === undefined) item.locked = false;
    this.items.push(item);
    SceneManager.spawn(item);
    UIManager.refresh();
    return item;
  },

  remove(id) {
    const idx = this.items.findIndex(i => i.id === id);
    if (idx < 0) return;
    this.pushHistory();
    SceneManager.removeItem(id);
    this.items.splice(idx, 1);
    this.selectedIds.delete(id);
    if (this.selectedId === id) {
      this.selectedId = this.selectedIds.size ? [...this.selectedIds].pop() : null;
    }
    if (this.selectedIds.size === 0) UIManager.hideDetail?.();
	UIManager.hideTooltip?.();
    UIManager.refresh();
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
  },

  deselect() {
    this.selectedIds.clear();
    this.selectedId = null;
    SceneManager.highlightSelection();
    UIManager.hideDetail?.();
    UIManager.hideTooltip?.();
  },

  toggleLock(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    item.locked = !item.locked;
    UIManager.refresh();
    if (this.selectedIds.size === 1 && this.selectedId === id) {
      UIManager.showDetail?.(item);
    }
  },

  clear() {
    this.pushHistory();
    this._suppressHistory = true;
    [...this.items].forEach(i => this.remove(i.id));
    this._suppressHistory = false;
  }
};

window.AppState = AppState;

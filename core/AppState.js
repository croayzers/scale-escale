/* ─────────────────────────────────────────────────────────
   APP STATE — Estado Centralizado (single source of truth)
   ───────────────────────────────────────────────────────── */

import { SceneManager } from '../scene/SceneManager.js';
import { UIManager } from '../ui/UIManager.js';

export const AppState = {
  items: [],
  selectedId: null,
  nextId: 1,
  camera: 'iso',         // 'iso' | 'top'
  showCotas: true,
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
    name: '',
    email: '',
    logo: null,
  },

  snap: {
    enabled: true,
    spacing: 0.25,
  },

  // ── Historial Undo (máximo 3 pasos) ──
  history: [],
  HISTORY_LIMIT: 3,
  _suppressHistory: false,

  pushHistory() {
    if (this._suppressHistory) return;
    const snapshot = {
      items: JSON.parse(JSON.stringify(this.items)),
      nextId: this.nextId,
      selectedId: this.selectedId
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
    this.items.forEach(i => SceneManager.spawn(i));
    SceneManager.highlightSelection();
    SceneManager.drawCotas();
    UIManager.refresh();
    UIManager.refreshUndoBadge?.();
    if (this.selectedId !== null) {
      const it = this.items.find(i => i.id === this.selectedId);
      if (it) UIManager.showDetail?.(it); else UIManager.hideDetail?.();
    } else UIManager.hideDetail?.();
    this._suppressHistory = false;
  },

  add(item) {
    this.pushHistory();
    item.id = this.nextId++;
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
    if (this.selectedId === id) this.deselect();
    UIManager.refresh();
  },

  update(id, patch, opts = {}) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    this.pushHistory();
    Object.assign(item, patch);
    SceneManager.rebuild(item);
    UIManager.refresh();
    if (this.selectedId === id && !opts.skipDetailRebuild) UIManager.showDetail?.(item);
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
    this.add(clone);
  },

  select(id) {
    this.selectedId = id;
    SceneManager.highlightSelection();
    const item = this.items.find(i => i.id === id);
    if (item) UIManager.showDetail?.(item);
  },

  deselect() {
    this.selectedId = null;
    SceneManager.highlightSelection();
    UIManager.hideDetail?.();
    UIManager.hideTooltip?.();
  },

  clear() {
    this.pushHistory();
    this._suppressHistory = true;
    [...this.items].forEach(i => this.remove(i.id));
    this._suppressHistory = false;
  }
};

// Exponer en window para debugging desde consola (opcional)
window.AppState = AppState;

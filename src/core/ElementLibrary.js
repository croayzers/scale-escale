import { AppState } from './AppState.js';
import { buildCatalogData } from '../schemas/CatalogBlueprints.js';
import { CATALOG_CATEGORIES, CATEGORY_KEYS } from '../schemas/CatalogCategories.js';
import { createItemFromCatalog } from '../schemas/SchemaItemFactory.js';
import BUNDLED_ELEMENTS from '../data/elementsData.js';

const ADMIN_LS_KEY = 'escale_admin_config';

export const ElementLibrary = {
  data: {
    version: 1,
    chairs: [],
    tables: [],
    bars: [],
    decor: [],
    structures: [],
    ambient: [],
    scenography: [],
    services: [],
    staff: [],
    hospitality: [],
    decoration: [],
    lighting: []
  },

  async load() {
    try {
      const res = await fetch('elements.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.data = buildCatalogData(await res.json());
      console.info('[ElementLibrary] cargada desde elements.json + schemas');
    } catch (error) {
      console.info('[ElementLibrary] fetch falló, usando datos integrados:', error.message);
      this.data = buildCatalogData(BUNDLED_ELEMENTS);
    }
    this._applyAdminLayout();
    this._listenAdminConfig();
    // Expose flat catalog list for AppBridge / AICopilot
    window.__ESCALE_CATALOG__ = Object.values(this.data).flat().filter(Boolean);
    return this.data;
  },

  // Apply catalog.layout override from localStorage (set by admin dashboard)
  _applyAdminLayout() {
    try {
      const stored = localStorage.getItem(ADMIN_LS_KEY);
      if (!stored) return;
      const cfg = JSON.parse(stored);
      const layout = cfg?.catalog?.layout;
      if (!layout || Object.keys(layout).length === 0) return;

      // Build flat map of every element by id
      const byId = {};
      CATEGORY_KEYS.forEach(k => {
        (this.data[k] || []).forEach(el => { byId[el.id] = el; });
      });

      // Reset categories
      const next = {};
      CATEGORY_KEYS.forEach(k => { next[k] = []; });
      const mentioned = new Set();

      for (const [cat, ids] of Object.entries(layout)) {
        if (!Array.isArray(ids)) continue;
        if (!next[cat]) next[cat] = [];
        ids.forEach(id => {
          const el = byId[id];
          if (el) {
            // Clone with updated category so downstream code sees the right value
            next[cat].push(el.category === cat ? el : { ...el, category: cat });
            mentioned.add(id);
          }
        });
      }

      // Elements not mentioned keep their original category+position
      CATEGORY_KEYS.forEach(k => {
        (this.data[k] || []).forEach(el => {
          if (!mentioned.has(el.id)) next[k].push(el);
        });
      });

      CATEGORY_KEYS.forEach(k => { this.data[k] = next[k]; });
    } catch {}
  },

  // Live sync: when admin saves, re-apply and notify the catalog modal
  _listenAdminConfig() {
    window.addEventListener('storage', e => {
      if (e.key !== ADMIN_LS_KEY) return;
      this._applyAdminLayout();
      document.dispatchEvent(new CustomEvent('escale:catalog-updated'));
    });
  },

  all() {
    return CATEGORY_KEYS.flatMap(key => this.data[key] || []);
  },

  find(id) {
    return this.all().find(item => item.id === id) || null;
  },

  toItem(definition, { x = 0, y = 0, z = 0 } = {}) {
    return createItemFromCatalog(definition, { x, y, z });
  },

  renderAddButtons() {
    const host = document.getElementById('add-buttons');
    if (!host) return;
    host.innerHTML = '';

    let totalRendered = 0;

    CATALOG_CATEGORIES.forEach(category => {
      const list = this.data[category.key] || [];
      if (!list.length) return;

      const subhead = document.createElement('div');
      subhead.className = 'mono text-[9px] tracking-widest uppercase opacity-50 mt-2';
      subhead.style.color = 'var(--muted)';
      subhead.textContent = category.label;
      host.appendChild(subhead);

      const grid = document.createElement('div');
      grid.className = list.length >= 2 ? 'grid grid-cols-2 gap-2' : 'space-y-2';
      host.appendChild(grid);

      list.forEach(definition => {
        const button = document.createElement('button');
        const style = definition.style === 'primary' ? 'primary' : 'ghost';
        const widthClass = list.length >= 2 ? '' : 'w-full';
        button.className = `btn ${style} ${widthClass} justify-center`;
        button.dataset.elementId = definition.id;
        button.title = `${definition.name} (${definition.type}${definition.subtype ? ` · ${definition.subtype}` : ''})`;
        button.innerHTML = `
          <i data-lucide="${definition.icon || category.icon || 'square'}" class="w-4 h-4"></i>
          <span>${definition.name}</span>
        `;
        button.addEventListener('click', () => {
          AppState.add(ElementLibrary.toItem(definition));
        });
        grid.appendChild(button);
        totalRendered += 1;
      });
    });

    if (totalRendered === 0) {
      host.innerHTML = '<div class="mono text-[10px] opacity-60">Biblioteca vacia</div>';
      return;
    }

    if (window.lucide) lucide.createIcons();
  }
};

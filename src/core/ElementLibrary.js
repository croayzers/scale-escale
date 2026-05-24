import { AppState } from './AppState.js';
import { buildCatalogData } from '../schemas/CatalogBlueprints.js';
import { CATALOG_CATEGORIES, CATEGORY_KEYS } from '../schemas/CatalogCategories.js';
import { createItemFromCatalog } from '../schemas/SchemaItemFactory.js';

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
      console.error('[ElementLibrary] error cargando elements.json:', error.message);
      console.warn('[ElementLibrary] usa un servidor local para evitar restricciones de file://');
      this.data = buildCatalogData(this.data);
    }
    return this.data;
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

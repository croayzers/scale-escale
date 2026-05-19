/* ─────────────────────────────────────────────────────────
   ELEMENT LIBRARY — Catálogo externo (elements.json)
   ───────────────────────────────────────────────────────── */

import { AppState } from './AppState.js';

export const ElementLibrary = {
  data: { chairs: [], tables: [], bars: [], stages: [], decor: [] },

  async load() {
    try {
      const res = await fetch('elements.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this.data = await res.json();
      console.info('[ElementLibrary] cargada desde elements.json');
    } catch (err) {
      console.error('[ElementLibrary] error cargando elements.json:', err.message);
      console.warn('[ElementLibrary] usa un servidor local (ej: python3 -m http.server) para evitar restricciones de file://');
    }
    return this.data;
  },

  all() {
    const d = this.data;
    return [
      ...(d.tables || []),
      ...(d.bars   || []),
      ...(d.stages || []),
      ...(d.decor  || []),
      ...(d.chairs || [])
    ];
  },

  find(id) {
    return this.all().find(e => e.id === id) || null;
  },

  /** Convierte una def del catálogo en un item válido para AppState.add(). */
  toItem(def, { x = 0, z = 0 } = {}) {
    const item = JSON.parse(JSON.stringify(def));
    delete item.id;
    delete item.name;
    delete item.category;
    delete item.icon;
    delete item.style;
    delete item.defaultRotation;
    item.x = x;
    item.z = z;
    item.rotY = (def.defaultRotation || 0) * Math.PI / 180;
    return item;
  },

  /** Renderiza los botones del panel "01 · Añadir" agrupados por categoría. */
  renderAddButtons() {
    const host = document.getElementById('add-buttons');
    if (!host) return;
    host.innerHTML = '';

    const CATEGORIES = [
      { key: 'tables', label: 'Mesas' },
      { key: 'bars',   label: 'Buffets / Barras' },
      { key: 'stages', label: 'Escenarios' },
      { key: 'decor',  label: 'Carpas / Decoración' },
      { key: 'chairs', label: 'Sillas' }
    ];

    let totalRendered = 0;

    CATEGORIES.forEach(cat => {
      const list = this.data[cat.key] || [];
      if (!list.length) return;

      const subhead = document.createElement('div');
      subhead.className = 'mono text-[9px] tracking-widest uppercase opacity-50 mt-2';
      subhead.style.color = 'var(--muted)';
      subhead.textContent = cat.label;
      host.appendChild(subhead);

      const grid = document.createElement('div');
      grid.className = list.length >= 2 ? 'grid grid-cols-2 gap-2' : 'space-y-2';
      host.appendChild(grid);

      list.forEach(def => {
        const btn = document.createElement('button');
        const style = def.style === 'primary' ? 'primary' : 'ghost';
        const widthCls = list.length >= 2 ? '' : 'w-full';
        btn.className = `btn ${style} ${widthCls} justify-center`;
        btn.dataset.elementId = def.id;
        btn.title = `${def.name} (${def.type}${def.subtype ? '·' + def.subtype : ''})`;
        btn.innerHTML = `
          <i data-lucide="${def.icon || 'square'}" class="w-4 h-4"></i>
          <span>${def.name}</span>
        `;
        btn.addEventListener('click', () => {
          AppState.add(ElementLibrary.toItem(def));
        });
        grid.appendChild(btn);
        totalRendered++;
      });
    });

    if (totalRendered === 0) {
      host.innerHTML = '<div class="mono text-[10px] opacity-60">Biblioteca vacía</div>';
      return;
    }

    if (window.lucide) lucide.createIcons();
  }
};

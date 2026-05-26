/* ─────────────────────────────────────────────────────────
   CATALOG MODAL — Modal flotante con tarjetas por categoría
   ───────────────────────────────────────────────────────── */

import { ElementLibrary }    from '../core/ElementLibrary.js';
import { CATALOG_CATEGORIES } from '../schemas/CatalogCategories.js';

let currentCategory = null;
let pendingPlacement = null;
let searchQuery = '';

function clonePendingPlacement() {
  return pendingPlacement ? JSON.parse(JSON.stringify(pendingPlacement)) : null;
}

function syncPendingGlobal() {
  window.__escalePendingCatalogPlacement = clonePendingPlacement();
  window.__escalePendingCatalogDefinition = pendingPlacement?.definition
    ? JSON.parse(JSON.stringify(pendingPlacement.definition))
    : null;
}

function emitPlacementState(active) {
  const detail = active ? clonePendingPlacement() : null;
  document.dispatchEvent(new CustomEvent(
    active ? 'escale:catalog-placement-start' : 'escale:catalog-placement-end',
    {
      detail: {
        active,
        definition: detail?.definition || null,
        sticky: Boolean(detail?.sticky),
        source: detail?.source || '',
        label: detail?.label || detail?.definition?.name || '',
        placement: detail
      }
    }
  ));
}

function setPendingPlacement(definition, options = {}) {
  if (!definition) {
    clearPendingPlacement();
    return;
  }
  pendingPlacement = {
    source: options.source || 'catalog',
    sticky: Boolean(options.sticky),
    label: options.label || definition.name || definition.catalogName || 'Elemento seleccionado',
    definition: JSON.parse(JSON.stringify(definition)),
    itemTemplate: null
  };
  syncPendingGlobal();
  document.body.classList.toggle('placement-pending', true);
  emitPlacementState(true);
}

function setPendingItemTemplate(item, options = {}) {
  if (!item) {
    clearPendingPlacement();
    return;
  }

  const itemTemplate = JSON.parse(JSON.stringify(item));
  delete itemTemplate.id;
  itemTemplate.locked = false;
  pendingPlacement = {
    source: options.source || 'clipboard',
    sticky: options.sticky !== false,
    label: options.label || item.catalogName || item.labelText || item.tableName || item.type || 'Copia',
    definition: null,
    itemTemplate
  };
  syncPendingGlobal();
  document.body.classList.toggle('placement-pending', true);
  emitPlacementState(true);
}

function clearPendingPlacement() {
  if (!pendingPlacement && !window.__escalePendingCatalogPlacement && !window.__escalePendingCatalogDefinition) return;
  pendingPlacement = null;
  syncPendingGlobal();
  document.body.classList.remove('placement-pending');
  emitPlacementState(false);
}

function hasPendingPlacement() {
  return Boolean(pendingPlacement || window.__escalePendingCatalogPlacement || window.__escalePendingCatalogDefinition);
}

function getPendingDefinition() {
  return pendingPlacement?.definition
    || window.__escalePendingCatalogPlacement?.definition
    || window.__escalePendingCatalogDefinition
    || null;
}

function getPendingPlacement() {
  return pendingPlacement || window.__escalePendingCatalogPlacement || null;
}

function shouldKeepPlacementActive() {
  return Boolean(getPendingPlacement()?.sticky);
}

function createPendingItem({ x = 0, y = 0, z = 0 } = {}) {
  const placement = getPendingPlacement();
  if (!placement) return null;

  if (placement.itemTemplate) {
    const clone = JSON.parse(JSON.stringify(placement.itemTemplate));
    delete clone.id;
    clone.locked = false;
    clone.x = x;
    clone.y = y;
    clone.z = z;
    return clone;
  }

  const definition = placement.definition || getPendingDefinition();
  if (!definition) return null;
  return ElementLibrary.toItem(definition, { x, y, z });
}

function init() {
  document.getElementById('catalog-close')?.addEventListener('click', close);

  // ── Búsqueda ──
  const searchInput = document.getElementById('catalog-search');
  const searchClear = document.getElementById('catalog-search-clear');

  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value;
    searchClear?.classList.toggle('hidden', !searchQuery);
    renderCatalogContent();
  });

  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (searchQuery) { clearSearch(); e.stopPropagation(); }
      else close();
    }
  });

  searchClear?.addEventListener('click', () => clearSearch());

  // Cerrar al pulsar fuera
  document.addEventListener('click', e => {
    const modal = document.getElementById('catalog-modal');
    const dock = document.getElementById('dock');
    if (!modal || modal.classList.contains('hidden')) return;
    if (modal.contains(e.target) || dock?.contains(e.target)) return;
    close();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });

  document.addEventListener('escale:scene-overlay-open', event => {
    if (event.detail?.kind !== 'catalog') close();
  });

  // Live re-render when admin dashboard updates catalog layout
  document.addEventListener('escale:catalog-updated', () => {
    if (!document.getElementById('catalog-modal')?.classList.contains('hidden')) {
      renderCatalogContent();
    }
  });
}

function clearSearch() {
  searchQuery = '';
  const searchInput = document.getElementById('catalog-search');
  const searchClear = document.getElementById('catalog-search-clear');
  if (searchInput) searchInput.value = '';
  searchClear?.classList.add('hidden');
  renderCatalogContent();
  searchInput?.focus();
}

/* ─── Render helpers ─── */

function getCategoryLabel(key) {
  return CATALOG_CATEGORIES.find(c => c.key === key)?.label || key;
}

/** Normaliza texto para comparación: minúsculas sin diacríticos */
function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Renderiza el contenido del grid según búsqueda o categoría activa */
function renderCatalogContent() {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;

  const q = normalize(searchQuery.trim());

  if (q.length >= 1) {
    renderSearchResults(grid, q);
  } else {
    renderCategoryGrid(grid, currentCategory);
  }
}

/** Modo normal: grid de tarjetas de la categoría activa */
function renderCategoryGrid(grid, categoryKey) {
  grid.className = 'catalog-grid-items';
  const items = (categoryKey ? ElementLibrary.data[categoryKey] : null) || [];

  if (!categoryKey || items.length === 0) {
    grid.innerHTML = `<p class="catalog-empty">No hay elementos en esta categoría todavía.</p>`;
    return;
  }

  grid.innerHTML = items.map(def => `
    <div class="cat-card" data-element-id="${escId(def.id)}" data-cat-key="${escId(categoryKey)}">
      <div class="cat-thumb">${thumbSVG(def)}</div>
      <div class="cat-name">${escHtml(def.name)}</div>
    </div>
  `).join('');

  bindCards(grid, items, categoryKey);
}

/** Modo búsqueda: resultados agrupados por categoría */
function renderSearchResults(grid, q) {
  grid.className = 'catalog-grid-search';

  const groups = [];

  CATALOG_CATEGORIES.forEach(cat => {
    const catLabel = normalize(cat.label);
    const catItems = ElementLibrary.data[cat.key] || [];
    const matchesCat = catLabel.includes(q);

    const hits = catItems.filter(def => {
      if (matchesCat) return true;
      return normalize(def.name).includes(q);
    });

    if (hits.length > 0) groups.push({ cat, hits });
  });

  if (groups.length === 0) {
    grid.innerHTML = `<p class="catalog-empty">Sin resultados para <strong>${escHtml(searchQuery)}</strong></p>`;
    return;
  }

  grid.innerHTML = groups.map(({ cat, hits }) => `
    <div class="catalog-search-group">
      <div class="catalog-search-group-label">${escHtml(cat.label)}</div>
      <div class="catalog-search-group-cards">
        ${hits.map(def => `
          <div class="cat-card cat-card-sm" data-element-id="${escId(def.id)}" data-cat-key="${escId(cat.key)}">
            <div class="cat-thumb">${thumbSVG(def)}</div>
            <div class="cat-name">${highlightMatch(def.name, searchQuery)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Bind clicks para todos los grupos
  groups.forEach(({ cat, hits }) => {
    bindCards(grid, hits, cat.key);
  });
}

function bindCards(grid, items, categoryKey) {
  grid.querySelectorAll('.cat-card').forEach(card => {
    const catKey = card.dataset.catKey || categoryKey;
    const catItems = ElementLibrary.data[catKey] || items;
    card.addEventListener('click', () => {
      const def = catItems.find(d => String(d.id) === card.dataset.elementId)
                  || items.find(d => String(d.id) === card.dataset.elementId);
      if (def) {
        setPendingPlacement(def, { source: 'catalog', sticky: false });
        close();
      }
    });
  });
}

/** Resalta la parte que coincide con la búsqueda (case-insensitive) */
function highlightMatch(text, query) {
  if (!query) return escHtml(text);
  const idx = normalize(text).indexOf(normalize(query));
  if (idx < 0) return escHtml(text);
  return escHtml(text.slice(0, idx))
    + `<mark class="catalog-highlight">${escHtml(text.slice(idx, idx + query.length))}</mark>`
    + escHtml(text.slice(idx + query.length));
}

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}
function escId(str) { return String(str || '').replace(/"/g, ''); }

/* ─── Open / Close ─── */

function open(categoryKey) {
  currentCategory = categoryKey;
  const modal = document.getElementById('catalog-modal');
  if (!modal) return;

  // Si hay búsqueda activa, no la limpiamos al cambiar categoría
  renderCatalogContent();

  document.dispatchEvent(new CustomEvent('escale:scene-overlay-open', {
    detail: { kind: 'catalog', key: categoryKey }
  }));

  modal.classList.remove('hidden');

  // Foco en búsqueda al abrir
  setTimeout(() => document.getElementById('catalog-search')?.focus(), 60);
}

function close() {
  const modal = document.getElementById('catalog-modal');
  if (modal) modal.classList.add('hidden');
  currentCategory = null;
  document
    .querySelectorAll('#dock-items button[data-dock-kind="category"]')
    .forEach(button => button.classList.remove('active'));
}

function isOpen() {
  return !document.getElementById('catalog-modal')?.classList.contains('hidden');
}

/* ─── Generador de thumbnails SVG 2.5D según tipo ─── */
function thumbSVG(def) {
  const t = def.type;
  if (t === 'mesa') {
    if (def.subtype === 'presi') return svgRect('#e6e2da');
    return svgCircle('#e6e2da');
  }
  if (t === 'mesaRect')        return svgMesaRect();
  if (t === 'mesaCocktail')    return svgMesaCocktail();
  if (t === 'mesaImperial')    return svgMesaImperial();
  if (t === 'mesaCurva')       return svgMesaCurva();
  if (t === 'mesaSerpentina')  return svgMesaSerpentina();
  if (t === 'buffet')          return svgLongRect('#e6e2da');
  if (t === 'carpa')              return svgTent('#d4b78b');
  if (t === 'carpaCuadrada')      return svgTentSquare();
  if (t === 'carpaStar')          return svgTentStar();
  if (t === 'carpaPabellon')      return svgTentPabellon();
  if (t === 'carpaTransparente')  return svgTentTransparent();
  if (t === 'carpaBeduina')       return svgTentBeduina();
  if (t === 'carpaSailcloth')     return svgTentSailcloth();
  if (t === 'carpaTipi')          return svgTentTipi();
  if (t === 'carpaDomo')          return svgTentDomo();
  if (t === 'arbusto')         return svgBush('#6fa86a');
  if (t === 'arbol')           return svgTree('#4a8d50', '#7a4f2a');
  if (t === 'cableLuces')      return svgLights('#f4c95d');
  if (t === 'room')            return svgRoom('#dddddd');
  if (t === 'sillaCatering')   return svgChair(def.color || '#cccccc', def.subtype);
  if (t === 'sillaLineal')     return svgChairLineal(def.color || '#cccccc');
  if (t === 'poste')              return svgPoste();
  if (t === 'barraLibre') return svgBarraLibre();
  if (t === 'ambiente') {
  if (def.subtype === 'alfombra' && (def.shape === 'round' || def.dims?.diameter)) return svgAlfombraRound(def.color || '#8b1a1a');
  if (def.subtype === 'alfombra') return svgAlfombra(def.color || '#8b1a1a');
  if (def.subtype === 'planta')   return svgPlantaDeco();
    return svgSpot();
  }
  if (def.schemaId) return svgSchemaThumb(def);
  return svgPlaceholder();
}

function svgSchemaThumb(def) {
  const color = def.color || def.lightColor || '#cfd4dc';
  const accent = def.accentColor || '#111827';
  const schemaId = String(def.schemaId || '');

  if (schemaId.startsWith('chair.')) return svgChair(def.color || '#f5f3ee', def.subtype);
  if (schemaId.startsWith('table.round')) return svgCircle(color);
  if (schemaId.startsWith('buffet.')) return svgLongRect(color);
  if (schemaId.startsWith('stage.')) {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="58" width="72" height="10" rx="2" fill="rgba(0,0,0,0.08)"/>
      <rect x="18" y="38" width="64" height="22" rx="4" fill="${color}" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>
      <rect x="40" y="62" width="20" height="12" rx="2" fill="${accent}" opacity="0.7"/>
      <rect x="44" y="74" width="12" height="6" rx="2" fill="${accent}" opacity="0.45"/>
    </svg>`;
  }
  if (schemaId.startsWith('person.')) {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="82" rx="18" ry="4" fill="rgba(0,0,0,0.1)"/>
      <circle cx="50" cy="30" r="10" fill="${accent}"/>
      <rect x="38" y="42" width="24" height="26" rx="12" fill="${color}" stroke="rgba(0,0,0,0.18)" stroke-width="0.6"/>
      <rect x="30" y="48" width="40" height="6" rx="3" fill="${accent}" opacity="0.24"/>
      <line x1="44" y1="68" x2="38" y2="82" stroke="${accent}" stroke-width="3"/>
      <line x1="56" y1="68" x2="62" y2="82" stroke="${accent}" stroke-width="3"/>
    </svg>`;
  }
  if (schemaId.startsWith('lighting.')) {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="84" rx="18" ry="3" fill="rgba(0,0,0,0.1)"/>
      <rect x="47" y="24" width="6" height="48" rx="3" fill="${accent}"/>
      <rect x="36" y="18" width="28" height="12" rx="4" fill="${accent}"/>
      <circle cx="50" cy="36" r="16" fill="${color}" opacity="0.32"/>
      <circle cx="50" cy="36" r="9" fill="${color}" opacity="0.72"/>
    </svg>`;
  }
  if (schemaId.startsWith('surface.')) {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="82" rx="34" ry="5" fill="rgba(0,0,0,0.08)"/>
      <rect x="18" y="30" width="64" height="36" rx="10" fill="${color}" opacity="0.85"/>
      <rect x="22" y="34" width="56" height="28" rx="8" fill="none" stroke="${accent}" stroke-width="2" opacity="0.35"/>
    </svg>`;
  }
  if (schemaId.startsWith('seat.sofa')) {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="84" rx="32" ry="4" fill="rgba(0,0,0,0.08)"/>
      <rect x="18" y="46" width="64" height="22" rx="8" fill="${color}" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>
      <rect x="18" y="32" width="64" height="18" rx="8" fill="${color}" opacity="0.92"/>
      <rect x="16" y="36" width="10" height="30" rx="5" fill="${accent}" opacity="0.72"/>
      <rect x="74" y="36" width="10" height="30" rx="5" fill="${accent}" opacity="0.72"/>
    </svg>`;
  }
  if (schemaId.startsWith('arrow.')) {
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M 16 50 L 52 50 L 52 38 L 84 50 L 52 62 L 52 50 Z" fill="${accent}"/>
      <rect x="20" y="44" width="34" height="12" rx="6" fill="${color}" opacity="0.42"/>
    </svg>`;
  }
  if (schemaId.startsWith('prop.generic-round')) return svgCircle(color);
  if (schemaId.startsWith('prop.generic-rect')) return svgRect(color);

  const label = (def.name || '').slice(0, 2).toUpperCase();
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="14" y="16" width="72" height="68" rx="12" fill="rgba(255,255,255,0.82)" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>
    <rect x="20" y="24" width="60" height="32" rx="10" fill="${color}" opacity="0.86"/>
    <rect x="22" y="62" width="56" height="12" rx="6" fill="rgba(0,0,0,0.06)"/>
    <text x="50" y="71" text-anchor="middle" font-size="18" font-family="JetBrains Mono, monospace" fill="rgba(0,0,0,0.68)">${label || 'ES'}</text>
  </svg>`;
}

function svgCircle(fill) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="62" rx="34" ry="10" fill="rgba(0,0,0,0.08)"/>
    <circle cx="50" cy="50" r="34" fill="${fill}" stroke="rgba(0,0,0,0.15)" stroke-width="0.8"/>
    <ellipse cx="44" cy="42" rx="14" ry="6" fill="white" opacity="0.5"/>
  </svg>`;
}

function svgRect(fill) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="58" width="60" height="6" fill="rgba(0,0,0,0.08)" rx="2"/>
    <rect x="22" y="32" width="56" height="28" fill="${fill}" stroke="rgba(0,0,0,0.15)" stroke-width="0.8" rx="3"/>
    <rect x="28" y="36" width="22" height="6" fill="white" opacity="0.5" rx="2"/>
  </svg>`;
}

function svgLongRect(fill) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="56" width="84" height="6" fill="rgba(0,0,0,0.08)" rx="2"/>
    <rect x="10" y="38" width="80" height="20" fill="${fill}" stroke="rgba(0,0,0,0.15)" stroke-width="0.8" rx="2"/>
    <rect x="14" y="40" width="20" height="4" fill="white" opacity="0.5" rx="1"/>
  </svg>`;
}

function svgTent(fill) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="78" rx="38" ry="6" fill="rgba(0,0,0,0.08)"/>
    <polygon points="50,18 88,62 12,62" fill="${fill}" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>
    <polygon points="50,18 88,62 50,52" fill="rgba(0,0,0,0.08)"/>
    <line x1="50" y1="18" x2="50" y2="62" stroke="rgba(0,0,0,0.2)" stroke-width="0.5"/>
  </svg>`;
}

function svgBush(fill) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="80" rx="30" ry="4" fill="rgba(0,0,0,0.1)"/>
    <circle cx="38" cy="58" r="18" fill="${fill}"/>
    <circle cx="62" cy="56" r="20" fill="${fill}"/>
    <circle cx="50" cy="46" r="16" fill="${fill}"/>
    <circle cx="42" cy="44" r="6" fill="white" opacity="0.25"/>
  </svg>`;
}

function svgTree(crown, trunk) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="86" rx="22" ry="3" fill="rgba(0,0,0,0.1)"/>
    <rect x="46" y="58" width="8" height="28" fill="${trunk}"/>
    <circle cx="40" cy="40" r="18" fill="${crown}"/>
    <circle cx="58" cy="36" r="20" fill="${crown}"/>
    <circle cx="50" cy="26" r="14" fill="${crown}"/>
    <circle cx="44" cy="26" r="5" fill="white" opacity="0.25"/>
  </svg>`;
}

function svgLights(bulb) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M 10 30 Q 50 60 90 30" stroke="#2a2a2c" stroke-width="1.2" fill="none"/>
    ${[15,30,45,60,75,90].map((x,i) => {
      const t = i/5;
      const y = 30 + 30*4*t*(1-t);
      return `<circle cx="${x}" cy="${y+4}" r="3.5" fill="${bulb}"/>
              <circle cx="${x-1}" cy="${y+3}" r="1" fill="white" opacity="0.6"/>`;
    }).join('')}
  </svg>`;
}

function svgRoom(fill) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <polygon points="20,30 80,30 88,40 88,75 12,75 12,40" fill="${fill}" stroke="rgba(0,0,0,0.25)" stroke-width="0.8"/>
    <polygon points="20,30 12,40 12,75 20,70" fill="rgba(0,0,0,0.08)"/>
    <polygon points="80,30 88,40 88,75 80,70" fill="rgba(0,0,0,0.05)"/>
    <rect x="40" y="48" width="20" height="22" fill="rgba(0,0,0,0.12)"/>
  </svg>`;
}

function svgChair(fill, subtype) {
  const back = subtype === 'tolix'
    ? `<path d="M 32 26 Q 50 22 68 26 L 68 50 Q 50 46 32 50 Z" fill="${fill}" stroke="rgba(0,0,0,0.2)" stroke-width="0.6"/>`
    : `<rect x="32" y="22" width="36" height="28" fill="${fill}" stroke="rgba(0,0,0,0.18)" stroke-width="0.6" rx="3"/>`;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="82" rx="22" ry="3" fill="rgba(0,0,0,0.1)"/>
    ${back}
    <rect x="32" y="50" width="36" height="6" fill="${fill}" stroke="rgba(0,0,0,0.2)" stroke-width="0.6"/>
    <line x1="36" y1="56" x2="36" y2="78" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
    <line x1="64" y1="56" x2="64" y2="78" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
    <line x1="38" y1="56" x2="38" y2="78" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
    <line x1="62" y1="56" x2="62" y2="78" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
  </svg>`;
}

function svgChairLineal(fill) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="82" rx="38" ry="3" fill="rgba(0,0,0,0.1)"/>
    ${[18,38,58,78].map(x => `
      <rect x="${x-7}" y="30" width="14" height="22" fill="${fill}" stroke="rgba(0,0,0,0.2)" stroke-width="0.5" rx="2"/>
      <rect x="${x-7}" y="52" width="14" height="4" fill="${fill}" stroke="rgba(0,0,0,0.2)" stroke-width="0.5"/>
      <line x1="${x-5}" y1="56" x2="${x-5}" y2="76" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
      <line x1="${x+5}" y1="56" x2="${x+5}" y2="76" stroke="rgba(0,0,0,0.4)" stroke-width="1"/>
    `).join('')}
  </svg>`;
}

function svgMesaRect() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="62" width="60" height="4" fill="rgba(0,0,0,0.1)"/>
    <rect x="22" y="42" width="56" height="20" fill="#e6e2da" stroke="rgba(0,0,0,0.18)" stroke-width="0.7" rx="2"/>
    ${[30,46,62,78].flatMap(x => [
      `<rect x="${x-5}" y="28" width="10" height="10" fill="#bbb" rx="1"/>`,
      `<rect x="${x-5}" y="66" width="10" height="10" fill="#bbb" rx="1"/>`
    ]).join('')}
  </svg>`;
}

function svgMesaCocktail() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="86" rx="22" ry="3" fill="rgba(0,0,0,0.15)"/>
    <rect x="46" y="40" width="8" height="38" fill="#888"/>
    <polygon points="30,40 70,40 78,76 22,76" fill="#fff" stroke="rgba(0,0,0,0.2)" stroke-width="0.6"/>
    <ellipse cx="50" cy="36" rx="22" ry="6" fill="#fff" stroke="rgba(0,0,0,0.2)" stroke-width="0.6"/>
    <ellipse cx="44" cy="32" rx="10" ry="2" fill="#fff" opacity="0.6"/>
  </svg>`;
}

function svgMesaImperial() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="58" width="88" height="4" fill="rgba(0,0,0,0.1)"/>
    <rect x="8" y="42" width="84" height="18" fill="#e6e2da" stroke="rgba(0,0,0,0.18)" stroke-width="0.7" rx="2"/>
    ${[14,26,38,50,62,74,86].flatMap(x => [
      `<rect x="${x-3.5}" y="30" width="7" height="9" fill="#bbb" rx="1"/>`,
      `<rect x="${x-3.5}" y="63" width="7" height="9" fill="#bbb" rx="1"/>`
    ]).join('')}
  </svg>`;
}

function svgMesaCurva() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M 16 75 A 40 40 0 0 1 84 75 L 80 58 A 28 28 0 0 0 20 58 Z" fill="#e6e2da" stroke="rgba(0,0,0,0.2)" stroke-width="0.7"/>
    ${[25,40,50,60,75].map((x,i) => {
      const cy = 75 - Math.sin((i-2)*0.5)*4 - 12;
      return `<rect x="${x-4}" y="${cy}" width="8" height="8" fill="#bbb" rx="1"/>`;
    }).join('')}
  </svg>`;
}

function svgMesaSerpentina() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M 8 70 Q 28 48 50 60 Q 72 72 92 50 L 90 38 Q 72 58 50 48 Q 28 38 10 58 Z" fill="#e6e2da" stroke="rgba(0,0,0,0.2)" stroke-width="0.7"/>
    ${[18,32,48,62,78].map((x,i) => {
      const y = i%2 ? 70 : 38;
      return `<rect x="${x-3.5}" y="${y}" width="7" height="7" fill="#bbb" rx="1"/>`;
    }).join('')}
  </svg>`;
}

function svgTentSquare() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="84" rx="38" ry="4" fill="rgba(0,0,0,0.1)"/>
    <polygon points="20,60 80,60 50,18" fill="#f5f1e8" stroke="rgba(0,0,0,0.2)" stroke-width="0.6"/>
    <polygon points="20,60 50,18 50,72" fill="rgba(0,0,0,0.06)"/>
    <line x1="20" y1="60" x2="20" y2="78" stroke="#6b4423" stroke-width="1.5"/>
    <line x1="80" y1="60" x2="80" y2="78" stroke="#6b4423" stroke-width="1.5"/>
    <circle cx="50" cy="18" r="2" fill="#2a1810"/>
  </svg>`;
}

function svgTentStar() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="82" rx="38" ry="4" fill="rgba(0,0,0,0.1)"/>
    <path d="M 50 20 L 80 50 L 70 70 L 50 60 L 30 70 L 20 50 Z" fill="#ede7d6" stroke="rgba(0,0,0,0.18)" stroke-width="0.6"/>
    <path d="M 50 20 L 50 60 L 30 70 Z" fill="rgba(0,0,0,0.06)"/>
    <circle cx="50" cy="56" r="2" fill="#6b4423"/>
  </svg>`;
}

function svgTentPabellon() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="84" rx="40" ry="4" fill="rgba(0,0,0,0.1)"/>
    <polygon points="10,60 90,60 80,30 20,30" fill="#f0ead8" stroke="rgba(0,0,0,0.2)" stroke-width="0.6"/>
    <line x1="10" y1="60" x2="20" y2="30" stroke="#3a4d5c" stroke-width="1.2"/>
    <line x1="90" y1="60" x2="80" y2="30" stroke="#3a4d5c" stroke-width="1.2"/>
    <line x1="20" y1="30" x2="80" y2="30" stroke="#3a4d5c" stroke-width="1.4"/>
    <line x1="10" y1="60" x2="10" y2="78" stroke="#3a4d5c" stroke-width="1.5"/>
    <line x1="90" y1="60" x2="90" y2="78" stroke="#3a4d5c" stroke-width="1.5"/>
  </svg>`;
}

function svgTentTransparent() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="84" rx="40" ry="4" fill="rgba(0,0,0,0.1)"/>
    <polygon points="10,60 90,60 80,30 20,30" fill="rgba(168,216,232,0.35)" stroke="white" stroke-width="1.5"/>
    <rect x="20" y="60" width="60" height="18" fill="rgba(168,216,232,0.25)" stroke="white" stroke-width="1.2"/>
    <line x1="10" y1="60" x2="90" y2="60" stroke="white" stroke-width="1.4"/>
    <line x1="20" y1="30" x2="80" y2="30" stroke="white" stroke-width="1.4"/>
  </svg>`;
}

function svgTentBeduina() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="84" rx="42" ry="4" fill="rgba(0,0,0,0.1)"/>
    <path d="M 8 70 Q 25 60 35 30 Q 50 50 65 30 Q 75 60 92 70 L 88 78 L 12 78 Z" fill="#d9b88a" stroke="rgba(0,0,0,0.18)" stroke-width="0.6"/>
    <line x1="35" y1="30" x2="35" y2="78" stroke="#3a2d1f" stroke-width="1.5"/>
    <line x1="65" y1="30" x2="65" y2="78" stroke="#3a2d1f" stroke-width="1.5"/>
  </svg>`;
}

function svgTentSailcloth() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="84" rx="42" ry="4" fill="rgba(0,0,0,0.1)"/>
    <path d="M 8 70 Q 30 56 35 20 Q 50 56 65 20 Q 70 56 92 70 L 92 78 L 8 78 Z" fill="#f8f5ec" stroke="rgba(0,0,0,0.18)" stroke-width="0.6"/>
    <line x1="35" y1="20" x2="35" y2="78" stroke="#5d4a36" stroke-width="1.4"/>
    <line x1="65" y1="20" x2="65" y2="78" stroke="#5d4a36" stroke-width="1.4"/>
  </svg>`;
}

function svgTentTipi() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="84" rx="32" ry="3" fill="rgba(0,0,0,0.12)"/>
    <polygon points="50,12 22,80 78,80" fill="#e8dcc4" stroke="rgba(0,0,0,0.18)" stroke-width="0.6"/>
    <polygon points="50,12 40,80 50,80" fill="rgba(0,0,0,0.08)"/>
    <line x1="50" y1="12" x2="45" y2="6" stroke="#3a2d1f" stroke-width="1.4"/>
    <line x1="50" y1="12" x2="55" y2="6" stroke="#3a2d1f" stroke-width="1.4"/>
    <line x1="50" y1="12" x2="50" y2="6" stroke="#3a2d1f" stroke-width="1.4"/>
    <polygon points="48,60 52,60 52,80 48,80" fill="rgba(0,0,0,0.4)"/>
  </svg>`;
}

function svgTentDomo() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="80" rx="38" ry="4" fill="rgba(0,0,0,0.1)"/>
    <path d="M 12 76 A 38 38 0 0 1 88 76 Z" fill="#e8e2d0" stroke="rgba(0,0,0,0.2)" stroke-width="0.6"/>
    ${[22,32,42,52,62,72,82].map(x => `<path d="M ${x} 76 Q ${x} 40 50 30" stroke="rgba(58,77,92,0.5)" stroke-width="0.6" fill="none"/>`).join('')}
    ${[68,58,48,38].map(y => `<path d="M ${50 - Math.sqrt(38*38 - (76-y)*(76-y))} ${y} A ${Math.sqrt(38*38 - (76-y)*(76-y))} ${Math.sqrt(38*38 - (76-y)*(76-y))} 0 0 1 ${50 + Math.sqrt(38*38 - (76-y)*(76-y))} ${y}" stroke="rgba(58,77,92,0.4)" stroke-width="0.5" fill="none"/>`).join('')}
    <rect x="46" y="58" width="8" height="18" fill="#3a4d5c"/>
  </svg>`;
}

function svgPoste() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="86" rx="10" ry="2.5" fill="rgba(0,0,0,0.18)"/>
    <rect x="46" y="14" width="8" height="68" fill="#6b4423" stroke="rgba(0,0,0,0.2)" stroke-width="0.5"/>
    <ellipse cx="50" cy="14" rx="4" ry="1.2" fill="#5a3a1f"/>
    <ellipse cx="50" cy="82" rx="14" ry="3" fill="#5a3a1f"/>
  </svg>`;
}

function svgBarraLibre() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="54" width="80" height="26" fill="#1a1a1c" rx="2"/>
    <rect x="10" y="50" width="80" height="6" fill="#2a2a2c" rx="1"/>
    ${[28,50,72].map(x => `
      <circle cx="${x}" cy="49" r="8" fill="#6b6864" stroke="#9a9692" stroke-width="1"/>
      <circle cx="${x}" cy="49" r="5.5" fill="#d0eef8" opacity="0.7"/>
    `).join('')}
    <rect x="10" y="78" width="80" height="4" fill="#2a2a2c" rx="1"/>
  </svg>`;
}

function svgAlfombra(fill) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="12" y="28" width="76" height="44" fill="${fill}" rx="3"/>
    <rect x="16" y="32" width="68" height="36" fill="none" stroke="#c9a55a" stroke-width="2"/>
    <rect x="22" y="38" width="56" height="24" fill="none" stroke="#c9a55a" stroke-width="0.8" opacity="0.5"/>
    <circle cx="50" cy="50" r="8" fill="none" stroke="#c9a55a" stroke-width="1.5" opacity="0.6"/>
  </svg>`;
}

function svgAlfombraRound(fill) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="34" fill="${fill}"/>
    <circle cx="50" cy="50" r="28" fill="none" stroke="#c9a55a" stroke-width="3"/>
    <circle cx="50" cy="50" r="14" fill="none" stroke="#c9a55a" stroke-width="1.2" opacity="0.55"/>
    <ellipse cx="50" cy="84" rx="30" ry="4" fill="rgba(0,0,0,0.10)"/>
  </svg>`;
}

function svgPlantaDeco() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="84" rx="14" ry="3" fill="rgba(0,0,0,0.12)"/>
    <path d="M 38 72 Q 36 60 50 72" fill="#8b5e3c"/>
    <ellipse cx="50" cy="72" rx="14" ry="8" fill="#8b5e3c"/>
    <circle cx="38" cy="50" r="16" fill="#3e7a3a"/>
    <circle cx="60" cy="46" r="18" fill="#3e7a3a"/>
    <circle cx="50" cy="36" r="13" fill="#3e7a3a"/>
    <circle cx="43" cy="36" r="5" fill="white" opacity="0.2"/>
  </svg>`;
}

function svgSpot() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <line x1="35" y1="82" x2="42" y2="32" stroke="#2a2a2c" stroke-width="2"/>
    <line x1="50" y1="82" x2="50" y2="28" stroke="#2a2a2c" stroke-width="2"/>
    <line x1="65" y1="82" x2="58" y2="32" stroke="#2a2a2c" stroke-width="2"/>
    <ellipse cx="35" cy="82" rx="5" ry="2" fill="#1a1a1c"/>
    <ellipse cx="50" cy="82" rx="5" ry="2" fill="#1a1a1c"/>
    <ellipse cx="65" cy="82" rx="5" ry="2" fill="#1a1a1c"/>
    <ellipse cx="50" cy="30" rx="12" ry="8" fill="#1a1a1c"/>
    <ellipse cx="50" cy="28" rx="9" ry="5" fill="#fffbe8" opacity="0.9"/>
    <ellipse cx="46" cy="26" rx="3" ry="1.5" fill="white" opacity="0.6"/>
  </svg>`;
}

function svgPlaceholder() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="20" y="20" width="60" height="60" fill="#e6e2da" stroke="rgba(0,0,0,0.15)" stroke-width="0.8" rx="6"/>
  </svg>`;
}

export const CatalogModal = {
  init,
  open,
  close,
  isOpen,
  hasPendingPlacement,
  getPendingPlacement,
  getPendingDefinition,
  createPendingItem,
  clearPendingPlacement,
  shouldKeepPlacementActive,
  setPendingItemTemplate
};

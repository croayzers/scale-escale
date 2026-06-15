/* ─────────────────────────────────────────────────────────
   CATALOG MODAL — Modal flotante con tarjetas por categoría
   ───────────────────────────────────────────────────────── */

import { ElementLibrary }    from '../core/ElementLibrary.js';
import { CATALOG_CATEGORIES } from '../schemas/CatalogCategories.js';
import { SubscriptionManager } from '../services/SubscriptionManager.js';
import { PlansModal }          from './PlansModal.js';

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

function isCategoryProLocked(key) {
  // ⚠️ GATING DESACTIVADO (2026-06-15): fase gratuita, nada bloqueado.
  // Reactivar: borra el return false y deja el cuerpo original.
  return false;
  // eslint-disable-next-line no-unreachable
  const cat = CATALOG_CATEGORIES.find(c => c.key === key);
  if (!cat?.pro) return false;
  const code = SubscriptionManager.currentPlanCode();
  return code !== 'pro' && code !== 'premium';
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

  const proClass = isCategoryProLocked(categoryKey) ? ' cat-card--pro-locked' : '';

  grid.innerHTML = items.map(def => `
    <div class="cat-card${proClass}" data-element-id="${escId(def.id)}" data-cat-key="${escId(categoryKey)}">
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

  grid.innerHTML = groups.map(({ cat, hits }) => {
    const proClass = isCategoryProLocked(cat.key) ? ' cat-card--pro-locked' : '';
    return `
    <div class="catalog-search-group">
      <div class="catalog-search-group-label">${escHtml(cat.label)}</div>
      <div class="catalog-search-group-cards">
        ${hits.map(def => `
          <div class="cat-card cat-card-sm${proClass}" data-element-id="${escId(def.id)}" data-cat-key="${escId(cat.key)}">
            <div class="cat-thumb">${thumbSVG(def)}</div>
            <div class="cat-name">${highlightMatch(def.name, searchQuery)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  }).join('');

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
      if (isCategoryProLocked(catKey)) {
        PlansModal.open('pro');
        return;
      }
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

  const wasHidden = modal.classList.contains('hidden');

  // Si hay búsqueda activa, no la limpiamos al cambiar categoría
  renderCatalogContent();

  // Solo disparar el evento y mostrar la animación si el modal estaba cerrado
  if (wasHidden) {
    document.dispatchEvent(new CustomEvent('escale:scene-overlay-open', {
      detail: { kind: 'catalog', key: categoryKey }
    }));
    modal.classList.remove('hidden');
  }

  // Foco en búsqueda al abrir (solo en dispositivos no táctiles para no abrir el teclado virtual)
  if (!window.matchMedia('(pointer: coarse)').matches) {
    setTimeout(() => document.getElementById('catalog-search')?.focus(), 60);
  }
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
  const defId = def.id || '';
  if (defId === 'coche')           return svgCoche(def.color || '#64748B');
  if (defId === 'moto')            return svgMoto(def.color || '#111827');
  if (defId === 'camion')          return svgCamion(def.color || '#475569');
  if (defId === 'avioneta')        return svgAvioneta(def.color || '#E5E7EB');
  if (defId === 'barco')           return svgBarco(def.color || '#1D4ED8');
  if (defId === 'helicoptero')     return svgHelicoptero(def.color || '#334155');
  if (defId === 'escalera')        return svgEscalera(def.color || '#4B5563');
  if (defId === 'arena')           return svgArena();
  if (defId === 'cesped')          return svgCesped();
  if (defId === 'tierra')          return svgTierra();
  if (defId === 'cemento')         return svgCemento();
  if (defId === 'mesa_dj')         return svgMesaDJ();
  if (defId === 'agua_piscina')    return svgAgua();
  if (defId.startsWith('flecha_')) return svgFlecha(def.color || '#111827');
  if (def.type === 'text2d') return svgText2D(def.color || '#111827');
  if (def.type === 'ceilingProp') return svgCeilingProp(def);
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

function svgText2D(c) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="36" width="80" height="28" rx="6" fill="rgba(245,243,238,0.9)" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>
    <text x="50" y="57" text-anchor="middle" font-size="22" font-weight="bold" font-family="JetBrains Mono, monospace" fill="${c}">Aa</text>
  </svg>`;
}

function svgCeilingProp(def) {
  const c = def.color || '#C7CBD1';
  const profile = def.ceilingProfile || '';
  // Techo + cable + figura según el tipo de colgante
  const ceiling = `<rect x="14" y="14" width="72" height="5" rx="2" fill="rgba(0,0,0,0.18)"/>`;
  const cable = `<line x1="50" y1="19" x2="50" y2="40" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>`;
  let figure;
  switch (profile) {
    case 'disco_ball':
      figure = `<circle cx="50" cy="56" r="16" fill="${c}"/>
        <line x1="38" y1="50" x2="62" y2="50" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>
        <line x1="36" y1="56" x2="64" y2="56" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>
        <line x1="38" y1="62" x2="62" y2="62" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>
        <line x1="50" y1="40" x2="50" y2="72" stroke="rgba(0,0,0,0.18)" stroke-width="0.8"/>
        <line x1="42" y1="42" x2="42" y2="70" stroke="rgba(0,0,0,0.12)" stroke-width="0.8"/>
        <line x1="58" y1="42" x2="58" y2="70" stroke="rgba(0,0,0,0.12)" stroke-width="0.8"/>`;
      break;
    case 'chandelier':
      figure = `<path d="M34 48 Q50 42 66 48" fill="none" stroke="${c}" stroke-width="2"/>
        <circle cx="34" cy="50" r="4" fill="#FFE8A3"/><circle cx="50" cy="46" r="4" fill="#FFE8A3"/><circle cx="66" cy="50" r="4" fill="#FFE8A3"/>
        <rect x="47" y="40" width="6" height="14" rx="2" fill="${c}"/>`;
      break;
    case 'balloon_cluster':
    case 'paper_lanterns':
      figure = `<circle cx="42" cy="54" r="10" fill="${c}"/><circle cx="58" cy="58" r="10" fill="${c}" opacity="0.7"/><circle cx="50" cy="48" r="9" fill="${c}" opacity="0.85"/>`;
      break;
    case 'bunting':
      figure = `<path d="M22 40 Q50 50 78 40" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
        <polygon points="28,42 36,42 32,52" fill="#E04F5F"/><polygon points="42,46 50,46 46,56" fill="#F2C94C"/><polygon points="56,46 64,46 60,56" fill="#27AE60"/><polygon points="68,43 76,43 72,53" fill="#4F8FE0"/>`;
      break;
    case 'hanging_banner':
      figure = `<rect x="32" y="40" width="36" height="30" rx="2" fill="${c}"/>`;
      break;
    case 'hanging_hoops':
      figure = `<circle cx="50" cy="56" r="16" fill="none" stroke="${c}" stroke-width="3"/><circle cx="50" cy="56" r="9" fill="none" stroke="${c}" stroke-width="2" opacity="0.6"/>`;
      break;
    case 'light_drop':
      figure = `<rect x="24" y="38" width="52" height="3" rx="1.5" fill="rgba(0,0,0,0.4)"/>
        ${[28,40,52,64,72].map(x => `<line x1="${x}" y1="41" x2="${x}" y2="68" stroke="rgba(0,0,0,0.2)" stroke-width="0.8"/><circle cx="${x}" cy="68" r="2.5" fill="#FFE8A3"/>`).join('')}`;
      break;
    case 'hanging_mobile':
      figure = `<line x1="36" y1="48" x2="64" y2="48" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>
        <polygon points="36,52 40,60 32,60" fill="#F2C94C"/><polygon points="64,52 68,60 60,60" fill="#4F8FE0"/><circle cx="50" cy="60" r="5" fill="#E04F5F"/>`;
      break;
    case 'floral_hang':
      figure = `<rect x="24" y="40" width="52" height="3" rx="1.5" fill="rgba(90,74,53,0.6)"/>
        ${[30,40,50,60,70].map((x,i) => `<circle cx="${x}" cy="${50+(i%2)*8}" r="6" fill="${c}"/><circle cx="${x}" cy="${48+(i%2)*8}" r="3" fill="#E04F5F"/>`).join('')}`;
      break;
    default:
      figure = `<circle cx="50" cy="56" r="14" fill="${c}"/>`;
  }
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${ceiling}${cable}${figure}</svg>`;
}

/* ── Vehículos / transporte ── */

function svgCoche(c) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="84" rx="36" ry="4" fill="rgba(0,0,0,0.12)"/>
    <circle cx="27" cy="70" r="11" fill="#1c1c1e"/><circle cx="27" cy="70" r="6.5" fill="#555"/><circle cx="27" cy="70" r="2.5" fill="#888"/>
    <circle cx="73" cy="70" r="11" fill="#1c1c1e"/><circle cx="73" cy="70" r="6.5" fill="#555"/><circle cx="73" cy="70" r="2.5" fill="#888"/>
    <rect x="10" y="51" width="80" height="19" rx="3" fill="${c}"/>
    <path d="M 27 51 L 31 33 L 69 33 L 73 51 Z" fill="${c}"/>
    <path d="M 33 35 L 35 51 L 51 51 L 51 35 Z" fill="#9DD3EE" opacity="0.82"/>
    <path d="M 53 35 L 53 51 L 68 51 L 66 35 Z" fill="#9DD3EE" opacity="0.82"/>
    <rect x="51" y="35" width="2" height="16" fill="${c}" opacity="0.8"/>
    <line x1="51" y1="51" x2="51" y2="69" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
    <rect x="10" y="54" width="5" height="7" rx="1" fill="#FEF08A"/><circle cx="12" cy="57" r="2" fill="white" opacity="0.6"/>
    <rect x="85" y="54" width="5" height="7" rx="1" fill="#FCA5A5"/>
    <rect x="10" y="51" width="80" height="2" fill="white" opacity="0.12" rx="1"/>
  </svg>`;
}

function svgMoto(c) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="85" rx="34" ry="4" fill="rgba(0,0,0,0.12)"/>
    <circle cx="22" cy="68" r="15" fill="#1c1c1e"/><circle cx="22" cy="68" r="8.5" fill="#555"/><circle cx="22" cy="68" r="3.5" fill="#888"/>
    <circle cx="78" cy="68" r="15" fill="#1c1c1e"/><circle cx="78" cy="68" r="8.5" fill="#555"/><circle cx="78" cy="68" r="3.5" fill="#888"/>
    <line x1="22" y1="53" x2="52" y2="47" stroke="${c}" stroke-width="4" stroke-linecap="round"/>
    <line x1="52" y1="47" x2="78" y2="53" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>
    <line x1="52" y1="47" x2="56" y2="60" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <line x1="78" y1="53" x2="72" y2="60" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <rect x="42" y="52" width="22" height="13" rx="3" fill="${c}"/>
    <rect x="44" y="54" width="8" height="5" rx="1" fill="rgba(255,255,255,0.1)"/>
    <path d="M 36 41 Q 46 35 56 41 L 56 50 Q 46 52 36 50 Z" fill="${c}"/>
    <path d="M 21 43 Q 34 39 50 41 L 50 47 Q 34 45 21 49 Z" fill="rgba(0,0,0,0.55)"/>
    <line x1="70" y1="36" x2="78" y2="53" stroke="#6b7280" stroke-width="2.5"/>
    <line x1="74" y1="36" x2="82" y2="53" stroke="#6b7280" stroke-width="2"/>
    <line x1="64" y1="34" x2="84" y2="32" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="64" cy="34" r="2.2" fill="#555"/><circle cx="84" cy="32" r="2.2" fill="#555"/>
    <path d="M 22 61 Q 17 67 15 73" stroke="#6b7280" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;
}

function svgCamion(c) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="84" rx="46" ry="4" fill="rgba(0,0,0,0.1)"/>
    <rect x="6" y="42" width="58" height="26" rx="2" fill="${c}" opacity="0.78"/>
    <rect x="6" y="40" width="58" height="4" fill="${c}" rx="1"/>
    <line x1="6" y1="52" x2="64" y2="52" stroke="rgba(0,0,0,0.16)" stroke-width="0.8"/>
    <line x1="6" y1="61" x2="64" y2="61" stroke="rgba(0,0,0,0.12)" stroke-width="0.8"/>
    <rect x="64" y="44" width="28" height="24" rx="3" fill="${c}"/>
    <rect x="64" y="40" width="28" height="6" rx="2" fill="${c}"/>
    <rect x="67" y="47" width="17" height="11" rx="2" fill="#9DD3EE" opacity="0.82"/>
    <rect x="67" y="60" width="9" height="5" rx="1" fill="rgba(0,0,0,0.18)"/>
    <rect x="91" y="52" width="3" height="7" rx="1" fill="#FEF08A"/>
    <rect x="68" y="26" width="5" height="16" rx="2" fill="#6B7280"/>
    <ellipse cx="70" cy="26" rx="3" ry="1.2" fill="#555"/>
    <circle cx="20" cy="70" r="9" fill="#1c1c1e"/><circle cx="20" cy="70" r="5" fill="#555"/>
    <circle cx="35" cy="70" r="9" fill="#1c1c1e"/><circle cx="35" cy="70" r="5" fill="#555"/>
    <circle cx="54" cy="70" r="9" fill="#1c1c1e"/><circle cx="54" cy="70" r="5" fill="#555"/>
    <circle cx="78" cy="70" r="9" fill="#1c1c1e"/><circle cx="78" cy="70" r="5" fill="#555"/>
    <circle cx="91" cy="70" r="7" fill="#1c1c1e"/><circle cx="91" cy="70" r="4" fill="#555"/>
  </svg>`;
}

function svgAvioneta(c) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="88" rx="14" ry="3" fill="rgba(0,0,0,0.12)"/>
    <path d="M 44 56 L 5 70 L 5 76 L 44 65 Z" fill="${c}" stroke="rgba(0,0,0,0.14)" stroke-width="0.6"/>
    <path d="M 56 56 L 95 70 L 95 76 L 56 65 Z" fill="${c}" stroke="rgba(0,0,0,0.14)" stroke-width="0.6"/>
    <ellipse cx="50" cy="52" rx="7" ry="32" fill="${c}" stroke="rgba(0,0,0,0.14)" stroke-width="0.8"/>
    <path d="M 45 81 L 22 87 L 22 89 L 45 85 Z" fill="${c}" opacity="0.9"/>
    <path d="M 55 81 L 78 87 L 78 89 L 55 85 Z" fill="${c}" opacity="0.9"/>
    <ellipse cx="50" cy="37" rx="4.5" ry="7" fill="#9DD3EE" opacity="0.72"/>
    <rect x="48" y="17" width="4" height="9" rx="2" fill="#555"/>
    <rect x="33" y="20" width="34" height="4" rx="2" fill="#333"/>
    <circle cx="50" cy="20" r="2.5" fill="#444"/>
    <line x1="6" y1="73" x2="44" y2="63" stroke="rgba(0,0,0,0.2)" stroke-width="0.6"/>
    <line x1="56" y1="63" x2="94" y2="73" stroke="rgba(0,0,0,0.2)" stroke-width="0.6"/>
  </svg>`;
}

function svgBarco(c) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M 4 71 Q 20 67 36 71 Q 52 75 68 71 Q 82 67 96 71 L 96 82 L 4 82 Z" fill="#93C5FD" opacity="0.38"/>
    <path d="M 10 56 L 10 71 Q 50 80 90 71 L 90 56 Z" fill="${c}"/>
    <path d="M 10 66 Q 50 75 90 66 L 90 71 Q 50 80 10 71 Z" fill="rgba(0,0,0,0.2)"/>
    <path d="M 86 56 L 98 68 L 90 71 Z" fill="${c}"/>
    <rect x="10" y="50" width="80" height="7" rx="1" fill="${c}" opacity="0.92"/>
    <line x1="10" y1="54" x2="90" y2="54" stroke="white" stroke-width="0.8" opacity="0.3"/>
    <rect x="36" y="36" width="36" height="15" rx="3" fill="${c}" opacity="0.88"/>
    <rect x="40" y="40" width="10" height="7" rx="1.5" fill="#9DD3EE" opacity="0.8"/>
    <rect x="55" y="40" width="10" height="7" rx="1.5" fill="#9DD3EE" opacity="0.8"/>
    <line x1="52" y1="18" x2="52" y2="50" stroke="#6b7280" stroke-width="1.5"/>
    <line x1="52" y1="18" x2="88" y2="38" stroke="#9ca3af" stroke-width="0.6" opacity="0.5"/>
    <line x1="52" y1="18" x2="16" y2="40" stroke="#9ca3af" stroke-width="0.6" opacity="0.5"/>
    <path d="M 52 18 L 64 22 L 52 28 Z" fill="#EF4444" opacity="0.8"/>
    <circle cx="22" cy="63" r="3.5" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.2"/>
    <circle cx="22" cy="63" r="2" fill="#9DD3EE" opacity="0.35"/>
  </svg>`;
}

function svgHelicoptero(c) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="42" cy="85" rx="27" ry="4" fill="rgba(0,0,0,0.12)"/>
    <rect x="20" y="78" width="34" height="3" rx="1.5" fill="#555"/>
    <rect x="24" y="71" width="4" height="8" rx="1" fill="#666"/>
    <rect x="46" y="71" width="4" height="8" rx="1" fill="#666"/>
    <path d="M 58 58 L 94 52 L 94 59 L 60 65 Z" fill="${c}" opacity="0.82"/>
    <ellipse cx="94" cy="52" rx="2" ry="9" fill="#444"/>
    <ellipse cx="94" cy="52" rx="9" ry="2" fill="#444" opacity="0.45"/>
    <ellipse cx="40" cy="60" rx="28" ry="18" fill="${c}"/>
    <path d="M 50 49 Q 68 52 72 62 Q 68 73 56 75 L 50 73 Z" fill="#9DD3EE" opacity="0.62"/>
    <path d="M 53 51 Q 66 54 68 63" stroke="white" stroke-width="0.8" fill="none" opacity="0.3"/>
    <path d="M 14 65 Q 40 73 68 65 L 68 68 Q 40 77 14 68 Z" fill="rgba(0,0,0,0.12)"/>
    <rect x="38" y="40" width="4" height="12" rx="1" fill="#555"/>
    <line x1="7" y1="44" x2="73" y2="44" stroke="#2a2a2c" stroke-width="3" stroke-linecap="round"/>
    <line x1="40" y1="18" x2="40" y2="68" stroke="#2a2a2c" stroke-width="3" stroke-linecap="round"/>
    <circle cx="40" cy="42" r="5" fill="#3a3a3c"/>
    <circle cx="40" cy="42" r="2.5" fill="#555"/>
  </svg>`;
}

function svgEscalera(c) {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="58" cy="87" rx="30" ry="4" fill="rgba(0,0,0,0.1)"/>
    <polygon points="38,26 78,26 88,20 48,20" fill="${c}"/>
    <polygon points="38,26 78,26 88,20 48,20" fill="rgba(0,0,0,0.08)"/>
    <rect x="38" y="26" width="40" height="18" rx="1" fill="${c}"/>
    <polygon points="78,26 88,20 88,38 78,44" fill="${c}"/>
    <polygon points="78,26 88,20 88,38 78,44" fill="rgba(0,0,0,0.28)"/>
    <polygon points="28,44 78,44 88,38 38,38" fill="${c}"/>
    <polygon points="28,44 78,44 88,38 38,38" fill="rgba(0,0,0,0.08)"/>
    <rect x="28" y="44" width="50" height="18" rx="1" fill="${c}"/>
    <polygon points="78,44 88,38 88,56 78,62" fill="${c}"/>
    <polygon points="78,44 88,38 88,56 78,62" fill="rgba(0,0,0,0.28)"/>
    <polygon points="18,62 78,62 88,56 28,56" fill="${c}"/>
    <polygon points="18,62 78,62 88,56 28,56" fill="rgba(0,0,0,0.08)"/>
    <rect x="18" y="62" width="60" height="18" rx="1" fill="${c}"/>
    <polygon points="78,62 88,56 88,74 78,80" fill="${c}"/>
    <polygon points="78,62 88,56 88,74 78,80" fill="rgba(0,0,0,0.28)"/>
    <line x1="18" y1="62" x2="38" y2="26" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
    <line x1="78" y1="62" x2="78" y2="26" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
    <line x1="18" y1="62" x2="78" y2="62" stroke="white" stroke-width="0.8" opacity="0.14"/>
    <line x1="28" y1="44" x2="78" y2="44" stroke="white" stroke-width="0.8" opacity="0.12"/>
    <line x1="38" y1="26" x2="78" y2="26" stroke="white" stroke-width="0.8" opacity="0.1"/>
  </svg>`;
}

/* ── Superficies 3D (tiles isométricos) ── */

function svgArena() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="83" rx="38" ry="5" fill="rgba(0,0,0,0.1)"/>
    <polygon points="16,44 50,62 50,80 16,62" fill="#EAB308"/>
    <polygon points="16,44 50,62 50,80 16,62" fill="rgba(0,0,0,0.22)"/>
    <polygon points="84,44 50,62 50,80 84,62" fill="#EAB308"/>
    <polygon points="84,44 50,62 50,80 84,62" fill="rgba(0,0,0,0.38)"/>
    <polygon points="16,44 50,26 84,44 50,62" fill="#EAB308"/>
    <circle cx="35" cy="42" r="2.5" fill="#FEF08A" opacity="0.7"/>
    <circle cx="50" cy="34" r="3" fill="#FEF08A" opacity="0.62"/>
    <circle cx="65" cy="42" r="2.5" fill="#FEF08A" opacity="0.7"/>
    <circle cx="42" cy="50" r="2.2" fill="#FEF08A" opacity="0.55"/>
    <circle cx="58" cy="50" r="2.2" fill="#FEF08A" opacity="0.55"/>
    <circle cx="50" cy="44" r="1.8" fill="#FEF08A" opacity="0.5"/>
    <circle cx="40" cy="38" r="1.5" fill="rgba(0,0,0,0.12)"/>
    <circle cx="60" cy="37" r="1.5" fill="rgba(0,0,0,0.1)"/>
    <circle cx="50" cy="57" r="1.5" fill="#CA8A04" opacity="0.45"/>
    <polygon points="16,44 50,26 84,44 50,62" fill="white" opacity="0.05"/>
  </svg>`;
}

function svgCesped() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="83" rx="38" ry="5" fill="rgba(0,0,0,0.1)"/>
    <polygon points="16,44 50,62 50,80 16,62" fill="#65A30D"/>
    <polygon points="16,44 50,62 50,80 16,62" fill="rgba(0,0,0,0.22)"/>
    <polygon points="84,44 50,62 50,80 84,62" fill="#65A30D"/>
    <polygon points="84,44 50,62 50,80 84,62" fill="rgba(0,0,0,0.38)"/>
    <polygon points="16,44 50,26 84,44 50,62" fill="#65A30D"/>
    <line x1="34" y1="44" x2="32" y2="37" stroke="#84CC16" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="36" y1="44" x2="38" y2="37" stroke="#A3E635" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="43" y1="40" x2="41" y2="33" stroke="#84CC16" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="45" y1="40" x2="47" y2="33" stroke="#A3E635" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="50" y1="36" x2="48" y2="29" stroke="#84CC16" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="52" y1="36" x2="54" y2="29" stroke="#A3E635" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="57" y1="40" x2="55" y2="33" stroke="#84CC16" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="59" y1="40" x2="61" y2="33" stroke="#A3E635" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="66" y1="44" x2="64" y2="37" stroke="#84CC16" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="68" y1="44" x2="70" y2="37" stroke="#A3E635" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="40" y1="52" x2="38" y2="45" stroke="#84CC16" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="50" y1="56" x2="48" y2="49" stroke="#84CC16" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="60" y1="52" x2="58" y2="45" stroke="#84CC16" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}

function svgTierra() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="83" rx="38" ry="5" fill="rgba(0,0,0,0.1)"/>
    <polygon points="16,44 50,62 50,80 16,62" fill="#A16207"/>
    <polygon points="16,44 50,62 50,80 16,62" fill="rgba(0,0,0,0.22)"/>
    <polygon points="84,44 50,62 50,80 84,62" fill="#A16207"/>
    <polygon points="84,44 50,62 50,80 84,62" fill="rgba(0,0,0,0.38)"/>
    <polygon points="16,44 50,26 84,44 50,62" fill="#A16207"/>
    <ellipse cx="36" cy="43" rx="6" ry="3.5" fill="#92400E" opacity="0.65"/>
    <ellipse cx="52" cy="36" rx="7" ry="4" fill="#92400E" opacity="0.55"/>
    <ellipse cx="65" cy="44" rx="5" ry="3" fill="#78350F" opacity="0.55"/>
    <ellipse cx="44" cy="52" rx="6" ry="3" fill="#92400E" opacity="0.5"/>
    <ellipse cx="58" cy="53" rx="5" ry="2.5" fill="#78350F" opacity="0.45"/>
    <circle cx="42" cy="40" r="2.2" fill="#57534E" opacity="0.7"/>
    <circle cx="60" cy="39" r="1.8" fill="#57534E" opacity="0.62"/>
    <circle cx="50" cy="47" r="2" fill="#78716C" opacity="0.6"/>
    <circle cx="34" cy="50" r="1.5" fill="#57534E" opacity="0.55"/>
    <circle cx="66" cy="50" r="1.5" fill="#57534E" opacity="0.5"/>
  </svg>`;
}

function svgCemento() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="83" rx="38" ry="5" fill="rgba(0,0,0,0.1)"/>
    <polygon points="16,44 50,62 50,80 16,62" fill="#9CA3AF"/>
    <polygon points="16,44 50,62 50,80 16,62" fill="rgba(0,0,0,0.22)"/>
    <polygon points="84,44 50,62 50,80 84,62" fill="#9CA3AF"/>
    <polygon points="84,44 50,62 50,80 84,62" fill="rgba(0,0,0,0.38)"/>
    <polygon points="16,44 50,26 84,44 50,62" fill="#9CA3AF"/>
    <line x1="33" y1="35" x2="67" y2="35" stroke="rgba(0,0,0,0.25)" stroke-width="0.9"/>
    <line x1="16" y1="44" x2="84" y2="44" stroke="rgba(0,0,0,0.22)" stroke-width="0.9"/>
    <line x1="33" y1="53" x2="67" y2="53" stroke="rgba(0,0,0,0.22)" stroke-width="0.9"/>
    <line x1="33" y1="35" x2="33" y2="53" stroke="rgba(0,0,0,0.22)" stroke-width="0.9"/>
    <line x1="50" y1="26" x2="50" y2="62" stroke="rgba(0,0,0,0.2)" stroke-width="0.9"/>
    <line x1="67" y1="35" x2="67" y2="53" stroke="rgba(0,0,0,0.22)" stroke-width="0.9"/>
    <circle cx="42" cy="40" r="1.5" fill="rgba(0,0,0,0.1)"/>
    <circle cx="58" cy="40" r="1.2" fill="rgba(0,0,0,0.08)"/>
    <circle cx="50" cy="56" r="1.2" fill="rgba(0,0,0,0.08)"/>
    <polygon points="16,44 50,26 84,44 50,62" fill="white" opacity="0.06"/>
  </svg>`;
}

function svgMesaDJ() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="85" rx="36" ry="4" fill="rgba(0,0,0,0.12)"/>
    <rect x="18" y="64" width="4" height="18" rx="1" fill="#2a2a2c"/>
    <rect x="78" y="64" width="4" height="18" rx="1" fill="#2a2a2c"/>
    <rect x="22" y="70" width="56" height="3" rx="1" fill="#222" opacity="0.6"/>
    <rect x="10" y="52" width="80" height="14" rx="2" fill="#1F2937"/>
    <rect x="10" y="48" width="80" height="6" rx="2" fill="#111827"/>
    <circle cx="30" cy="51" r="10" fill="#2a2a2c"/>
    <circle cx="30" cy="51" r="7.5" fill="#111"/>
    <circle cx="30" cy="51" r="5.5" fill="#1e1e1e"/>
    <circle cx="30" cy="51" r="2.5" fill="#444"/>
    <circle cx="30" cy="51" r="1" fill="#777"/>
    <circle cx="30" cy="51" r="8.5" fill="none" stroke="#333" stroke-width="0.6" opacity="0.7"/>
    <circle cx="30" cy="51" r="6.5" fill="none" stroke="#333" stroke-width="0.5" opacity="0.6"/>
    <circle cx="70" cy="51" r="10" fill="#2a2a2c"/>
    <circle cx="70" cy="51" r="7.5" fill="#111"/>
    <circle cx="70" cy="51" r="5.5" fill="#1e1e1e"/>
    <circle cx="70" cy="51" r="2.5" fill="#444"/>
    <circle cx="70" cy="51" r="1" fill="#777"/>
    <circle cx="70" cy="51" r="8.5" fill="none" stroke="#333" stroke-width="0.6" opacity="0.7"/>
    <circle cx="70" cy="51" r="6.5" fill="none" stroke="#333" stroke-width="0.5" opacity="0.6"/>
    <rect x="42" y="44" width="16" height="12" rx="1.5" fill="#1a1a1c"/>
    <rect x="44" y="46" width="5" height="4" rx="0.5" fill="#374151"/>
    <rect x="51" y="46" width="5" height="4" rx="0.5" fill="#374151"/>
    <circle cx="46.5" cy="52" r="1.8" fill="#6B7280"/>
    <circle cx="53.5" cy="52" r="1.8" fill="#6B7280"/>
    <line x1="38" y1="44" x2="33" y2="49" stroke="#555" stroke-width="1.2"/>
    <circle cx="33" cy="49" r="1.2" fill="#888"/>
    <line x1="62" y1="44" x2="67" y2="49" stroke="#555" stroke-width="1.2"/>
    <circle cx="67" cy="49" r="1.2" fill="#888"/>
    <rect x="14" y="58" width="72" height="2" rx="1" fill="#7C3AED" opacity="0.55"/>
  </svg>`;
}

function svgAgua() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="83" rx="38" ry="5" fill="rgba(0,0,0,0.1)"/>
    <polygon points="16,44 50,62 50,80 16,62" fill="#60A5FA"/>
    <polygon points="16,44 50,62 50,80 16,62" fill="rgba(0,0,0,0.22)"/>
    <polygon points="84,44 50,62 50,80 84,62" fill="#60A5FA"/>
    <polygon points="84,44 50,62 50,80 84,62" fill="rgba(0,0,0,0.38)"/>
    <polygon points="16,44 50,26 84,44 50,62" fill="#60A5FA"/>
    <path d="M 26 44 Q 31 40 36 44 Q 41 48 46 44" stroke="#93C5FD" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M 54 37 Q 59 33 64 37 Q 69 41 74 37" stroke="#93C5FD" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M 36 53 Q 41 49 46 53 Q 51 57 56 53" stroke="#93C5FD" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M 52 44 Q 57 40 62 44 Q 67 48 72 44" stroke="#93C5FD" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <circle cx="38" cy="46" r="1.8" fill="white" opacity="0.4"/>
    <circle cx="62" cy="38" r="1.5" fill="white" opacity="0.35"/>
    <circle cx="50" cy="58" r="1.2" fill="white" opacity="0.3"/>
    <polygon points="16,44 50,26 84,44 50,62" fill="white" opacity="0.06"/>
  </svg>`;
}

function svgFlecha(c) {
  const arrow = 'M 14,48 L 52,48 L 52,36 L 86,54 L 52,72 L 52,60 L 14,60 Z';
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="52" cy="84" rx="36" ry="4" fill="rgba(0,0,0,0.1)"/>
    <path d="${arrow}" fill="rgba(0,0,0,0.28)" transform="translate(4,8)"/>
    <path d="M 14,60 L 52,60 L 56,68 L 18,68 Z" fill="${c}" opacity="0.55"/>
    <path d="M 52,60 L 52,72 L 90,62 L 86,54 Z" fill="${c}" opacity="0.45"/>
    <path d="${arrow}" fill="${c}"/>
    <path d="M 16,50 L 52,50 L 52,38 L 80,54" stroke="white" stroke-width="1.2" fill="none" opacity="0.18" stroke-linecap="round"/>
    <path d="M 14,48 L 14,60 L 16,59 L 16,49 Z" fill="white" opacity="0.18"/>
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

/* ─────────────────────────────────────────────────────────
   INVENTORY PANEL — Drawer flotante con desglose por categoría
   ───────────────────────────────────────────────────────── */

import { AppState } from '../core/AppState.js';

const CATEGORY_LABELS = {
  mesa:          'Mesas',
  mesaRect:      'Mesas Rectangulares',
  mesaImperial:  'Mesas Imperiales',
  mesaCocktail:  'Mesas Cocktail',
  mesaCurva:     'Mesas Curvas',
  mesaSerpentina:'Mesas Serpentina',
  buffet:        'Buffets',
  barraLibre:    'Barras Libres',
  carpa:         'Carpas',
  carpaCuadrada: 'Carpas Cuadradas',
  carpaStar:     'Carpas Star',
  carpaPabellon: 'Carpas Pabellón',
  carpaTransparente: 'Carpas Transparentes',
  carpaBeduina:  'Carpas Beduinas',
  carpaSailcloth:'Carpas Sailcloth',
  carpaTipi:     'Carpas Tipi',
  carpaDomo:     'Carpas Domo',
  sillaCatering: 'Sillas',
  sillaLineal:   'Filas de Sillas',
  arbusto:       'Arbustos',
  arbol:         'Árboles',
  cableLuces:    'Cables con Luces',
  room:          '4 Paredes',
  poste:         'Postes',
  ambiente:      'Ambiente',
};

const CATEGORY_GROUPS = [
  { label: 'Mobiliario · Mesas',    types: ['mesa','mesaRect','mesaImperial','mesaCocktail','mesaCurva','mesaSerpentina'] },
  { label: 'Mobiliario · Sillas',   types: ['sillaCatering','sillaLineal'] },
  { label: 'Barra & Buffet',        types: ['buffet','barraLibre'] },
  { label: 'Carpas & Cobertura',    types: ['carpa','carpaCuadrada','carpaStar','carpaPabellon','carpaTransparente','carpaBeduina','carpaSailcloth','carpaTipi','carpaDomo'] },
  { label: 'Estructuras',           types: ['room','poste'] },
  { label: 'Decoración & Ambiente', types: ['arbusto','arbol','cableLuces','ambiente'] },
];

function getItemLabel(item) {
  if (item.type === 'mesa') {
    if (item.subtype === 'presi') return `Presidencial ${item.dims.length}×${item.dims.width}m`;
    return `Mesa Ø ${item.dims.diameter?.toFixed(1) ?? '?'}m`;
  }
  if (item.type === 'mesaRect')      return `Rect. ${item.dims.length}×${item.dims.width}m`;
  if (item.type === 'mesaImperial')  return `Imperial ${item.dims.length}×${item.dims.width}m`;
  if (item.type === 'mesaCocktail')  return `Cocktail Ø${item.dims.diameter}m H${item.dims.height}m`;
  if (item.type === 'mesaCurva')     return `Curva R${item.dims.radioInt}m ${item.dims.anguloDeg}°`;
  if (item.type === 'mesaSerpentina')return `Serpentina R${item.dims.radioInt}m`;
  if (item.type === 'buffet')        return `Buffet ${item.dims.length}m · ${item.subtype || ''}`;
  if (item.type === 'barraLibre')    return `Barra ${item.dims.length}m · ${item.cubiteras ?? 1} cub.`;
  if (item.type === 'sillaCatering') return `Silla ${item.subtype}`;
  if (item.type === 'sillaLineal')   return `Lineal ${item.count} × ${item.subtype}`;
  if (item.type === 'carpa')         return `Carpa ${item.dims.length}×${item.dims.width}m`;
  if (item.type.startsWith('carpa')) return `${CATEGORY_LABELS[item.type] || item.type} ${item.dims.size ?? item.dims.length ?? '?'}m`;
  if (item.type === 'arbusto')       return `Arbusto Ø${item.dims.width}m`;
  if (item.type === 'arbol')         return `Árbol H${item.dims.height}m`;
  if (item.type === 'cableLuces')    return `Cable ${item.count} luces`;
  if (item.type === 'room')          return `4 Paredes ${item.dims.length}×${item.dims.width}m`;
  if (item.type === 'poste')         return `Poste H${item.dims.height}m`;
  if (item.type === 'ambiente')      return `${item.subtype === 'alfombra' ? 'Alfombra' : item.subtype === 'planta' ? 'Planta' : 'Spot'} ${item.subtype === 'alfombra' ? item.dims.length+'×'+item.dims.width+'m' : 'H'+item.dims.height+'m'}`;
  return item.type;
}

function buildInventory() {
  // Agrupar items por label (misma descripción = misma línea)
  const lines = {};
  AppState.items.forEach(item => {
    const key = getItemLabel(item);
    if (!lines[key]) {
      lines[key] = { label: key, type: item.type, count: 0, pax: 0, price: '' };
    }
    lines[key].count++;
    lines[key].pax += (item.chairs || 0);
  });
  return lines;
}

export function refreshInventory() {
  const list = document.getElementById('inventory-list');
  if (!list) return;

  const lines = buildInventory();
  let totalPax = 0, totalItems = 0;

  // Agrupar por categoría
  let html = '';
  CATEGORY_GROUPS.forEach(group => {
    const groupLines = Object.values(lines).filter(l => group.types.includes(l.type));
    if (groupLines.length === 0) return;

    html += `
      <div>
        <div class="mono text-[9px] tracking-widest uppercase mb-2 pb-1 border-b border-black/10" style="color:var(--muted)">${group.label}</div>
        <div class="space-y-1">
    `;

    groupLines.forEach(line => {
      totalPax += line.pax;
      totalItems += line.count;
      html += `
        <div class="flex items-start justify-between gap-2 text-[11px]">
          <div class="flex items-start gap-2 flex-1 min-w-0">
            <span class="mono font-semibold shrink-0" style="min-width:20px">${line.count}×</span>
            <span class="leading-tight">${line.label}</span>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            ${line.pax > 0 ? `<span class="mono text-[10px]" style="color:var(--muted)">${line.pax}p</span>` : '<span></span>'}
            <span class="mono text-[10px] w-16 text-right" style="color:var(--muted)">${line.price || '—'}</span>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
  });

  if (html === '') {
    html = `<div class="text-center py-8 mono text-[11px]" style="color:var(--muted)">Sin elementos en la escena</div>`;
  }

  list.innerHTML = html;
  document.getElementById('inv-total-pax').textContent   = totalPax;
  document.getElementById('inv-total-items').textContent = totalItems;
  document.getElementById('inv-total-price').textContent = '—';
}

export function getInventorySummaryText() {
  const lines = buildInventory();
  const eventName = document.getElementById('inventory-event-name')?.value || 'Evento';
  let text = `INVENTARIO · ${eventName.toUpperCase()}\n${'─'.repeat(40)}\n`;

  CATEGORY_GROUPS.forEach(group => {
    const groupLines = Object.values(lines).filter(l => group.types.includes(l.type));
    if (groupLines.length === 0) return;
    text += `\n${group.label.toUpperCase()}\n`;
    groupLines.forEach(l => {
      text += `  ${l.count}× ${l.label}${l.pax > 0 ? `  (${l.pax} pax)` : ''}  ${l.price || ''}\n`;
    });
  });

  const totalPax   = AppState.items.reduce((s, i) => s + (i.chairs || 0), 0);
  const totalItems = AppState.items.length;
  text += `\n${'─'.repeat(40)}\nTotal elementos: ${totalItems}\nTotal PAX: ${totalPax}\n`;
  return text;
}

export const InventoryPanel = { refresh: refreshInventory, getSummaryText: getInventorySummaryText };
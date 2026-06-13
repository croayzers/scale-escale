export const INVENTORY_GROUPS = [
  {
    label: 'Mesas',
    types: ['mesa', 'mesaRect', 'mesaImperial', 'mesaCocktail', 'mesaCurva', 'mesaSerpentina']
  },
  {
    label: 'Sillas',
    types: ['sillaCatering', 'sillaLineal', '_sillaMesa']
  },
  {
    label: 'Barra y buffet',
    types: ['buffet', 'barraLibre']
  },
  {
    label: 'Carpas',
    types: [
      'carpa',
      'carpaCuadrada',
      'carpaStar',
      'carpaPabellon',
      'carpaTransparente',
      'carpaBeduina',
      'carpaSailcloth',
      'carpaTipi',
      'carpaDomo'
    ]
  }
];

const EXCLUDED_TYPES = new Set(['room', 'poste', 'arbusto', 'arbol', 'cableLuces', 'ambiente']);

const MESA_TYPES = new Set(['mesa', 'mesaRect', 'mesaImperial', 'mesaCocktail', 'mesaCurva', 'mesaSerpentina']);

export function isInventoryTracked(itemOrType) {
  const type = typeof itemOrType === 'string' ? itemOrType : itemOrType?.type;
  return Boolean(type) && !EXCLUDED_TYPES.has(type);
}

export function getInventoryLabel(item) {
  if (item.type === 'mesa') {
    if (item.subtype === 'presi') return `Presidencial ${item.dims.length}x${item.dims.width}m`;
    return `Mesa ${item.subtype} Ø${item.dims.diameter?.toFixed(1) ?? '?'}m`;
  }
  if (item.type === 'mesaRect') return `Rect. ${item.dims.length}x${item.dims.width}m`;
  if (item.type === 'mesaImperial') return `Imperial ${item.dims.length}x${item.dims.width}m`;
  if (item.type === 'mesaCocktail') return `Cocktail Ø${item.dims.diameter}m H${item.dims.height}m`;
  if (item.type === 'mesaCurva') return `Curva R${item.dims.radioInt}m ${item.dims.anguloDeg}°`;
  if (item.type === 'mesaSerpentina') return `Serpentina R${item.dims.radioInt}m`;
  if (item.type === 'buffet') return `Buffet ${item.dims.length}m${item.subtype ? ` · ${item.subtype}` : ''}`;
  if (item.type === 'barraLibre') {
    const paxStr = item.pax > 0 ? ` · ${item.pax} pax` : '';
    return `Barra ${item.dims.length}m · ${item.cubiteras ?? 1} cub.${paxStr}`;
  }
  if (item.type === 'sillaCatering') return `Silla ${item.subtype}`;
  if (item.type === 'sillaLineal') return `Lineal ${item.count}x ${item.subtype}`;
  if (item.type === 'carpa') return `Carpa ${item.dims.length}x${item.dims.width}m`;
  if (item.type.startsWith('carpa')) {
    return `${item.type.replace('carpa', 'Carpa ')} ${item.dims.size ?? item.dims.length ?? item.dims.diameter ?? '?'}m`;
  }
  return item.type;
}

export function buildInventoryLines(items) {
  const lines = new Map();
  let totalSillasMesa = 0;

  items.filter(isInventoryTracked).forEach(item => {
    const key = getInventoryLabel(item);
    const line = lines.get(key) || { label: key, type: item.type, count: 0, pax: 0 };
    line.count += 1;
    line.pax += (item.chairs || 0) + (item.type === 'barraLibre' ? (item.pax || 0) : 0);
    lines.set(key, line);

    // Acumular sillas de mesas como material separado
    if (MESA_TYPES.has(item.type) && item.chairs > 0) {
      totalSillasMesa += item.chairs;
    }
  });

  // Línea virtual de sillas de mesa (material a presupuestar)
  if (totalSillasMesa > 0) {
    lines.set('_sillaMesa', {
      label: 'Silla de mesa',
      type: '_sillaMesa',
      count: totalSillasMesa,
      pax: 0,
    });
  }

  return [...lines.values()];
}

export function groupInventoryLines(items) {
  const lines = buildInventoryLines(items);
  return INVENTORY_GROUPS
    .map(group => ({
      ...group,
      lines: lines.filter(line => group.types.includes(line.type))
    }))
    .filter(group => group.lines.length > 0);
}

export function getInventoryTotalItems(items) {
  return items.filter(isInventoryTracked).length;
}

export function getInventoryTotalPax(items) {
  return items
    .filter(isInventoryTracked)
    .reduce((sum, item) => sum + (item.chairs || 0) + (item.type === 'barraLibre' ? (item.pax || 0) : 0), 0);
}

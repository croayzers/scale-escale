import { CATEGORY_KEYS } from './CatalogCategories.js';
import { deepClone, uniqueById } from './SchemaUtils.js';

function rectItem(id, name, category, {
  schemaId = 'prop.generic-rect',
  type = 'schemaProp',
  width = 1.2,
  length = 1.2,
  height = 1.2,
  color = '#B6B1A9',
  icon = 'box',
  labelText = '',
  ...rest
} = {}) {
  return {
    id,
    name,
    category,
    type,
    schemaId,
    dims: { width, length, height },
    color,
    icon,
    labelText,
    defaultRotation: 0,
    ...rest
  };
}

function roundItem(id, name, category, {
  schemaId = 'prop.generic-round',
  type = 'schemaProp',
  diameter = 1.4,
  height = 0.9,
  color = '#B6B1A9',
  icon = 'circle',
  labelText = '',
  ...rest
} = {}) {
  return {
    id,
    name,
    category,
    type,
    schemaId,
    dims: { diameter, height },
    color,
    icon,
    labelText,
    defaultRotation: 0,
    ...rest
  };
}

function surfaceItem(id, name, category, {
  width = 4,
  length = 4,
  color = '#6F8E57',
  borderColor = '#2F5A29',
  icon = 'map',
  labelText = '',
  ...rest
} = {}) {
  return {
    id,
    name,
    category,
    type: 'schemaSurface',
    schemaId: 'surface.generic',
    dims: { width, length, height: 0.1 },
    color,
    borderColor,
    icon,
    labelText,
    defaultRotation: 0,
    ...rest
  };
}

function personItem(id, name, {
  seated = false,
  color = '#2C2C31',
  accentColor = '#D9D4CC',
  icon = 'user-round'
} = {}) {
  return {
    id,
    name,
    category: 'staff',
    type: 'schemaPerson',
    schemaId: 'person.generic',
    dims: { width: seated ? 0.65 : 0.55, length: seated ? 0.75 : 0.55, height: seated ? 1.3 : 1.75 },
    color,
    accentColor,
    icon,
    labelText: name,
    defaultRotation: 0
  };
}

function lightItem(id, name, {
  height = 2.5,
  color = '#111827',
  lightColor = '#FFE8A3',
  icon = 'lamp-floor',
  category = 'lighting'
} = {}) {
  return {
    id,
    name,
    category,
    type: 'schemaLight',
    schemaId: 'lighting.generic',
    dims: { width: 0.6, length: 0.6, height },
    color,
    lightColor,
    icon,
    labelText: '',
    defaultRotation: 0
  };
}

function arrowItem(id, name, rotationDeg) {
  return {
    id,
    name,
    category: 'ambient',
    type: 'schemaArrow',
    schemaId: 'arrow.2d',
    dims: { width: 1, length: 2, height: 0.05 },
    color: '#111827',
    icon: 'arrow-right',
    labelText: '',
    defaultRotation: rotationDeg
  };
}

function sofaItem(id, name, seats) {
  return {
    id,
    name,
    category: 'chairs',
    type: 'schemaSofa',
    schemaId: 'seat.sofa',
    dims: { width: 0.7 + seats * 0.55, length: 0.92, height: 0.82 },
    seats,
    color: '#CFC7BC',
    accentColor: '#8B5E3C',
    icon: 'sofa',
    defaultRotation: 0
  };
}

function stageItem(id, name, { width = 4, length = 6, height = 0.8, icon = 'gallery-horizontal-end', ...rest } = {}) {
  return {
    id,
    name,
    category: 'scenography',
    type: 'schemaStage',
    schemaId: 'stage.platform',
    dims: { width, length, height },
    color: '#27272A',
    labelText: name,
    icon,
    defaultRotation: 0,
    ...rest
  };
}

const SCHEMA_CATALOG = {
  chairs: [
    {
      id: 'silla_napoleon',
      name: 'Estilo Napoleon',
      category: 'chairs',
      type: 'sillaCatering',
      schemaId: 'chair.catering',
      subtype: 'napoleon',
      dims: { width: 0.42, depth: 0.44, seatHeight: 0.46, totalHeight: 0.93 },
      color: '#C7A25F',
      chairs: 1,
      icon: 'armchair',
      defaultRotation: 0
    },
    sofaItem('sofa_1_plaza', 'Sofa 1 plaza', 1),
    sofaItem('sofa_2_plazas', 'Sofa 2 plazas', 2),
    sofaItem('sofa_3_plazas', 'Sofa 3 plazas', 3),
    sofaItem('sofa_4_plazas', 'Sofa 4 plazas', 4)
  ],
  scenography: [
    stageItem('tarima_recta', 'Tarima recta', { width: 3, length: 2, height: 0.35, icon: 'square-stack' }),
    rectItem('tarima_curva', 'Tarima curva', 'scenography', {
      width: 2.4,
      length: 1.4,
      height: 0.35,
      color: '#44403C',
      icon: 'circle',
      assetProfile: 'curvedPlatform',
      display: { topKind: 'arch' }
    }),
    rectItem('backstage', 'Backstage', 'scenography', { width: 4, length: 6, height: 2.6, color: '#1F2937', icon: 'curtain' }),
    rectItem('truss_cuadrado', 'Truss cuadrado', 'scenography', { width: 0.4, length: 4, height: 4, color: '#9CA3AF', icon: 'square-dashed' }),
    rectItem('truss_triangular', 'Truss triangular', 'scenography', { width: 0.5, length: 4, height: 4, color: '#9CA3AF', icon: 'triangle' }),
    rectItem('pantalla_led', 'Pantalla LED', 'scenography', { width: 3.5, length: 0.25, height: 2.2, color: '#111827', icon: 'monitor-play' }),
    rectItem('pantalla_proyeccion', 'Pantalla proyeccion', 'scenography', { width: 4, length: 0.18, height: 2.5, color: '#F8FAFC', icon: 'projector' }),
    rectItem('totem_publicitario', 'Totem publicitario', 'scenography', { width: 0.8, length: 0.4, height: 2.4, color: '#E5E7EB', icon: 'badge-info' }),
    rectItem('podium', 'Podium', 'scenography', { width: 0.7, length: 0.7, height: 1.15, color: '#D4C89A', icon: 'presentation' }),
    rectItem('pasarela', 'Pasarela', 'scenography', { width: 1.6, length: 8, height: 0.25, color: '#4B5563', icon: 'move-horizontal' }),
    rectItem('cabina_tecnica', 'Cabina tecnica', 'scenography', { width: 2.4, length: 2.4, height: 2.2, color: '#374151', icon: 'cpu' }),
    rectItem('cabina_traduccion', 'Cabina traduccion', 'scenography', { width: 2.4, length: 2, height: 2.2, color: '#D1D5DB', icon: 'languages' }),
    rectItem('mesa_dj', 'Mesa DJ', 'scenography', { width: 0.9, length: 2.2, height: 1.05, color: '#111827', icon: 'disc-3' }),
    rectItem('altavoz_grande', 'Altavoz grande', 'scenography', { width: 0.7, length: 0.7, height: 1.6, color: '#111827', icon: 'speaker' }),
    rectItem('microfono_pie', 'Microfono con pie', 'scenography', { width: 0.35, length: 0.35, height: 1.6, color: '#0F172A', icon: 'mic-2' }),
    rectItem('bateria', 'Bateria', 'scenography', { width: 1.8, length: 2.2, height: 1.2, color: '#991B1B', icon: 'drum' }),
    rectItem('musica_stand', 'Atril musica', 'scenography', { width: 0.5, length: 0.5, height: 1.4, color: '#7C3AED', icon: 'music-4' }),
    surfaceItem('alfombra_escenario', 'Alfombra escenario', 'scenography', { width: 3, length: 4, color: '#7C2D12', borderColor: '#D4AF37', icon: 'carpet' }),
  ],
  structures: [
    surfaceItem('carretera_base_350', 'Carretera 3,50m base', 'structures', { width: 3.5, length: 12, color: '#4B5563', borderColor: '#9CA3AF', icon: 'road' }),
    rectItem('valla_trafico', 'Valla trafico', 'structures', { width: 0.3, length: 2.5, height: 1, color: '#F97316', icon: 'fence' }),
    rectItem('valla_concierto', 'Valla concierto', 'structures', { width: 0.35, length: 2.5, height: 1.15, color: '#6B7280', icon: 'fence' }),
    rectItem('valla_gris', 'Valla gris 2x1x1', 'structures', { width: 1, length: 2, height: 1, color: '#9CA3AF', icon: 'fence' }),
    lightItem('farola_carretera_12m', 'Farola carretera 12m', { height: 12, color: '#6B7280', category: 'structures' }),
    lightItem('farola_ciudad_6m', 'Farola ciudad 6m', { height: 6, color: '#4B5563', category: 'structures' }),
    roundItem('rotonda_carretera', 'Rotonda carretera', 'structures', { diameter: 8, height: 0.2, color: '#6B7280', icon: 'circle-dot' }),
    rectItem('columna_romana', 'Columna romana', 'structures', { width: 0.8, length: 0.8, height: 3.2, color: '#E5E7EB', icon: 'columns-3' }),
    rectItem('columna_simple', 'Columna', 'structures', { width: 0.5, length: 0.5, height: 3, color: '#D6D3D1', icon: 'columns-3' }),
    stageItem('escenario_principal', 'Escenario', { width: 6, length: 10, height: 1, category: 'structures' }),
    rectItem('escalera', 'Escalera', 'structures', { width: 1.4, length: 2.2, height: 1.2, color: '#4B5563', icon: 'stairs' }),
    rectItem('contenedor_casa', 'Contenedores / casa', 'structures', { width: 2.6, length: 6, height: 2.6, color: '#94A3B8', icon: 'container' }),
    surfaceItem('agua_piscina', 'Agua / piscina', 'structures', { width: 4, length: 8, color: '#60A5FA', borderColor: '#1D4ED8', icon: 'waves' })
  ],
  ambient: [
    roundItem('fuente_ambiente', 'Fuente', 'ambient', { diameter: 2.6, height: 1.4, color: '#CBD5E1', icon: 'droplets' }),
    surfaceItem('cesped', 'Cesped', 'ambient', { width: 4, length: 4, color: '#65A30D', borderColor: '#3F6212', icon: 'trees' }),
    surfaceItem('tierra', 'Tierra', 'ambient', { width: 4, length: 4, color: '#A16207', borderColor: '#713F12', icon: 'mountain' }),
    surfaceItem('arena', 'Arena', 'ambient', { width: 4, length: 4, color: '#EAB308', borderColor: '#CA8A04', icon: 'sun-medium' }),
    surfaceItem('cemento', 'Cemento', 'ambient', { width: 4, length: 4, color: '#9CA3AF', borderColor: '#6B7280', icon: 'square' }),
    rectItem('coche', 'Coche', 'ambient', { width: 1.8, length: 4.2, height: 1.5, color: '#64748B', icon: 'car' }),
    rectItem('camion', 'Camion', 'ambient', { width: 2.5, length: 8, height: 3.2, color: '#475569', icon: 'truck' }),
    rectItem('moto', 'Moto', 'ambient', { width: 0.8, length: 2.2, height: 1.2, color: '#111827', icon: 'bike' }),
    rectItem('avioneta', 'Avioneta', 'ambient', { width: 8, length: 7.5, height: 2.6, color: '#E5E7EB', icon: 'plane' }),
    rectItem('helicoptero', 'Helicoptero', 'ambient', { width: 2.4, length: 7, height: 2.8, color: '#334155', icon: 'helicopter' }),
    rectItem('barco', 'Barco', 'ambient', { width: 3, length: 8, height: 2.8, color: '#1D4ED8', icon: 'ship' }),
    arrowItem('flecha_arriba', 'Flecha arriba', 90),
    arrowItem('flecha_abajo', 'Flecha abajo', -90),
    arrowItem('flecha_derecha', 'Flecha derecha', 0),
    arrowItem('flecha_izquierda', 'Flecha izquierda', 180),
  ],
  services: [
    rectItem('bano_portatil', 'Bano portatil', 'services', { width: 1.1, length: 1.2, height: 2.2, color: '#1D4ED8', icon: 'bath' }),
    rectItem('lavamanos_portatil', 'Lavamanos portatil', 'services', { width: 0.8, length: 0.7, height: 1.1, color: '#E5E7EB', icon: 'droplets' }),
    rectItem('generador_electrico', 'Generador electrico', 'services', { width: 1.2, length: 2.4, height: 1.6, color: '#F59E0B', icon: 'battery-charging' }),
    rectItem('cuadro_electrico', 'Cuadro electrico', 'services', { width: 0.6, length: 0.35, height: 1.2, color: '#64748B', icon: 'circuit-board' }),
    rectItem('extintor', 'Extintor', 'services', { width: 0.3, length: 0.3, height: 0.7, color: '#DC2626', icon: 'fire-extinguisher' }),
    rectItem('punto_reciclaje', 'Punto reciclaje', 'services', { width: 1.4, length: 0.8, height: 1.3, color: '#16A34A', icon: 'recycle' }),
    rectItem('contenedor_basura', 'Contenedor basura', 'services', { width: 0.8, length: 0.8, height: 1.1, color: '#4B5563', icon: 'trash-2' }),
    surfaceItem('zona_fumadores', 'Zona fumadores', 'services', { width: 2.5, length: 2.5, color: '#B45309', borderColor: '#78350F', icon: 'cigarette' }),
    rectItem('senal_salida', 'Senal salida', 'services', { width: 0.1, length: 1.2, height: 0.5, color: '#16A34A', icon: 'log-out' }),
    rectItem('senal_emergencia', 'Senal emergencia', 'services', { width: 0.1, length: 1.2, height: 0.5, color: '#EF4444', icon: 'triangle-alert' }),
    rectItem('vallado_tecnico', 'Vallado tecnico', 'services', { width: 0.35, length: 2.5, height: 1.2, color: '#6B7280', icon: 'fence' }),
    rectItem('punto_informacion', 'Punto informacion', 'services', { width: 1.2, length: 1.2, height: 2.2, color: '#0EA5E9', icon: 'info' })
  ],
  staff: [
    personItem('camarero', 'Camarero', { color: '#111827', accentColor: '#F5F3EE' }),
    personItem('cocinero', 'Cocinero', { color: '#FFFFFF', accentColor: '#111827' }),
    personItem('dj_staff', 'DJ', { color: '#7C3AED', accentColor: '#111827' }),
    personItem('musico_staff', 'Musico', { color: '#1E293B', accentColor: '#D4AF37' }),
    personItem('seguridad', 'Seguridad', { color: '#0F172A', accentColor: '#FACC15' }),
    personItem('recepcionista', 'Recepcionista', { color: '#CBD5E1', accentColor: '#0F172A' }),
    personItem('fotografo', 'Fotografo', { color: '#4B5563', accentColor: '#111827' }),
    personItem('invitado_sentado', 'Invitado sentado', { seated: true, color: '#334155', accentColor: '#D9D4CC' }),
    personItem('invitado_pie', 'Invitado de pie', { color: '#475569', accentColor: '#E2E8F0' }),
    personItem('coordinador', 'Coordinador', { color: '#7C2D12', accentColor: '#F8FAFC' }),
    personItem('azafata', 'Azafata', { color: '#BE185D', accentColor: '#F8FAFC' }),
    personItem('tecnico_sonido', 'Tecnico sonido', { color: '#1F2937', accentColor: '#38BDF8' })
  ],
  hospitality: [
    rectItem('barra_recta', 'Barra recta', 'hospitality', { width: 0.8, length: 3.2, height: 1.05, color: '#1F2937', icon: 'glass-water' }),
    roundItem('barra_curva', 'Barra curva', 'hospitality', { diameter: 3.2, height: 1.05, color: '#1F2937', icon: 'glass-water' }),
    rectItem('nevera_industrial', 'Nevera industrial', 'hospitality', { width: 0.9, length: 1.4, height: 2.1, color: '#CBD5E1', icon: 'refrigerator' }),
    rectItem('botellero', 'Botellero', 'hospitality', { width: 0.5, length: 1.2, height: 1.8, color: '#475569', icon: 'wine' }),
    rectItem('cafetera_industrial', 'Cafetera industrial', 'hospitality', { width: 0.6, length: 0.9, height: 0.9, color: '#334155', icon: 'coffee' }),
    rectItem('carro_servicio', 'Carro de servicio', 'hospitality', { width: 0.7, length: 1.1, height: 0.95, color: '#9CA3AF', icon: 'shopping-cart' }),
    {
      id: 'mesa_cocktail_hosteleria',
      name: 'Mesa cocktail alta',
      category: 'hospitality',
      type: 'mesaCocktail',
      dims: { diameter: 0.8, height: 1.1 },
      color: '#FFFFFF',
      chairs: 0,
      icon: 'circle-dot',
      defaultRotation: 0
    },
    rectItem('taburete_alto', 'Taburete alto', 'hospitality', { width: 0.4, length: 0.4, height: 0.8, color: '#6B7280', icon: 'armchair' }),
    rectItem('dispensador_bebidas', 'Dispensador bebidas', 'hospitality', { width: 0.45, length: 0.45, height: 0.75, color: '#F59E0B', icon: 'glass-water' }),
    rectItem('vitrina_refrigerada', 'Vitrina refrigerada', 'hospitality', { width: 0.9, length: 1.8, height: 1.4, color: '#E2E8F0', icon: 'monitor-smartphone' }),
    roundItem('cubitera', 'Cubitera', 'hospitality', { diameter: 0.55, height: 0.55, color: '#CBD5E1', icon: 'glass-water' }),
    rectItem('carrito_buffet', 'Carrito buffet', 'hospitality', { width: 0.8, length: 1.5, height: 1.2, color: '#D6D3D1', icon: 'shopping-cart' })
  ],
  decoration: [
    rectItem('biombo_decorativo', 'Biombo decorativo', 'decoration', { width: 0.12, length: 1.8, height: 2.1, color: '#CFC7BC', icon: 'panel-left' }),
    rectItem('panel_floral', 'Panel floral', 'decoration', { width: 0.3, length: 2.4, height: 2.4, color: '#16A34A', icon: 'flower-2' }),
    rectItem('panel_led_deco', 'Panel LED', 'decoration', { width: 0.2, length: 2.2, height: 2.6, color: '#111827', icon: 'monitor-play' }),
    rectItem('photocall', 'Photocall', 'decoration', { width: 0.2, length: 3.5, height: 2.6, color: '#F8FAFC', icon: 'image' }),
    rectItem('arco_decorativo', 'Arco decorativo', 'decoration', { width: 0.5, length: 2.8, height: 2.6, color: '#D4AF37', icon: 'archway' }),
    roundItem('jarron_alto', 'Jarron alto', 'decoration', { diameter: 0.45, height: 1.2, color: '#E5E7EB', icon: 'vase' }),
    roundItem('centro_mesa', 'Centro de mesa', 'decoration', { diameter: 0.35, height: 0.45, color: '#F472B6', icon: 'flower-2' }),
    roundItem('candelabro', 'Candelabro', 'decoration', { diameter: 0.35, height: 0.65, color: '#D4AF37', icon: 'candlestick-big' }),
    rectItem('letras_gigantes', 'Letras gigantes', 'decoration', { width: 0.4, length: 3.2, height: 1.8, color: '#F8FAFC', icon: 'type' }),
    rectItem('neon_personalizado', 'Neon personalizado', 'decoration', { width: 0.08, length: 2, height: 0.8, color: '#22D3EE', icon: 'sparkles' }),
    roundItem('peana_decorativa', 'Peana decorativa', 'decoration', { diameter: 0.5, height: 1.1, color: '#D1D5DB', icon: 'gallery-vertical-end' }),
    rectItem('letrero_texto', 'Letrero / Texto libre', 'decoration', { width: 0.05, length: 2.4, height: 1, color: '#F8FAFC', icon: 'type' }),
    surfaceItem('alfombra_deco', 'Alfombra decorativa', 'decoration', { width: 2, length: 3, color: '#7C2D12', borderColor: '#D4AF37', icon: 'carpet' }),
    {
      id: 'maceton_decorativo',
      name: 'Macetón',
      category: 'decoration',
      type: 'ambiente',
      subtype: 'planta',
      dims: { height: 1.55 },
      color: '#2f6a3f',
      potColor: '#7a4a28',
      icon: 'flower-2',
      chairs: 0,
      defaultRotation: 0
    },
    roundItem('maceta_deco', 'Maceta', 'decoration', { diameter: 0.8, height: 1, color: '#8B5E3C', icon: 'flower-2' }),
    {
      id: 'texto_2d',
      name: 'Texto en plano',
      category: 'decoration',
      type: 'text2d',
      schemaId: null,
      dims: { height: 0.6 },
      color: '#111827',
      icon: 'type',
      labelText: 'Texto',
      defaultRotation: 0
    },
  ],
  lighting: [
    lightItem('foco_led', 'Foco LED', { height: 0.9, icon: 'lamp-floor' }),
    lightItem('torre_iluminacion', 'Torre de iluminacion', { height: 5.5, icon: 'tower-control' }),
    lightItem('guirnalda_luces', 'Guirnalda luces', { height: 3, icon: 'lights' }),
    lightItem('luz_ambiental_rgb', 'Luz ambiental RGB', { height: 1.2, lightColor: '#A855F7', icon: 'palette' }),
    lightItem('foco_escenario', 'Foco escenario', { height: 2.2, lightColor: '#FFE8A3', icon: 'spotlight' }),
    lightItem('luz_calida_decorativa', 'Luz calida decorativa', { height: 1.4, lightColor: '#FCD34D', icon: 'lamp' }),
    lightItem('cabeza_movil', 'Cabeza movil', { height: 1.6, lightColor: '#93C5FD', icon: 'move-3d' }),
    lightItem('laser_evento', 'Laser evento', { height: 1.2, lightColor: '#22C55E', icon: 'scan-line' }),
    lightItem('proyector_logo', 'Proyector logo', { height: 1.6, lightColor: '#F8FAFC', icon: 'projector' }),
    lightItem('baliza_exterior', 'Baliza exterior', { height: 0.8, lightColor: '#F59E0B', icon: 'land-plot' }),
    lightItem('lampara_pie', 'Lampara de pie', { height: 1.8, lightColor: '#FEF9C3', icon: 'lamp-desk' }),
    lightItem('cortina_luces', 'Cortina de luces', { height: 2.8, lightColor: '#FCD34D', icon: 'sparkles' }),
  ]
};

function ensureCatalogShape(data) {
  const next = { version: data?.version || 1 };
  CATEGORY_KEYS.forEach(key => {
    next[key] = Array.isArray(data?.[key]) ? deepClone(data[key]) : [];
  });
  if (Array.isArray(data?.freebar) && !next.hospitality.length) {
    next.hospitality = deepClone(data.freebar);
  }
  return next;
}

function decorateExistingDefinitions(data) {
  data.chairs = data.chairs.map(item => {
    if (item.type === 'sillaCatering') return { ...item, schemaId: item.schemaId || 'chair.catering' };
    if (item.type === 'sillaLineal') return { ...item, schemaId: item.schemaId || 'chair.linear' };
    return item;
  });

  data.tables = data.tables.map(item => {
    if (item.type === 'mesa' && item.subtype !== 'presi') {
      return { ...item, schemaId: item.schemaId || 'table.round-banquet' };
    }
    return item;
  });

  data.bars = data.bars.map(item => {
    if (item.type === 'buffet') return { ...item, schemaId: item.schemaId || 'buffet.station' };
    if (item.type === 'carritoBuf') return { ...item, schemaId: item.schemaId || 'buffet.carrito' };
    if (item.type === 'buffetCarro') return { ...item, schemaId: item.schemaId || 'buffet.cart' };
    return item;
  });
}

function moveFreeBarsToHospitality(data) {
  const moved = data.bars.filter(item => item.type === 'barraLibre' || String(item.id || '').startsWith('barra_libre_'));
  if (!moved.length) return;
  data.bars = data.bars.filter(item => !moved.includes(item));
  data.hospitality = uniqueById([
    ...data.hospitality,
    ...moved.map(item => ({ ...item, category: 'hospitality' }))
  ]);
}

const DEPRECATED_IDS = new Set([
  'mesa_serpentina', 'maceta_ambiente', 'letrero_tumbado', 'alfombra_musicos',
  'musica', 'lampara_ambiente'
]);

function removeDeprecatedDefinitions(data) {
  CATEGORY_KEYS.forEach(key => {
    data[key] = (data[key] || []).filter(item => (
      item.type !== 'mesaSerpentina'
      && !String(item.id || '').toLowerCase().includes('serpentina')
      && !DEPRECATED_IDS.has(item.id)
    ));
  });
}

function appendBlueprints(data) {
  Object.entries(SCHEMA_CATALOG).forEach(([key, items]) => {
    data[key] = uniqueById([...(data[key] || []), ...deepClone(items)]);
  });
}

export function buildCatalogData(baseData = {}) {
  const data = ensureCatalogShape(baseData);
  decorateExistingDefinitions(data);
  moveFreeBarsToHospitality(data);
  removeDeprecatedDefinitions(data);
  appendBlueprints(data);
  return data;
}

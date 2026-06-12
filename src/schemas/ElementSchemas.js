import { PARAM_CATEGORY, PARAM_LEVEL, StandardParams } from './ParamDefinitions.js';

const advancedSelect = (key, label, path, options, rest = {}) => ({
  key,
  label,
  path,
  type: 'select',
  default: options[0]?.value ?? '',
  options,
  level: PARAM_LEVEL.ADVANCED,
  category: PARAM_CATEGORY.BEHAVIOR,
  ...rest
});

export const ELEMENT_SCHEMAS = [
  {
    id: 'table.round-banquet',
    family: 'table',
    match: item => item.type === 'mesa' && item.subtype !== 'presi',
    metadata: {
      label: 'Mesa redonda',
      icon: 'circle-dot',
      category: 'tables',
      commercialTier: 'pro'
    },
    builder: { preset: 'roundTableBanquet' },
    ui: { dynamic: true, supportsAdvanced: true },
    defaults: {
      dims: { diameter: 1.8, height: 0.75 },
      color: '#DDD4C8',
      chairs: 8,
      labelText: '',
      visual: { materialPreset: 'fabric', opacity: 1, shadows: true },
      physics: { snap: true, collisions: true },
      autoChildren: {
        enabled: true,
        placement: 'around',
        offset: 0.1,
        startAngle: 0,
        childSchemaId: 'chair.catering'
      }
    },
    params: [
      StandardParams.diameter({
        default: 1.8,
        min: 0.8,
        max: 4,
        step: 0.1,
        label: 'Diametro'
      }),
      StandardParams.height({
        default: 0.75,
        min: 0.5,
        max: 1.4,
        step: 0.01
      }),
      StandardParams.rotation(),
      StandardParams.color({ default: '#DDD4C8' }),
      StandardParams.chairs({ default: 8, max: 24 }),
      StandardParams.text({ label: 'Texto mesa' }),
      StandardParams.materialPreset(),
      StandardParams.opacity(),
      StandardParams.shadow(),
      StandardParams.collisions(),
      StandardParams.snap(),
      advancedSelect('chairLayout', 'Distribucion sillas', 'autoChildren.placement', [
        { value: 'around', label: 'Circular' },
        { value: 'arc', label: 'Arco frontal' }
      ]),
      StandardParams.offset({
        key: 'chairOffset',
        label: 'Offset sillas (m)',
        path: 'autoChildren.offset',
        default: 0.1,
        min: 0,
        max: 1,
        step: 0.01,
        level: PARAM_LEVEL.BASIC,
        category: PARAM_CATEGORY.CHILDREN
      }),
      {
        key: 'chairStartAngle',
        label: 'Angulo inicial',
        path: 'autoChildren.startAngle',
        type: 'number',
        default: 0,
        min: -180,
        max: 180,
        step: 5,
        suffix: 'deg',
        level: PARAM_LEVEL.ADVANCED,
        category: PARAM_CATEGORY.CHILDREN
      },
      {
        key: 'childrenEnabled',
        label: 'Auto sillas',
        path: 'autoChildren.enabled',
        type: 'toggle',
        default: true,
        level: PARAM_LEVEL.ADVANCED,
        category: PARAM_CATEGORY.CHILDREN
      }
    ],
    children: [
      {
        key: 'chairs',
        enabledParam: 'autoChildren.enabled',
        schemaId: 'chair.catering',
        placement: 'around',
        placementParam: 'autoChildren.placement',
        countParam: 'chairs',
        offsetParam: 'autoChildren.offset',
        angleOffsetParam: 'autoChildren.startAngle',
        facing: 'outward',
        childFactory: ({ parentItem, index }) => ({
          type: 'sillaCatering',
          schemaId: parentItem.autoChildren?.childSchemaId || 'chair.catering',
          subtype: parentItem.subtype === 'napoleon' ? 'napoleon' : 'plegable',
          dims: { width: 0.44, depth: 0.44, seatHeight: 0.45, totalHeight: 0.9 },
          color: parentItem.subtype === 'napoleon' ? '#C7A25F' : '#F5F3EE',
          labelText: `S${index + 1}`,
          visual: { opacity: 1, shadows: true },
          physics: { snap: false, collisions: false }
        })
      }
    ]
  },
  {
    id: 'chair.catering',
    family: 'chair',
    match: item => item.type === 'sillaCatering',
    metadata: {
      label: 'Silla catering',
      icon: 'armchair',
      category: 'chairs'
    },
    builder: { preset: 'chairDining' },
    ui: { dynamic: true, supportsAdvanced: true },
    defaults: {
      subtype: 'plegable',
      dims: { width: 0.44, depth: 0.44, seatHeight: 0.45, totalHeight: 0.85 },
      color: '#F5F3EE',
      labelText: '',
      visual: { materialPreset: 'default', opacity: 1, shadows: true },
      physics: { snap: true, collisions: true }
    },
    params: [
      StandardParams.width({ default: 0.44, min: 0.3, max: 1, step: 0.01 }),
      {
        key: 'depth',
        path: 'dims.depth',
        type: 'number',
        label: 'Fondo',
        default: 0.44,
        min: 0.3,
        max: 1,
        step: 0.01,
        unit: 'm',
        level: PARAM_LEVEL.BASIC,
        category: PARAM_CATEGORY.SIZE
      },
      {
        key: 'seatHeight',
        path: 'dims.seatHeight',
        type: 'number',
        label: 'Asiento',
        default: 0.45,
        min: 0.3,
        max: 0.85,
        step: 0.01,
        unit: 'm',
        level: PARAM_LEVEL.BASIC,
        category: PARAM_CATEGORY.SIZE
      },
      {
        key: 'totalHeight',
        path: 'dims.totalHeight',
        type: 'number',
        label: 'Alto total',
        default: 0.85,
        min: 0.5,
        max: 1.4,
        step: 0.01,
        unit: 'm',
        level: PARAM_LEVEL.BASIC,
        category: PARAM_CATEGORY.SIZE
      },
      StandardParams.rotation(),
      StandardParams.color({ default: '#F5F3EE' }),
      StandardParams.text({ label: 'Etiqueta' }),
      {
        key: 'subtype',
        label: 'Modelo',
        path: 'subtype',
        type: 'select',
        default: 'plegable',
        options: [
          { value: 'plegable', label: 'Plegable' },
          { value: 'chiavari', label: 'Chiavari' },
          { value: 'tiffany', label: 'Tiffany' },
          { value: 'tolix', label: 'Tolix' },
          { value: 'napoleon', label: 'Napoleon' }
        ],
        level: PARAM_LEVEL.ADVANCED,
        category: PARAM_CATEGORY.BEHAVIOR
      },
      StandardParams.materialPreset(),
      StandardParams.opacity(),
      StandardParams.shadow(),
      StandardParams.snap(),
      StandardParams.collisions()
    ]
  },
  {
    id: 'chair.linear',
    family: 'chairLine',
    match: item => item.type === 'sillaLineal',
    metadata: {
      label: 'Lineal de sillas',
      icon: 'align-horizontal-space-around',
      category: 'chairs'
    },
    builder: { preset: 'chairLine' },
    ui: { dynamic: true, supportsAdvanced: true },
    defaults: {
      subtype: 'plegable',
      count: 6,
      gap: 0.5,
      chairs: 6,
      color: '#F5F3EE',
      dims: { width: 0.44, depth: 0.44, seatHeight: 0.45, totalHeight: 0.85 },
      visual: { materialPreset: 'default', opacity: 1, shadows: true },
      physics: { snap: true, collisions: true }
    },
    params: [
      {
        key: 'count',
        label: 'N sillas',
        path: 'count',
        type: 'number',
        default: 6,
        min: 2,
        max: 80,
        step: 1,
        level: PARAM_LEVEL.BASIC,
        category: PARAM_CATEGORY.LAYOUT,
        coerce: value => Math.round(value),
        onChange: ({ value }) => ({ count: Math.round(value), chairs: Math.round(value) })
      },
      {
        key: 'gap',
        label: 'Separacion',
        path: 'gap',
        type: 'number',
        unit: 'm',
        default: 0.5,
        min: 0.25,
        max: 2,
        step: 0.05,
        level: PARAM_LEVEL.BASIC,
        category: PARAM_CATEGORY.LAYOUT
      },
      StandardParams.rotation(),
      StandardParams.color({ default: '#F5F3EE' }),
      StandardParams.materialPreset(),
      StandardParams.opacity(),
      StandardParams.shadow()
    ]
  },
  {
    id: 'buffet.station',
    family: 'buffet',
    match: item => item.schemaId === 'buffet.station',
    metadata: {
      label: 'Buffet',
      icon: 'utensils-crossed',
      category: 'bars'
    },
    builder: { preset: 'buffetStation' },
    ui: { dynamic: true, supportsAdvanced: true },
    defaults: {
      dims: { length: 3.6, width: 0.8, height: 0.9 },
      color: '#DDD4C8',
      labelText: '',
      serviceStations: {
        enabled: false,
        count: 2,
        offset: 1,
        spacing: 1.4,
        side: 'rear'
      },
      visual: { materialPreset: 'fabric', opacity: 1, shadows: true },
      physics: { snap: true, collisions: true }
    },
    params: [
      StandardParams.length({ default: 3.6, min: 1, max: 12, step: 0.1 }),
      StandardParams.width({ default: 0.8, min: 0.4, max: 2, step: 0.05 }),
      StandardParams.height({ default: 0.9, min: 0.5, max: 1.6, step: 0.01 }),
      StandardParams.rotation(),
      StandardParams.color({ default: '#DDD4C8' }),
      StandardParams.text({ label: 'Rotulo buffet' }),
      {
        key: 'serviceEnabled',
        path: 'serviceStations.enabled',
        type: 'toggle',
        label: 'Mesas auxiliares',
        default: false,
        level: PARAM_LEVEL.ADVANCED,
        category: PARAM_CATEGORY.CHILDREN
      },
      {
        key: 'serviceCount',
        path: 'serviceStations.count',
        type: 'number',
        label: 'Auxiliares',
        default: 2,
        min: 1,
        max: 8,
        step: 1,
        level: PARAM_LEVEL.ADVANCED,
        category: PARAM_CATEGORY.CHILDREN,
        visibleIf: item => Boolean(item.serviceStations?.enabled)
      },
      advancedSelect('serviceSide', 'Lado auxiliares', 'serviceStations.side', [
        { value: 'rear', label: 'Trasero' },
        { value: 'left', label: 'Izquierdo' },
        { value: 'right', label: 'Derecho' },
        { value: 'both', label: 'Ambos' }
      ], {
        visibleIf: item => Boolean(item.serviceStations?.enabled),
        category: PARAM_CATEGORY.CHILDREN
      }),
      StandardParams.spacing({
        key: 'serviceSpacing',
        label: 'Separacion auxiliares',
        path: 'serviceStations.spacing',
        default: 1.4,
        min: 0.5,
        max: 4,
        step: 0.05,
        visibleIf: item => Boolean(item.serviceStations?.enabled),
        category: PARAM_CATEGORY.CHILDREN
      }),
      StandardParams.offset({
        key: 'serviceOffset',
        label: 'Offset auxiliar',
        path: 'serviceStations.offset',
        default: 1,
        min: 0.2,
        max: 4,
        step: 0.05,
        visibleIf: item => Boolean(item.serviceStations?.enabled),
        category: PARAM_CATEGORY.CHILDREN
      }),
      StandardParams.materialPreset(),
      StandardParams.opacity(),
      StandardParams.shadow()
    ],
    children: [
      {
        key: 'serviceTables',
        enabledParam: 'serviceStations.enabled',
        schemaId: 'prop.generic-rect',
        placement: 'lateral',
        countParam: 'serviceStations.count',
        spacingParam: 'serviceStations.spacing',
        offsetParam: 'serviceStations.offset',
        sideParam: 'serviceStations.side',
        childFactory: ({ index }) => ({
          type: 'schemaProp',
          schemaId: 'prop.generic-rect',
          dims: { width: 0.7, length: 1.2, height: 0.9 },
          color: '#C9C5BD',
          labelText: `Aux ${index + 1}`,
          visual: { materialPreset: 'matte', opacity: 0.95, shadows: true },
          physics: { snap: false, collisions: false }
        })
      }
    ]
  },
  {
    id: 'buffet.carrito',
    family: 'buffet',
    match: item => item.schemaId === 'buffet.carrito',
    metadata: {
      label: 'Carrito buffet',
      icon: 'shopping-cart',
      category: 'bars'
    },
    builder: { preset: 'buffetCarrito' },
    ui: { dynamic: true },
    defaults: {
      dims: { length: 1.2, width: 0.7, height: 0.9 },
      color: '#E0DDD8',
      labelText: 'Carrito',
      visual: { materialPreset: 'matte', opacity: 1, shadows: true }
    },
    params: [
      StandardParams.length({ default: 1.2, min: 0.6, max: 3, step: 0.05 }),
      StandardParams.width({ default: 0.7, min: 0.4, max: 1.5, step: 0.05 }),
      StandardParams.height({ default: 0.9, min: 0.5, max: 1.4, step: 0.01 }),
      StandardParams.rotation(),
      StandardParams.color({ default: '#E0DDD8' }),
      StandardParams.text({ label: 'Rotulo' }),
      StandardParams.opacity(),
      StandardParams.shadow()
    ]
  },
  {
    id: 'buffet.cart',
    family: 'buffet',
    match: item => item.schemaId === 'buffet.cart',
    metadata: {
      label: 'Buffet carro',
      icon: 'shopping-cart',
      category: 'bars'
    },
    builder: { preset: 'buffetCart' },
    ui: { dynamic: true },
    defaults: {
      dims: { length: 3, width: 1.5, height: 1 },
      color: '#E8E4DF',
      labelText: 'Buffet carro',
      visual: { materialPreset: 'fabric', opacity: 1, shadows: true }
    },
    params: [
      StandardParams.length({ default: 3, min: 1, max: 6, step: 0.1 }),
      StandardParams.width({ default: 1.5, min: 0.8, max: 3, step: 0.05 }),
      StandardParams.height({ default: 1.0, min: 0.6, max: 1.6, step: 0.01 }),
      StandardParams.rotation(),
      StandardParams.color({ default: '#E8E4DF' }),
      StandardParams.text({ label: 'Rotulo' }),
      StandardParams.opacity(),
      StandardParams.shadow()
    ]
  },
  {
    id: 'stage.platform',
    family: 'stage',
    match: item => item.schemaId === 'stage.platform' || item.type === 'schemaStage',
    metadata: {
      label: 'Escenario',
      icon: 'gallery-horizontal-end',
      category: 'scenography'
    },
    builder: { preset: 'stagePlatform' },
    ui: { dynamic: true, supportsAdvanced: true },
    defaults: {
      dims: { width: 4, length: 6, height: 0.8 },
      color: '#27272A',
      labelText: 'Escenario',
      stairs: {
        enabled: true,
        count: 4,
        width: 1.6,
        depth: 0.35,
        side: 'front'
      },
      visual: { materialPreset: 'matte', opacity: 1, shadows: true },
      physics: { snap: true, collisions: true }
    },
    params: [
      StandardParams.width({ default: 4, min: 1, max: 30, step: 0.1 }),
      StandardParams.length({ default: 6, min: 1, max: 40, step: 0.1 }),
      StandardParams.height({ default: 0.8, min: 0.2, max: 2.5, step: 0.05 }),
      StandardParams.rotation(),
      StandardParams.color({ default: '#27272A' }),
      StandardParams.text({ label: 'Rotulo' }),
      {
        key: 'stairsEnabled',
        path: 'stairs.enabled',
        type: 'toggle',
        label: 'Escalera auto',
        default: true,
        level: PARAM_LEVEL.ADVANCED,
        category: PARAM_CATEGORY.CHILDREN
      },
      {
        key: 'stairsCount',
        path: 'stairs.count',
        type: 'number',
        label: 'Peldanos',
        default: 4,
        min: 1,
        max: 12,
        step: 1,
        level: PARAM_LEVEL.ADVANCED,
        category: PARAM_CATEGORY.CHILDREN,
        visibleIf: item => Boolean(item.stairs?.enabled)
      },
      StandardParams.width({
        key: 'stairsWidth',
        label: 'Ancho escalera',
        path: 'stairs.width',
        default: 1.6,
        min: 0.5,
        max: 10,
        step: 0.05,
        level: PARAM_LEVEL.ADVANCED,
        category: PARAM_CATEGORY.CHILDREN,
        visibleIf: item => Boolean(item.stairs?.enabled)
      }),
      StandardParams.length({
        key: 'stairsDepth',
        label: 'Huella peldano',
        path: 'stairs.depth',
        default: 0.35,
        min: 0.15,
        max: 1.2,
        step: 0.01,
        level: PARAM_LEVEL.ADVANCED,
        category: PARAM_CATEGORY.CHILDREN,
        visibleIf: item => Boolean(item.stairs?.enabled)
      }),
      advancedSelect('stairsSide', 'Lado escalera', 'stairs.side', [
        { value: 'front', label: 'Frontal' },
        { value: 'left', label: 'Izquierdo' },
        { value: 'right', label: 'Derecho' }
      ], {
        visibleIf: item => Boolean(item.stairs?.enabled),
        category: PARAM_CATEGORY.CHILDREN
      }),
      StandardParams.materialPreset(),
      StandardParams.shadow()
    ],
    children: [
      {
        key: 'stairs',
        enabledParam: 'stairs.enabled',
        schemaId: 'prop.generic-rect',
        placement: 'stairs',
        countParam: 'stairs.count',
        sideParam: 'stairs.side',
        childFactory: ({ parentItem, index, count }) => {
          const stepHeight = (parentItem.dims?.height ?? 0.8) / count;
          const heightAtStep = stepHeight * (index + 1);
          return {
            type: 'schemaProp',
            schemaId: 'prop.generic-rect',
            dims: {
              width: parentItem.stairs?.depth ?? 0.35,
              length: parentItem.stairs?.width ?? 1.6,
              height: heightAtStep
            },
            color: '#45454B',
            labelText: '',
            visual: { materialPreset: 'matte', opacity: 1, shadows: true },
            physics: { snap: false, collisions: false },
            layout: {
              stepIndex: index,
              stepHeight,
              heightAtStep
            }
          };
        }
      }
    ]
  },
  // ── STRUCTURE ELEMENT SCHEMAS (match before generic fallback) ───────────────
  {
    id: 'structure.wall',
    family: 'structure',
    match: item => item.assetProfile === 'pared',
    metadata: { label: 'Pared', icon: 'square', category: 'structures' },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: { dims: { length: 3, width: 0.1, height: 3 }, color: '#F0EDE8', labelText: '', visual: { opacity: 1, shadows: true } },
    params: [
      StandardParams.length({ default: 3, min: 0.5, max: 30, step: 0.1 }),
      StandardParams.height({ default: 3, min: 0.5, max: 12, step: 0.1 }),
      { key: 'thickness', label: 'Grosor (m)', path: 'dims.width', type: 'number', default: 0.1, min: 0.05, max: 1, step: 0.01, level: PARAM_LEVEL.ADVANCED, category: PARAM_CATEGORY.SIZE },
      StandardParams.color({ label: 'Color' }),
      StandardParams.rotation(), StandardParams.text(), StandardParams.opacity(), StandardParams.shadow()
    ]
  },
  {
    id: 'structure.muro',
    family: 'structure',
    match: item => item.assetProfile === 'muro',
    metadata: { label: 'Muro', icon: 'rectangle-horizontal', category: 'structures' },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: { dims: { length: 8, width: 0.6, height: 5 }, color: '#4A2D1A', labelText: '', visual: { opacity: 1, shadows: true } },
    params: [
      StandardParams.length({ default: 8, min: 0.5, max: 50, step: 0.1 }),
      StandardParams.height({ default: 5, min: 0.5, max: 20, step: 0.1 }),
      { key: 'thickness', label: 'Grosor (m)', path: 'dims.width', type: 'number', default: 0.6, min: 0.1, max: 2, step: 0.05, level: PARAM_LEVEL.ADVANCED, category: PARAM_CATEGORY.SIZE },
      StandardParams.color({ label: 'Color' }),
      StandardParams.rotation(), StandardParams.text(), StandardParams.opacity(), StandardParams.shadow()
    ]
  },
  {
    id: 'structure.ceiling',
    family: 'structure',
    match: item => item.assetProfile === 'techo',
    metadata: { label: 'Techo plano', icon: 'layout-panel-top', category: 'structures' },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: { dims: { length: 3, width: 3, height: 0.1, floorHeight: 2 }, color: '#F0EDE8', labelText: '', visual: { opacity: 1, shadows: true } },
    params: [
      StandardParams.length({ default: 3, min: 0.5, max: 30, step: 0.1 }),
      StandardParams.width({ default: 3, min: 0.5, max: 30, step: 0.1 }),
      { key: 'floorHeight', label: 'Altura del suelo (m)', path: 'dims.floorHeight', type: 'number', default: 2, min: 0.5, max: 12, step: 0.1, level: PARAM_LEVEL.BASIC, category: PARAM_CATEGORY.SIZE },
      { key: 'thickness', label: 'Grosor panel (m)', path: 'dims.height', type: 'number', default: 0.1, min: 0.04, max: 0.5, step: 0.01, level: PARAM_LEVEL.ADVANCED, category: PARAM_CATEGORY.SIZE },
      StandardParams.color({ label: 'Color' }),
      StandardParams.rotation(), StandardParams.text(), StandardParams.opacity(), StandardParams.shadow()
    ]
  },
  {
    id: 'structure.wall_door',
    family: 'structure',
    match: item => item.assetProfile === 'paredPuerta',
    metadata: { label: 'Pared con puerta', icon: 'door-open', category: 'structures' },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: { dims: { length: 3, width: 0.1, height: 3, doorWidth: 1, doorHeight: 2 }, color: '#F0EDE8', labelText: '', visual: { opacity: 1, shadows: true } },
    params: [
      StandardParams.length({ default: 3, min: 1, max: 30, step: 0.1 }),
      StandardParams.height({ default: 3, min: 2, max: 12, step: 0.1 }),
      { key: 'doorWidth', label: 'Ancho puerta (m)', path: 'dims.doorWidth', type: 'number', default: 1, min: 0.5, max: 3, step: 0.05, level: PARAM_LEVEL.BASIC, category: PARAM_CATEGORY.SIZE },
      { key: 'doorHeight', label: 'Alto puerta (m)', path: 'dims.doorHeight', type: 'number', default: 2, min: 1, max: 4, step: 0.05, level: PARAM_LEVEL.BASIC, category: PARAM_CATEGORY.SIZE },
      { key: 'thickness', label: 'Grosor (m)', path: 'dims.width', type: 'number', default: 0.1, min: 0.05, max: 1, step: 0.01, level: PARAM_LEVEL.ADVANCED, category: PARAM_CATEGORY.SIZE },
      StandardParams.color({ label: 'Color pared' }),
      StandardParams.rotation(), StandardParams.opacity(), StandardParams.shadow()
    ]
  },
  {
    id: 'structure.roof1agua',
    family: 'structure',
    match: item => item.assetProfile === 'tejado1Aguas',
    metadata: { label: 'Tejado 1 agua', icon: 'triangle', category: 'structures' },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: { dims: { length: 3, width: 3, height: 1 }, color: '#F0EDE8', labelText: '', visual: { opacity: 1, shadows: true } },
    params: [
      StandardParams.length({ default: 3, min: 1, max: 30, step: 0.1 }),
      StandardParams.width({ default: 3, min: 1, max: 30, step: 0.1 }),
      { key: 'peakHeight', label: 'Altura pico (m)', path: 'dims.height', type: 'number', default: 1, min: 0.2, max: 8, step: 0.1, level: PARAM_LEVEL.BASIC, category: PARAM_CATEGORY.SIZE },
      StandardParams.color({ label: 'Color tejado' }),
      StandardParams.rotation(), StandardParams.opacity(), StandardParams.shadow()
    ]
  },
  {
    id: 'structure.roof2aguas',
    family: 'structure',
    match: item => item.assetProfile === 'tejado2Aguas',
    metadata: { label: 'Tejado 2 aguas', icon: 'chevron-up', category: 'structures' },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: { dims: { length: 3, width: 3, height: 1 }, color: '#F0EDE8', labelText: '', visual: { opacity: 1, shadows: true } },
    params: [
      StandardParams.length({ default: 3, min: 1, max: 30, step: 0.1 }),
      StandardParams.width({ default: 3, min: 1, max: 30, step: 0.1 }),
      { key: 'peakHeight', label: 'Altura pico (m)', path: 'dims.height', type: 'number', default: 1, min: 0.2, max: 8, step: 0.1, level: PARAM_LEVEL.BASIC, category: PARAM_CATEGORY.SIZE },
      StandardParams.color({ label: 'Color tejado' }),
      StandardParams.rotation(), StandardParams.opacity(), StandardParams.shadow()
    ]
  },
  {
    id: 'structure.roof4aguas',
    family: 'structure',
    match: item => item.assetProfile === 'tejado4Aguas',
    metadata: { label: 'Tejado 4 aguas', icon: 'tent', category: 'structures' },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: { dims: { length: 3, width: 3, height: 1 }, color: '#F0EDE8', labelText: '', visual: { opacity: 1, shadows: true } },
    params: [
      StandardParams.length({ default: 3, min: 1, max: 30, step: 0.1 }),
      StandardParams.width({ default: 3, min: 1, max: 30, step: 0.1 }),
      { key: 'peakHeight', label: 'Altura pico (m)', path: 'dims.height', type: 'number', default: 1, min: 0.2, max: 8, step: 0.1, level: PARAM_LEVEL.BASIC, category: PARAM_CATEGORY.SIZE },
      StandardParams.color({ label: 'Color tejado' }),
      StandardParams.rotation(), StandardParams.opacity(), StandardParams.shadow()
    ]
  },
  {
    id: 'ambient.hedge_straight',
    family: 'ambient',
    match: item => item.assetProfile === 'arbustoRecto',
    metadata: { label: 'Arbusto recto', icon: 'minus', category: 'ambient' },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: { dims: { length: 3, width: 1, height: 1 }, color: '#3D7A38', labelText: '', visual: { opacity: 1, shadows: true } },
    params: [
      StandardParams.length({ default: 3, min: 0.5, max: 20, step: 0.1 }),
      StandardParams.width({ default: 1, min: 0.3, max: 4, step: 0.1 }),
      StandardParams.height({ default: 1, min: 0.2, max: 4, step: 0.1 }),
      StandardParams.color({ label: 'Color' }),
      StandardParams.rotation(), StandardParams.text(), StandardParams.opacity()
    ]
  },
  {
    id: 'ambient.hedge_corner',
    family: 'ambient',
    match: item => item.assetProfile === 'arbustoCorner',
    metadata: { label: 'Arbusto corner', icon: 'corner-down-right', category: 'ambient' },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: { dims: { length: 1, width: 1, height: 1 }, color: '#3D7A38', labelText: '', visual: { opacity: 1, shadows: true } },
    params: [
      StandardParams.length({ default: 1, min: 0.3, max: 5, step: 0.1 }),
      StandardParams.width({ default: 1, min: 0.3, max: 5, step: 0.1 }),
      StandardParams.height({ default: 1, min: 0.2, max: 4, step: 0.1 }),
      StandardParams.color({ label: 'Color' }),
      StandardParams.rotation(), StandardParams.text(), StandardParams.opacity()
    ]
  },
  {
    id: 'ambient.hedge_curved',
    family: 'ambient',
    match: item => item.assetProfile === 'arbustoCurvo',
    metadata: { label: 'Arbusto curvo', icon: 'spline', category: 'ambient' },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: { dims: { length: 3, width: 1, height: 1 }, curveDiameter: 1, color: '#3D7A38', labelText: '', visual: { opacity: 1, shadows: true } },
    params: [
      StandardParams.length({ default: 3, min: 1, max: 20, step: 0.1 }),
      StandardParams.width({ default: 1, min: 0.3, max: 4, step: 0.1 }),
      StandardParams.height({ default: 1, min: 0.2, max: 4, step: 0.1 }),
      { key: 'curveRadius', label: 'Radio curvatura (m)', path: 'curveDiameter', type: 'number', default: 1, min: 0.5, max: 10, step: 0.1, level: PARAM_LEVEL.BASIC, category: PARAM_CATEGORY.SIZE },
      StandardParams.color({ label: 'Color' }),
      StandardParams.rotation(), StandardParams.text(), StandardParams.opacity()
    ]
  },
  {
    id: 'table.folding',
    family: 'table',
    match: item => item.assetProfile === 'mesaPlegable',
    metadata: { label: 'Mesa plegable', icon: 'table-2', category: 'tables' },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: { dims: { length: 1.8, width: 0.75, height: 0.75 }, color: '#f0ede8', labelText: '', visual: { opacity: 1, shadows: true } },
    params: [
      StandardParams.length({ default: 1.8, min: 0.6, max: 6, step: 0.1, label: 'Largo' }),
      StandardParams.width({ default: 0.75, min: 0.4, max: 2, step: 0.05 }),
      StandardParams.height({ default: 0.75, min: 0.5, max: 1.2, step: 0.01 }),
      StandardParams.color({ label: 'Color tablero' }),
      StandardParams.rotation(), StandardParams.text(), StandardParams.opacity(), StandardParams.shadow()
    ]
  },
  // ── LEGACY MIGRATION SCHEMAS (type → builder preset) ──────────────────────────
  // Tables
  {
    id: 'mesa.presidential',
    family: 'table',
    match: item => item.type === 'mesa' && item.subtype === 'presi',
    metadata: { label: 'Mesa presidencial', icon: 'table-2', category: 'tables' },
    builder: { preset: 'mesaPresi' },
    ui: { dynamic: true },
    defaults: { dims: { length: 5.0, width: 1.0, height: 0.75 }, color: '#DDD4C8', labelText: '' },
    params: []
  },
  {
    id: 'mesa.rect',
    family: 'table',
    match: item => item.type === 'mesaRect',
    metadata: { label: 'Mesa rectangular', icon: 'table-2', category: 'tables' },
    builder: { preset: 'mesaRect' },
    ui: { dynamic: true },
    defaults: { dims: { length: 2.4, width: 0.9, height: 0.75 }, color: '#DDD4C8', chairs: 6, labelText: '', endHead: true, endFoot: true },
    params: [
      StandardParams.length({ default: 2.4, min: 0.6, max: 12, step: 0.1 }),
      StandardParams.width({ default: 0.9, min: 0.4, max: 6, step: 0.1 }),
      StandardParams.chairs({ default: 6, max: 48 }),
      StandardParams.rotation(),
      StandardParams.color({ default: '#DDD4C8' }),
      StandardParams.text({ label: 'Texto mesa' }),
      { key: 'endHead', path: 'endHead', type: 'toggle', label: 'Silla cabecero', default: true, level: PARAM_LEVEL.ADVANCED, category: PARAM_CATEGORY.CHILDREN },
      { key: 'endFoot', path: 'endFoot', type: 'toggle', label: 'Silla pie',      default: true, level: PARAM_LEVEL.ADVANCED, category: PARAM_CATEGORY.CHILDREN }
    ]
  },
  {
    id: 'mesa.imperial',
    family: 'table',
    match: item => item.type === 'mesaImperial',
    metadata: { label: 'Mesa imperial', icon: 'table-2', category: 'tables' },
    builder: { preset: 'mesaRect' },
    ui: { dynamic: true },
    defaults: { dims: { length: 6.0, width: 1.2, height: 0.75 }, color: '#DDD4C8', chairs: 20, labelText: '', endHead: true, endFoot: true },
    params: [
      StandardParams.length({ default: 6.0, min: 1, max: 20, step: 0.1 }),
      StandardParams.width({ default: 1.2, min: 0.5, max: 6, step: 0.1 }),
      StandardParams.chairs({ default: 20, max: 48 }),
      StandardParams.rotation(),
      StandardParams.color({ default: '#DDD4C8' }),
      StandardParams.text({ label: 'Texto mesa' }),
      { key: 'endHead', path: 'endHead', type: 'toggle', label: 'Silla cabecero', default: true, level: PARAM_LEVEL.ADVANCED, category: PARAM_CATEGORY.CHILDREN },
      { key: 'endFoot', path: 'endFoot', type: 'toggle', label: 'Silla pie',      default: true, level: PARAM_LEVEL.ADVANCED, category: PARAM_CATEGORY.CHILDREN }
    ]
  },
  {
    id: 'mesa.cocktail',
    family: 'table',
    match: item => item.type === 'mesaCocktail',
    metadata: { label: 'Mesa cocktail', icon: 'wine', category: 'tables' },
    builder: { preset: 'mesaCocktail' },
    ui: { dynamic: true },
    defaults: { dims: { diameter: 0.8, height: 1.05 }, color: '#DDD4C8', labelText: '' },
    params: []
  },
  {
    id: 'mesa.curved',
    family: 'table',
    match: item => item.type === 'mesaCurva',
    metadata: { label: 'Mesa curva', icon: 'circle', category: 'tables' },
    builder: { preset: 'mesaCurva' },
    ui: { dynamic: true },
    defaults: { dims: { radius: 2.5, angle: 120, width: 0.9, height: 0.75 }, color: '#DDD4C8', labelText: '' },
    params: []
  },
  {
    id: 'mesa.serpentine',
    family: 'table',
    match: item => item.type === 'mesaSerpentina',
    metadata: { label: 'Mesa serpentina', icon: 'spline', category: 'tables' },
    builder: { preset: 'mesaSerpentina' },
    ui: { dynamic: true },
    defaults: { dims: { radius: 2.5, angle: 120, width: 0.9, height: 0.75 }, color: '#DDD4C8', labelText: '' },
    params: []
  },
  // Buffet / bars
  {
    id: 'buffet.legacy',
    family: 'buffet',
    match: item => item.type === 'buffet',
    metadata: { label: 'Buffet', icon: 'utensils-crossed', category: 'bars' },
    builder: { preset: 'buffetStreet' },
    ui: { dynamic: true },
    defaults: { dims: { length: 2.4, width: 0.8, height: 0.85 }, color: '#DDD4C8', labelText: '' },
    params: []
  },
  {
    id: 'bar.open',
    family: 'bar',
    match: item => item.type === 'barraLibre',
    metadata: { label: 'Barra libre', icon: 'wine', category: 'bars' },
    builder: { preset: 'barraLibre' },
    ui: { dynamic: true },
    defaults: { dims: { length: 3.0, width: 0.8, height: 0.9 }, color: '#1a1a1c', labelText: '', pax: 0 },
    params: [
      { key: 'pax', label: 'Pax barra', path: 'pax', type: 'number', default: 0, min: 0, max: 9999, step: 1, level: PARAM_LEVEL.BASIC, category: PARAM_CATEGORY.LAYOUT }
    ]
  },
  // Ambient / nature
  {
    id: 'ambient.tree',
    family: 'ambient',
    match: item => item.type === 'arbol',
    metadata: { label: 'Árbol', icon: 'trees', category: 'ambient' },
    builder: { preset: 'arbol' },
    ui: { dynamic: true },
    defaults: { dims: { crownWidth: 1.8, totalHeight: 3.0 }, color: '#2f6a3f' },
    params: []
  },
  {
    id: 'ambient.post',
    family: 'ambient',
    match: item => item.type === 'poste',
    metadata: { label: 'Poste', icon: 'pilcrow', category: 'ambient' },
    builder: { preset: 'poste' },
    ui: { dynamic: true },
    defaults: { dims: { diameter: 0.12, height: 3.0 }, color: '#6b4423' },
    params: []
  },
  {
    id: 'ambient.ambiente',
    family: 'ambient',
    match: item => item.type === 'ambiente',
    metadata: { label: 'Ambiente', icon: 'lamp-floor', category: 'ambient' },
    builder: { preset: 'ambiente' },
    ui: { dynamic: true },
    defaults: { dims: { height: 2.0 }, color: '#1a1a1c' },
    params: []
  },
  // Lighting
  {
    id: 'light.cable',
    family: 'lighting',
    match: item => item.type === 'cableLuces',
    metadata: { label: 'Cable luces', icon: 'lamp-ceiling', category: 'lighting' },
    builder: { preset: 'cableLuces' },
    ui: { dynamic: true },
    defaults: { height: 4.0, count: 8, spacing: 1.0 },
    params: []
  },
  // Structures
  {
    id: 'structure.room',
    family: 'structure',
    match: item => item.type === 'room',
    metadata: { label: 'Recinto', icon: 'box', category: 'structures' },
    builder: { preset: 'room' },
    ui: { dynamic: true },
    defaults: { dims: { length: 6.0, width: 4.0, height: 3.0, thickness: 0.10 }, color: '#ffffff' },
    params: []
  },
  // Tents / carpas
  {
    id: 'tent.carpa',
    family: 'tent',
    match: item => item.type === 'carpa',
    metadata: { label: 'Carpa', icon: 'tent', category: 'tents' },
    builder: { preset: 'carpa' },
    ui: { dynamic: true },
    defaults: { dims: { length: 10, width: 6, height: 3 }, color: '#ffffff' },
    params: []
  },
  {
    id: 'tent.cuadrada',
    family: 'tent',
    match: item => item.type === 'carpaCuadrada',
    metadata: { label: 'Carpa cuadrada', icon: 'tent', category: 'tents' },
    builder: { preset: 'carpaCuadrada' },
    ui: { dynamic: true },
    defaults: { dims: { length: 6, width: 6, height: 3 }, color: '#ffffff' },
    params: []
  },
  {
    id: 'tent.star',
    family: 'tent',
    match: item => item.type === 'carpaStar',
    metadata: { label: 'Carpa star', icon: 'tent', category: 'tents' },
    builder: { preset: 'carpaStar' },
    ui: { dynamic: true },
    defaults: { dims: { length: 10, width: 5, height: 4 }, color: '#e8e0d0' },
    params: []
  },
  {
    id: 'tent.pabellon',
    family: 'tent',
    match: item => item.type === 'carpaPabellon',
    metadata: { label: 'Pabellón', icon: 'tent', category: 'tents' },
    builder: { preset: 'carpaPabellon' },
    ui: { dynamic: true },
    defaults: { dims: { length: 12, width: 8, height: 4 }, color: '#f0ece4' },
    params: []
  },
  {
    id: 'tent.sailcloth',
    family: 'tent',
    match: item => item.type === 'carpaSailcloth',
    metadata: { label: 'Sailcloth', icon: 'tent', category: 'tents' },
    builder: { preset: 'carpaSailcloth' },
    ui: { dynamic: true },
    defaults: { dims: { length: 12, width: 9, height: 4 }, color: '#f5f0e8' },
    params: []
  },
  {
    id: 'tent.beduina',
    family: 'tent',
    match: item => item.type === 'carpaBeduina',
    metadata: { label: 'Carpa beduina', icon: 'tent', category: 'tents' },
    builder: { preset: 'carpaBeduina' },
    ui: { dynamic: true },
    defaults: { dims: { length: 8, width: 6, height: 4 }, color: '#c8b89a' },
    params: []
  },
  {
    id: 'tent.tipi',
    family: 'tent',
    match: item => item.type === 'carpaTipi',
    metadata: { label: 'Tipi', icon: 'tent', category: 'tents' },
    builder: { preset: 'carpaTipi' },
    ui: { dynamic: true },
    defaults: { dims: { diameter: 5, height: 4 }, color: '#d4c4a0' },
    params: []
  },
  {
    id: 'tent.transparente',
    family: 'tent',
    match: item => item.type === 'carpaTransparente',
    metadata: { label: 'Carpa transparente', icon: 'tent', category: 'tents' },
    builder: { preset: 'carpaTransparente' },
    ui: { dynamic: true },
    defaults: { dims: { length: 10, width: 6, height: 3.5 }, color: '#d8eefa' },
    params: []
  },
  {
    id: 'tent.domo',
    family: 'tent',
    match: item => item.type === 'carpaDomo',
    metadata: { label: 'Domo', icon: 'tent', category: 'tents' },
    builder: { preset: 'carpaDomo' },
    ui: { dynamic: true },
    defaults: { dims: { diameter: 8, height: 5 }, color: '#f0ece4' },
    params: []
  },
  // ── GENERIC FALLBACK ─────────────────────────────────────────────────────────
  {
    id: 'prop.generic-rect',
    family: 'prop',
    match: item => item.schemaId === 'prop.generic-rect' || item.type === 'schemaProp',
    metadata: {
      label: 'Prop rectangular',
      icon: 'square',
      category: 'structures'
    },
    builder: { preset: 'genericRectProp' },
    ui: { dynamic: true, supportsAdvanced: true },
    defaults: {
      dims: { width: 1.2, length: 1.2, height: 1.2 },
      color: '#B6B1A9',
      labelText: '',
      visual: { materialPreset: 'matte', opacity: 1, shadows: true },
      physics: { snap: true, collisions: true },
      display: { topKind: 'rect', cornerRadius: 0.06, topLabel: true }
    },
    params: [
      StandardParams.width(),
      StandardParams.length(),
      StandardParams.height(),
      StandardParams.rotation(),
      StandardParams.color(),
      StandardParams.text({ label: 'Texto libre' }),
      StandardParams.materialPreset(),
      StandardParams.opacity(),
      StandardParams.shadow(),
      StandardParams.snap(),
      StandardParams.collisions()
    ]
  },
  {
    id: 'prop.generic-round',
    family: 'prop',
    match: item => item.schemaId === 'prop.generic-round',
    metadata: {
      label: 'Prop circular',
      icon: 'circle',
      category: 'ambient'
    },
    builder: { preset: 'genericRoundProp' },
    ui: { dynamic: true, supportsAdvanced: true },
    defaults: {
      dims: { diameter: 1.5, height: 0.8 },
      color: '#B6B1A9',
      labelText: '',
      visual: { materialPreset: 'matte', opacity: 1, shadows: true },
      physics: { snap: true, collisions: true }
    },
    params: [
      StandardParams.diameter({ default: 1.5, min: 0.2, max: 30, step: 0.05 }),
      StandardParams.height({ default: 0.8, min: 0.05, max: 12, step: 0.05 }),
      StandardParams.rotation(),
      StandardParams.color(),
      StandardParams.text(),
      StandardParams.opacity(),
      StandardParams.shadow()
    ]
  },
  {
    id: 'surface.generic',
    family: 'surface',
    match: item => item.schemaId === 'surface.generic' || item.type === 'schemaSurface',
    metadata: {
      label: 'Superficie',
      icon: 'map',
      category: 'ambient'
    },
    builder: { preset: 'genericSurface' },
    ui: { dynamic: true, supportsAdvanced: true },
    defaults: {
      dims: { width: 3, length: 3, height: 0.03 },
      color: '#6F8E57',
      borderColor: '#2F5A29',
      labelText: '',
      visual: { materialPreset: 'matte', opacity: 0.92, shadows: false },
      physics: { snap: true, collisions: false },
      display: { topKind: 'surface' }
    },
    params: [
      StandardParams.width({ default: 3, min: 0.5, max: 80, step: 0.1 }),
      StandardParams.length({ default: 3, min: 0.5, max: 80, step: 0.1 }),
      StandardParams.rotation(),
      StandardParams.color(),
      {
        key: 'borderColor',
        path: 'borderColor',
        type: 'color',
        label: 'Borde',
        default: '#2F5A29',
        level: PARAM_LEVEL.ADVANCED,
        category: PARAM_CATEGORY.APPEARANCE
      },
      StandardParams.opacity(),
      StandardParams.text({ label: 'Rotulo superficie' })
    ]
  },
  {
    id: 'structure.pergola',
    family: 'structure',
    match: item => item.type === 'pergola',
    metadata: {
      label: 'Pérgola',
      icon: 'layout-template',
      category: 'decor'
    },
    builder: { preset: 'pergola' },
    ui: { dynamic: true, supportsAdvanced: true },
    defaults: {
      dims: { length: 4, width: 4, height: 3, roofHeight: 0.12, modSpacing: 4 },
      color: '#C4A265',
      roofColor: '#4A4744',
      labelText: '',
      visual: { opacity: 1, shadows: true }
    },
    params: [
      StandardParams.length({ default: 4, min: 1, max: 50, step: 0.5 }),
      StandardParams.width({ default: 4, min: 1, max: 50, step: 0.5 }),
      { key: 'height', label: 'Alto postes (m)', path: 'dims.height', type: 'number', default: 3, min: 1.5, max: 8, step: 0.1, category: PARAM_CATEGORY.GEOMETRY, level: PARAM_LEVEL.BASIC },
      { key: 'modSpacing', label: 'Módulo entre postes (m)', path: 'dims.modSpacing', type: 'number', default: 4, min: 1, max: 10, step: 0.5, category: PARAM_CATEGORY.GEOMETRY, level: PARAM_LEVEL.BASIC },
      { key: 'roofHeight', label: 'Grosor lamas (m)', path: 'dims.roofHeight', type: 'number', default: 0.12, min: 0.04, max: 0.4, step: 0.01, category: PARAM_CATEGORY.GEOMETRY, level: PARAM_LEVEL.ADVANCED },
      StandardParams.color({ label: 'Color postes' }),
      { key: 'roofColor', label: 'Color techo', path: 'roofColor', type: 'color', default: '#4A4744', level: PARAM_LEVEL.BASIC, category: PARAM_CATEGORY.APPEARANCE },
      StandardParams.rotation(),
      StandardParams.opacity(),
      StandardParams.shadow(),
      StandardParams.text()
    ]
  },
  {
    id: 'person.generic',
    family: 'person',
    match: item => item.schemaId === 'person.generic',
    metadata: {
      label: 'Personal',
      icon: 'user-round',
      category: 'staff'
    },
    builder: { preset: 'genericPerson' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: {
      dims: { width: 0.55, length: 0.55, height: 1.75 },
      color: '#2C2C31',
      accentColor: '#D9D4CC',
      labelText: '',
      visual: { materialPreset: 'matte', opacity: 1, shadows: true },
      physics: { snap: true, collisions: true }
    },
    params: [
      StandardParams.height({ default: 1.75, min: 1, max: 2.3, step: 0.01 }),
      StandardParams.rotation(),
      StandardParams.color({ default: '#2C2C31' }),
      {
        key: 'accentColor',
        path: 'accentColor',
        type: 'color',
        label: 'Acento',
        default: '#D9D4CC',
        level: PARAM_LEVEL.BASIC,
        category: PARAM_CATEGORY.APPEARANCE
      },
      StandardParams.text({ label: 'Rol visible' })
    ]
  },
  {
    id: 'arrow.2d',
    family: 'signage',
    match: item => item.schemaId === 'arrow.2d',
    metadata: {
      label: 'Flecha 2D',
      icon: 'arrow-right',
      category: 'ambient'
    },
    builder: { preset: 'arrow2D' },
    ui: { dynamic: true, supportsAdvanced: false },
    defaults: {
      dims: { width: 1.2, length: 2.2, height: 0.05 },
      color: '#111827',
      labelText: '',
      textColor: '#FFFFFF',
      display: { textSize: 34 },
      visual: { materialPreset: 'matte', opacity: 0.95, shadows: false },
      physics: { snap: true, collisions: false }
    },
    params: [
      StandardParams.width({ default: 1.2, min: 0.2, max: 8, step: 0.05 }),
      StandardParams.length({ default: 2.2, min: 0.3, max: 12, step: 0.05 }),
      StandardParams.rotation(),
      StandardParams.color(),
      StandardParams.text({ label: 'Texto libre' }),
      {
        key: 'textColor',
        path: 'textColor',
        type: 'color',
        label: 'Color texto',
        default: '#FFFFFF',
        level: PARAM_LEVEL.BASIC,
        category: PARAM_CATEGORY.APPEARANCE
      },
      {
        key: 'textSize',
        path: 'display.textSize',
        type: 'number',
        label: 'Tamano texto',
        default: 34,
        min: 18,
        max: 72,
        step: 1,
        suffix: 'px',
        level: PARAM_LEVEL.BASIC,
        category: PARAM_CATEGORY.LABELS
      }
    ]
  },
  {
    id: 'lighting.generic',
    family: 'lighting',
    match: item => item.schemaId === 'lighting.generic',
    metadata: {
      label: 'Iluminacion',
      icon: 'lamp-floor',
      category: 'lighting'
    },
    builder: { preset: 'genericLighting' },
    ui: { dynamic: true, supportsAdvanced: true },
    defaults: {
      dims: { width: 0.6, length: 0.6, height: 2.5 },
      color: '#111827',
      lightColor: '#FFE8A3',
      visual: { materialPreset: 'metal', opacity: 1, shadows: true },
      physics: { snap: true, collisions: true }
    },
    params: [
      StandardParams.height({ default: 2.5, min: 0.4, max: 18, step: 0.05 }),
      StandardParams.rotation(),
      StandardParams.color({ default: '#111827' }),
      {
        key: 'lightColor',
        path: 'lightColor',
        type: 'color',
        label: 'Luz',
        default: '#FFE8A3',
        level: PARAM_LEVEL.BASIC,
        category: PARAM_CATEGORY.APPEARANCE
      },
      StandardParams.opacity(),
      StandardParams.shadow()
    ]
  },
  {
    id: 'seat.sofa',
    family: 'sofa',
    match: item => item.schemaId === 'seat.sofa',
    metadata: {
      label: 'Sofa',
      icon: 'sofa',
      category: 'chairs'
    },
    builder: { preset: 'sofaSeat' },
    ui: { dynamic: true, supportsAdvanced: true },
    defaults: {
      dims: { width: 1.4, length: 0.9, height: 0.82 },
      seats: 2,
      color: '#CFC7BC',
      accentColor: '#8B5E3C',
      visual: { materialPreset: 'fabric', opacity: 1, shadows: true },
      physics: { snap: true, collisions: true }
    },
    params: [
      StandardParams.width({ default: 1.4, min: 0.6, max: 4, step: 0.05 }),
      StandardParams.length({ default: 0.9, min: 0.5, max: 2, step: 0.05, label: 'Fondo', path: 'dims.length' }),
      StandardParams.height({ default: 0.82, min: 0.5, max: 1.6, step: 0.01 }),
      {
        key: 'seats',
        path: 'seats',
        type: 'number',
        label: 'Plazas',
        default: 2,
        min: 1,
        max: 4,
        step: 1,
        level: PARAM_LEVEL.BASIC,
        category: PARAM_CATEGORY.LAYOUT
      },
      StandardParams.rotation(),
      StandardParams.color({ default: '#CFC7BC' }),
      {
        key: 'accentColor',
        path: 'accentColor',
        type: 'color',
        label: 'Base',
        default: '#8B5E3C',
        level: PARAM_LEVEL.ADVANCED,
        category: PARAM_CATEGORY.APPEARANCE
      }
    ]
  }
];

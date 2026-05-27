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
        offset: 0.5,
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
        label: 'Offset sillas',
        path: 'autoChildren.offset',
        default: 0.5,
        min: 0,
        max: 3,
        step: 0.02,
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

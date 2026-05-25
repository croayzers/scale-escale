import { getValueAtPath } from './SchemaUtils.js';

function asCount(item, config, path, fallback = 0) {
  const raw = path ? getValueAtPath(item, path, fallback) : fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function asNumber(item, path, fallback = 0) {
  const raw = path ? getValueAtPath(item, path, fallback) : fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function asText(item, path, fallback = '') {
  return String(path ? getValueAtPath(item, path, fallback) : fallback);
}

function isEnabled(item, childConfig) {
  if (!childConfig.enabledParam) return true;
  return Boolean(getValueAtPath(item, childConfig.enabledParam, false));
}

function parentBox(item) {
  const dims = item.dims || {};
  const width = dims.width ?? dims.diameter ?? dims.size ?? 1;
  const length = dims.length ?? dims.width ?? dims.diameter ?? dims.size ?? 1;
  const radius = dims.diameter ? dims.diameter / 2 : Math.max(width, length) / 2;
  return {
    width,
    length,
    height: dims.height ?? 0.75,
    radius
  };
}

function placementsAround(item, childConfig) {
  const count = asCount(item, childConfig, childConfig.countParam, 0);
  if (count <= 0) return [];

  const box = parentBox(item);
  const offset = asNumber(item, childConfig.offsetParam, 0.35);
  const startAngleDeg = asNumber(item, childConfig.angleOffsetParam, 0);
  const placementMode = childConfig.placementParam
    ? asText(item, childConfig.placementParam, childConfig.placement)
    : childConfig.placement;
  const arcDegrees = placementMode === 'arc' ? 180 : 360;
  const angleStart = (startAngleDeg - arcDegrees / 2) * Math.PI / 180;
  const angleStep = count > 1 ? (arcDegrees * Math.PI / 180) / count : 0;
  const radius = box.radius + offset + 0.22;

  return Array.from({ length: count }, (_, index) => {
    const angle = arcDegrees === 360
      ? startAngleDeg * Math.PI / 180 + (index / count) * Math.PI * 2
      : angleStart + index * angleStep + angleStep / 2;
    const outwardRotY = Math.PI / 2 - angle;
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      rotY: childConfig.facing === 'outward'
        ? outwardRotY
        : outwardRotY + Math.PI
    };
  });
}

function placementsLateral(item, childConfig) {
  const count = asCount(item, childConfig, childConfig.countParam, 0);
  if (count <= 0) return [];
  const box = parentBox(item);
  const spacing = asNumber(item, childConfig.spacingParam, 1.2);
  const offset = asNumber(item, childConfig.offsetParam, 0.9);
  const side = childConfig.sideParam
    ? asText(item, childConfig.sideParam, 'rear')
    : 'rear';

  const sides = side === 'both' ? ['left', 'right'] : [side];
  const itemsPerSide = side === 'both' ? Math.ceil(count / 2) : count;
  const placements = [];

  sides.forEach((currentSide, sideIndex) => {
    const localCount = side === 'both'
      ? Math.min(itemsPerSide, count - sideIndex * itemsPerSide)
      : count;
    for (let index = 0; index < localCount; index += 1) {
      const centerOffset = ((localCount - 1) * spacing) / 2;
      const line = index * spacing - centerOffset;
      if (currentSide === 'rear') {
        placements.push({ x: line, z: -(box.width / 2 + offset), rotY: Math.PI });
      } else if (currentSide === 'left') {
        placements.push({ x: -(box.length / 2 + offset), z: line, rotY: -Math.PI / 2 });
      } else if (currentSide === 'right') {
        placements.push({ x: box.length / 2 + offset, z: line, rotY: Math.PI / 2 });
      }
    }
  });

  return placements.slice(0, count);
}

function placementsGrid(item, childConfig) {
  const count = asCount(item, childConfig, childConfig.countParam, 0);
  if (count <= 0) return [];
  const cols = Math.max(1, asCount(item, childConfig, childConfig.colsParam, Math.ceil(Math.sqrt(count))));
  const spacingX = asNumber(item, childConfig.spacingXParam || childConfig.spacingParam, 1.2);
  const spacingZ = asNumber(item, childConfig.spacingZParam || childConfig.spacingParam, 1.2);
  const placements = [];

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const offsetX = (col - (cols - 1) / 2) * spacingX;
    const offsetZ = (row - (Math.ceil(count / cols) - 1) / 2) * spacingZ;
    placements.push({ x: offsetX, z: offsetZ, rotY: 0 });
  }

  return placements;
}

function placementsStairs(item, childConfig) {
  const count = asCount(item, childConfig, childConfig.countParam, 0);
  if (count <= 0) return [];
  const side = childConfig.sideParam
    ? asText(item, childConfig.sideParam, 'front')
    : 'front';
  const width = asNumber(item, 'stairs.width', 1.6);
  const depth = asNumber(item, 'stairs.depth', 0.35);
  const parent = parentBox(item);
  const height = parent.height;
  const stepHeight = height / count;

  return Array.from({ length: count }, (_, index) => {
    const progress = index + 1;
    const distance = (count - index) * depth - depth / 2;
    const heightAtStep = progress * stepHeight;
    const y = 0;

    if (side === 'left') {
      return {
        x: -(parent.length / 2 + distance),
        z: 0,
        y,
        rotY: -Math.PI / 2,
        dims: { width: depth, length: width, height: heightAtStep }
      };
    }

    if (side === 'right') {
      return {
        x: parent.length / 2 + distance,
        z: 0,
        y,
        rotY: Math.PI / 2,
        dims: { width: depth, length: width, height: heightAtStep }
      };
    }

    return {
      x: 0,
      z: parent.width / 2 + distance,
      y,
      rotY: 0,
      dims: { width: depth, length: width, height: heightAtStep }
    };
  });
}

const PLACERS = {
  around: placementsAround,
  arc: placementsAround,
  lateral: placementsLateral,
  grid: placementsGrid,
  stairs: placementsStairs
};

export function generateSchemaChildren(item, schema, context = {}) {
  if (!schema?.children?.length) return [];

  return schema.children.flatMap(childConfig => {
    if (!isEnabled(item, childConfig)) return [];
    const placementKey = childConfig.placementParam
      ? asText(item, childConfig.placementParam, childConfig.placement)
      : childConfig.placement;
    const placer = PLACERS[placementKey] || PLACERS[childConfig.placement] || PLACERS.around;
    const placements = placer(item, childConfig, context);
    return placements.map((placement, index) => {
      const baseItem = childConfig.childFactory
        ? childConfig.childFactory({
            parentItem: item,
            schema,
            index,
            count: placements.length,
            placement,
            context
          })
        : {
            type: childConfig.type,
            schemaId: childConfig.schemaId
          };
      return {
        key: childConfig.key,
        item: {
          ...baseItem,
          schemaId: baseItem.schemaId || childConfig.schemaId,
          x: placement.x,
          z: placement.z,
          y: placement.y || 0,
          rotY: placement.rotY || 0,
          dims: placement.dims ? { ...(baseItem.dims || {}), ...placement.dims } : baseItem.dims
        }
      };
    });
  });
}

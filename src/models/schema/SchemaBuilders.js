function colorNumber(value, fallback = '#CCCCCC') {
  const raw = String(value || fallback).replace('#', '');
  return parseInt(raw, 16);
}

function makeStandardMaterial(color, preset = 'default', opacity = 1) {
  const presets = {
    default: { roughness: 0.55, metalness: 0.08 },
    matte: { roughness: 0.88, metalness: 0.02 },
    metal: { roughness: 0.35, metalness: 0.72 },
    glass: { roughness: 0.08, metalness: 0.1, transparent: true, opacity: Math.min(opacity, 0.5) },
    fabric: { roughness: 0.92, metalness: 0.02 }
  };
  const selected = presets[preset] || presets.default;
  return new THREE.MeshStandardMaterial({
    color: colorNumber(color),
    flatShading: preset !== 'glass',
    transparent: opacity < 1 || selected.transparent === true,
    opacity,
    ...selected
  });
}

function makeTopFill(color, opacity = 0.16) {
  return new THREE.MeshBasicMaterial({
    color: colorNumber(color),
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });
}

function addLabel(group, text, y, color = '#111827') {
  const normalized = String(text || '').trim();
  if (!normalized) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 128;
  ctx.fillStyle = 'rgba(245,243,238,0.94)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '600 42px "Inter Tight", sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(normalized, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(1.8, 0.45, 1);
  sprite.position.set(0, y, 0);
  group.add(sprite);
}

function addTopLabel(group, text, color = '#111827') {
  const normalized = String(text || '').trim();
  if (!normalized) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 384;
  canvas.height = 96;
  ctx.fillStyle = 'rgba(245,243,238,0.94)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '600 34px "Inter Tight", sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(normalized, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 0.45),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.06;
  group.add(plane);
}

function addTopPlainText(group, text, {
  color = '#FFFFFF',
  fontSize = 34,
  width = 2.2,
  height = 0.5
} = {}) {
  const normalized = String(text || '').trim();
  if (!normalized) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 128;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `700 ${Math.max(18, Math.min(fontSize, 72))}px "Inter Tight", sans-serif`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, Math.min(8, fontSize / 8));
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(normalized, canvas.width / 2, canvas.height / 2);
  ctx.fillText(normalized, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const computedWidth = Math.max(width, normalized.length * Math.max(0.34, fontSize * 0.018));
  const computedHeight = Math.max(height, Math.max(0.7, fontSize * 0.028));
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(computedWidth, computedHeight),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.085;
  plane.renderOrder = 40;
  plane.userData.skipTopStroke = true;
  group.add(plane);
}

function markMain(mesh, color) {
  mesh.userData.isMain = true;
  mesh.userData.baseColor = colorNumber(color);
  return mesh;
}

function roundedRectShape(length, width, radius = 0.08) {
  const L = length / 2;
  const W = width / 2;
  const r = Math.max(0, Math.min(radius, L, W));
  const shape = new THREE.Shape();
  shape.moveTo(-L + r, -W);
  shape.lineTo(L - r, -W);
  shape.quadraticCurveTo(L, -W, L, -W + r);
  shape.lineTo(L, W - r);
  shape.quadraticCurveTo(L, W, L - r, W);
  shape.lineTo(-L + r, W);
  shape.quadraticCurveTo(-L, W, -L, W - r);
  shape.lineTo(-L, -W + r);
  shape.quadraticCurveTo(-L, -W, -L + r, -W);
  return shape;
}

function triangleShape(length, width) {
  const L = length / 2;
  const W = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-L, -W);
  shape.lineTo(L, 0);
  shape.lineTo(-L, W);
  shape.lineTo(-L, -W);
  return shape;
}

function archShape(length, width) {
  const L = length / 2;
  const W = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-L, -W);
  shape.lineTo(-L, 0);
  shape.absarc(0, 0, L, Math.PI, 0, false);
  shape.lineTo(L, -W);
  shape.lineTo(-L, -W);
  return shape;
}

function inferTopFootprintKind(item) {
  if (item.display?.topKind) return item.display.topKind;
  switch (item.catalogDefinitionId) {
    case 'truss_triangular':
      return 'triangle';
    case 'arco_decorativo':
      return 'arch';
    default:
      return 'rect';
  }
}

function addTopFootprint(group, item, length, width, color, opacity = 0.2) {
  const kind = inferTopFootprintKind(item);
  if (kind === 'triangle' || kind === 'arch') {
    const shape = kind === 'triangle' ? triangleShape(length, width) : archShape(length, width);
    const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), makeTopFill(color, opacity));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    markMain(fill, color);
    group.add(fill);
    if (item.labelText && item.display?.topLabel !== false) addTopLabel(group, item.labelText);
    return;
  }
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(length, width),
    makeTopFill(color, opacity)
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.04;
  markMain(fill, color);
  group.add(fill);
  if (item.labelText && item.display?.topLabel !== false) addTopLabel(group, item.labelText);
}

function addBox(group, { size, position, color, preset = 'matte', opacity = 1, yOffset = 0 }) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    makeStandardMaterial(color, preset, opacity)
  );
  mesh.position.set(position[0], position[1] + yOffset, position[2]);
  mesh.castShadow = opacity > 0.12;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addCylinder(group, { radiusTop, radiusBottom = radiusTop, height, position, color, preset = 'metal', radialSegments = 18, rotation = null, opacity = 1 }) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    makeStandardMaterial(color, preset, opacity)
  );
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  mesh.castShadow = opacity > 0.12;
  group.add(mesh);
  return mesh;
}

function addSphere(group, { radius, position, color, preset = 'glass', opacity = 1, emissive = false }) {
  const material = emissive
    ? new THREE.MeshStandardMaterial({
        color: colorNumber(color),
        emissive: colorNumber(color),
        emissiveIntensity: 0.9,
        roughness: 0.25,
        transparent: opacity < 1,
        opacity
      })
    : makeStandardMaterial(color, preset, opacity);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 18), material);
  mesh.position.set(position[0], position[1], position[2]);
  group.add(mesh);
  return mesh;
}

function addWheel(group, x, y, z, radius = 0.08, color = '#2a2a2c') {
  const wheel = addCylinder(group, {
    radiusTop: radius,
    height: radius * 0.55,
    position: [x, y, z],
    color,
    preset: 'metal',
    radialSegments: 14,
    rotation: [Math.PI / 2, 0, 0]
  });
  wheel.receiveShadow = false;
  return wheel;
}

function tubeBetween(a, b, radius, color, preset = 'metal') {
  const start = a.clone();
  const end = b.clone();
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 8),
    makeStandardMaterial(color, preset, 1)
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  return mesh;
}

function addPolylineTubes(group, points, radius, color, closed = false) {
  const vectors = points.map(point => new THREE.Vector3(point[0], point[1], point[2]));
  for (let index = 1; index < vectors.length; index += 1) {
    group.add(tubeBetween(vectors[index - 1], vectors[index], radius, color));
  }
  if (closed && vectors.length > 2) {
    group.add(tubeBetween(vectors[vectors.length - 1], vectors[0], radius, color));
  }
}

function addTransparentShell(group, geometry, color, opacity = 0.08) {
  const shell = new THREE.Mesh(
    geometry,
    makeStandardMaterial(color, 'glass', opacity)
  );
  shell.castShadow = false;
  shell.receiveShadow = false;
  markMain(shell, color);
  group.add(shell);
  return shell;
}

function inferRectProfile(item) {
  if (item.assetProfile) return item.assetProfile;
  switch (item.catalogDefinitionId) {
    case 'truss_cuadrado': return 'trussBox';
    case 'truss_triangular': return 'trussTri';
    case 'pantalla_led':
    case 'pantalla_proyeccion': return 'screen';
    case 'totem_publicitario': return 'totem';
    case 'podium': return 'podium';
    case 'pasarela': return 'runway';
    case 'cabina_tecnica':
    case 'cabina_traduccion': return 'booth';
    case 'bano_portatil': return 'portableToilet';
    case 'lavamanos_portatil': return 'sinkStation';
    case 'generador_electrico': return 'generator';
    case 'cuadro_electrico': return 'electricalBox';
    case 'extintor': return 'extinguisher';
    case 'punto_reciclaje': return 'recyclingPoint';
    case 'contenedor_basura': return 'trashContainer';
    case 'senal_salida':
    case 'senal_emergencia': return 'signPanel';
    case 'vallado_tecnico': return 'fence';
    case 'punto_informacion': return 'infoPoint';
    case 'barra_recta': return 'barStraight';
    case 'nevera_industrial': return 'fridge';
    case 'botellero': return 'bottleRack';
    case 'cafetera_industrial': return 'coffeeMachine';
    case 'carro_servicio': return 'serviceCart';
    case 'taburete_alto': return 'stool';
    case 'dispensador_bebidas': return 'drinkDispenser';
    case 'vitrina_refrigerada': return 'showcase';
    case 'carrito_buffet': return 'serviceCart';
    case 'biombo_decorativo': return 'foldingScreen';
    case 'panel_floral': return 'flowerPanel';
    case 'panel_led_deco': return 'ledPanel';
    case 'photocall': return 'photocall';
    case 'arco_decorativo': return 'decorArch';
    case 'letras_gigantes': return 'giantLetters';
    case 'neon_personalizado': return 'neonSign';
    default: return '';
  }
}

function inferRoundProfile(item) {
  if (item.assetProfile) return item.assetProfile;
  switch (item.catalogDefinitionId) {
    case 'barra_curva': return 'curvedBar';
    case 'jarron_alto': return 'vase';
    case 'centro_mesa': return 'centerpiece';
    case 'candelabro': return 'candelabra';
    case 'peana_decorativa': return 'pedestal';
    case 'cubitera': return 'iceBucket';
    default: return '';
  }
}

function inferLightingProfile(item) {
  if (item.lightingProfile) return item.lightingProfile;
  switch (item.catalogDefinitionId) {
    case 'foco_led':
    case 'foco_escenario': return 'spotlight';
    case 'torre_iluminacion': return 'towerLight';
    case 'guirnalda_luces': return 'stringLights';
    case 'luz_ambiental_rgb':
    case 'luz_calida_decorativa': return 'uplight';
    case 'cabeza_movil': return 'movingHead';
    case 'laser_evento': return 'laser';
    case 'proyector_logo': return 'logoProjector';
    case 'baliza_exterior': return 'bollard';
    case 'cortina_luces': return 'lightCurtain';
    default: return '';
  }
}

function inferPersonPose(item) {
  if (item.pose) return item.pose;
  return String(item.catalogDefinitionId || '').includes('sentado') ? 'seated' : 'standing';
}

function buildRoundTable(item, view) {
  const group = new THREE.Group();
  const diameter = item.dims?.diameter ?? 1.8;
  const height = item.dims?.height ?? 0.75;
  const color = item.color || '#DDD4C8';
  const materialPreset = item.visual?.materialPreset || 'fabric';
  const opacity = item.visual?.opacity ?? 1;

  if (view === 'top') {
    const fill = new THREE.Mesh(new THREE.CircleGeometry(diameter / 2, 72), makeTopFill(color, 0.18));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    markMain(fill, color);
    group.add(fill);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(0.03, diameter / 2 - 0.04), diameter / 2, 72),
      new THREE.MeshBasicMaterial({ color: colorNumber('#111827'), transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.045;
    group.add(ring);
    addTopLabel(group, item.labelText, '#111827');
    return group;
  }

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(diameter / 2, diameter / 2, 0.06, 64),
    makeStandardMaterial(color, materialPreset, opacity)
  );
  top.position.y = height;
  top.castShadow = item.visual?.shadows !== false;
  top.receiveShadow = true;
  markMain(top, color);
  group.add(top);

  const cloth = new THREE.Mesh(
    new THREE.CylinderGeometry(diameter / 2 + 0.04, diameter / 2 + 0.12, height - 0.05, 52, 1, true),
    makeStandardMaterial(color, 'fabric', Math.min(opacity, 0.96))
  );
  cloth.position.y = (height - 0.05) / 2;
  cloth.castShadow = item.visual?.shadows !== false;
  group.add(cloth);

  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.08, height, 12),
    makeStandardMaterial('#6B6864', 'metal', 1)
  );
  leg.position.y = height / 2;
  leg.castShadow = true;
  group.add(leg);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(diameter * 0.18, diameter * 0.2, 0.05, 32),
    makeStandardMaterial('#6B6864', 'metal', 1)
  );
  base.position.y = 0.025;
  group.add(base);
  addLabel(group, item.labelText, height + 0.45);
  return group;
}

function buildChair(item, view) {
  const group = new THREE.Group();
  const W = item.dims?.width ?? 0.44;
  const D = item.dims?.depth ?? 0.44;
  const SH = item.dims?.seatHeight ?? 0.45;
  const TH = item.dims?.totalHeight ?? 0.85;
  const color = item.color || '#F5F3EE';
  const accent = item.subtype === 'napoleon' ? '#C7A25F' : color;

  if (view === 'top') {
    const seat = new THREE.Mesh(new THREE.PlaneGeometry(W, D), makeTopFill(accent, 0.28));
    seat.rotation.x = -Math.PI / 2;
    seat.position.y = 0.04;
    markMain(seat, accent);
    group.add(seat);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.08), makeTopFill('#111827', 0.22));
    back.rotation.x = -Math.PI / 2;
    back.position.set(0, 0.041, D / 2 - 0.04);
    group.add(back);
    return group;
  }

  const material = makeStandardMaterial(accent, item.visual?.materialPreset || 'default', item.visual?.opacity ?? 1);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, D), material);
  seat.position.y = SH;
  seat.castShadow = item.visual?.shadows !== false;
  markMain(seat, accent);
  group.add(seat);

  const backHeight = Math.max(0.2, TH - SH - 0.03);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, backHeight, 0.03), material.clone());
  back.position.set(0, SH + backHeight / 2, D / 2 - 0.02);
  back.castShadow = item.visual?.shadows !== false;
  group.add(back);

  const legMat = makeStandardMaterial(item.subtype === 'tolix' ? accent : '#6B6864', 'metal', 1);
  const legGeo = new THREE.CylinderGeometry(0.01, 0.012, SH, 8);
  const offX = W / 2 - 0.04;
  const offZ = D / 2 - 0.04;
  [[-offX, -offZ], [offX, -offZ], [-offX, offZ], [offX, offZ]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeo, legMat.clone());
    leg.position.set(x, SH / 2, z);
    leg.castShadow = true;
    group.add(leg);
  });
  return group;
}

function buildChairLine(item, view) {
  const group = new THREE.Group();
  const count = Math.max(2, item.count ?? 6);
  const gap = item.gap ?? 0.5;
  for (let index = 0; index < count; index += 1) {
    const chair = buildChair(item, view);
    chair.position.x = index * gap - ((count - 1) * gap) / 2;
    group.add(chair);
  }
  return group;
}

function buildBuffet(item, view) {
  const group = new THREE.Group();
  const L = item.dims?.length ?? 3.6;
  const W = item.dims?.width ?? 0.8;
  const H = item.dims?.height ?? 0.9;
  const color = item.color || '#DDD4C8';
  if (view === 'top') {
    addTopFootprint(group, item, L, W, color, 0.22);
    addTopLabel(group, item.labelText || item.subtype || 'Buffet');
    return group;
  }
  const body = addBox(group, {
    size: [L, H, W],
    position: [0, H / 2, 0],
    color,
    preset: item.visual?.materialPreset || 'fabric',
    opacity: item.visual?.opacity ?? 1
  });
  markMain(body, color);

  addBox(group, {
    size: [L + 0.04, 0.05, W + 0.04],
    position: [0, H + 0.02, 0],
    color: '#6B6864',
    preset: 'matte'
  });
  addLabel(group, item.labelText || item.subtype || 'Buffet', H + 0.55);
  return group;
}

function buildStage(item, view) {
  const group = new THREE.Group();
  const W = item.dims?.width ?? 4;
  const L = item.dims?.length ?? 6;
  const H = item.dims?.height ?? 0.8;
  const color = item.color || '#27272A';
  if (view === 'top') {
    addTopFootprint(group, item, L, W, color, 0.18);
    addTopLabel(group, item.labelText || 'Escenario');
    return group;
  }
  const body = addBox(group, {
    size: [L, H, W],
    position: [0, H / 2, 0],
    color,
    preset: item.visual?.materialPreset || 'matte',
    opacity: item.visual?.opacity ?? 1
  });
  markMain(body, color);

  const edgeColor = '#4B5563';
  addBox(group, { size: [L, 0.04, 0.08], position: [0, H + 0.02, W / 2 - 0.04], color: edgeColor, preset: 'metal' });
  addBox(group, { size: [L, 0.04, 0.08], position: [0, H + 0.02, -W / 2 + 0.04], color: edgeColor, preset: 'metal' });
  addLabel(group, item.labelText || 'Escenario', H + 0.45);
  return group;
}

function buildTrussBox(group, item, L, W, H, color) {
  addTransparentShell(group, new THREE.BoxGeometry(L, H, W), color, 0.08);
  const rail = Math.max(0.018, Math.min(W, H) * 0.05);
  const x = L / 2;
  const y = H;
  const z = W / 2;
  const cornersBottom = [
    new THREE.Vector3(-x, 0, -z),
    new THREE.Vector3(x, 0, -z),
    new THREE.Vector3(x, 0, z),
    new THREE.Vector3(-x, 0, z)
  ];
  const cornersTop = cornersBottom.map(vector => vector.clone().setY(y));
  cornersBottom.forEach((point, index) => {
    group.add(tubeBetween(point, cornersTop[index], rail, color));
  });
  for (let index = 0; index < cornersBottom.length; index += 1) {
    const next = (index + 1) % cornersBottom.length;
    group.add(tubeBetween(cornersBottom[index], cornersBottom[next], rail, color));
    group.add(tubeBetween(cornersTop[index], cornersTop[next], rail, color));
  }
  [[0, 1], [3, 2]].forEach(([a, b]) => {
    group.add(tubeBetween(cornersBottom[a], cornersTop[b], rail * 0.7, color));
    group.add(tubeBetween(cornersBottom[b], cornersTop[a], rail * 0.7, color));
  });
}

function buildTrussTri(group, item, L, W, H, color) {
  const triangle = new THREE.Shape();
  triangle.moveTo(-W / 2, 0);
  triangle.lineTo(W / 2, 0);
  triangle.lineTo(0, H);
  triangle.lineTo(-W / 2, 0);
  const prism = new THREE.ExtrudeGeometry(triangle, { depth: L, bevelEnabled: false });
  prism.center();
  prism.rotateY(Math.PI / 2);
  addTransparentShell(group, prism, color, 0.09);

  const rail = Math.max(0.018, W * 0.08);
  const front = [
    new THREE.Vector3(-L / 2, 0, -W / 2),
    new THREE.Vector3(-L / 2, 0, W / 2),
    new THREE.Vector3(-L / 2, H, 0)
  ];
  const back = front.map(point => point.clone().setX(L / 2));
  for (let index = 0; index < 3; index += 1) {
    group.add(tubeBetween(front[index], back[index], rail, color));
  }
  addPolylineTubes(group, front.map(point => [point.x, point.y, point.z]), rail, color, true);
  addPolylineTubes(group, back.map(point => [point.x, point.y, point.z]), rail, color, true);
  group.add(tubeBetween(front[0], back[2], rail * 0.65, color));
  group.add(tubeBetween(front[1], back[2], rail * 0.65, color));
}

function buildScreen(group, item, L, W, H, color) {
  const frameColor = '#4B5563';
  const panel = addBox(group, {
    size: [L, H, Math.max(0.05, W)],
    position: [0, H / 2 + 0.18, 0],
    color,
    preset: color === '#111827' ? 'glass' : 'fabric',
    opacity: color === '#111827' ? 0.88 : 0.96
  });
  markMain(panel, color);
  addBox(group, { size: [L + 0.08, 0.08, W + 0.08], position: [0, H + 0.24, 0], color: frameColor, preset: 'metal' });
  [-L / 2 + 0.08, L / 2 - 0.08].forEach(x => {
    addCylinder(group, { radiusTop: 0.035, height: 0.36, position: [x, 0.18, 0], color: frameColor, preset: 'metal' });
  });
}

function buildTotem(group, item, L, W, H, color) {
  const body = addBox(group, {
    size: [L, H, W],
    position: [0, H / 2, 0],
    color,
    preset: 'fabric',
    opacity: 0.98
  });
  markMain(body, color);
  addBox(group, { size: [L + 0.18, 0.08, W + 0.18], position: [0, 0.04, 0], color: '#6B7280', preset: 'metal' });
}

function buildPodium(group, item, L, W, H, color) {
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.max(0.16, W * 0.38), Math.max(0.2, W * 0.55), H, 4),
    makeStandardMaterial(color, 'matte', 1)
  );
  body.rotation.y = Math.PI / 4;
  body.position.y = H / 2;
  markMain(body, color);
  group.add(body);
  addBox(group, { size: [L * 0.62, 0.04, W * 0.72], position: [0, H + 0.03, 0], color: '#F8FAFC', preset: 'matte' });
}

function buildRunway(group, item, L, W, H, color) {
  const body = addBox(group, {
    size: [L, H, W],
    position: [0, H / 2, 0],
    color,
    preset: 'matte'
  });
  markMain(body, color);
  addBox(group, { size: [L, 0.04, 0.06], position: [0, H + 0.02, W / 2 - 0.03], color: '#D1D5DB', preset: 'metal' });
  addBox(group, { size: [L, 0.04, 0.06], position: [0, H + 0.02, -W / 2 + 0.03], color: '#D1D5DB', preset: 'metal' });
}

function buildBooth(group, item, L, W, H, color) {
  const wallDepth = Math.max(0.05, W * 0.08);
  const shell = addBox(group, {
    size: [L, H, W],
    position: [0, H / 2, 0],
    color,
    preset: 'glass',
    opacity: 0.12
  });
  markMain(shell, color);
  addBox(group, { size: [L, H, wallDepth], position: [0, H / 2, -W / 2 + wallDepth / 2], color, preset: 'matte' });
  addBox(group, { size: [wallDepth, H, W], position: [-L / 2 + wallDepth / 2, H / 2, 0], color, preset: 'matte' });
  addBox(group, { size: [wallDepth, H, W], position: [L / 2 - wallDepth / 2, H / 2, 0], color, preset: 'matte' });
  addBox(group, { size: [L, wallDepth, W], position: [0, H - wallDepth / 2, 0], color: '#111827', preset: 'metal' });
}

function buildPortableToilet(group, item, L, W, H, color) {
  const cabin = addBox(group, {
    size: [L, H, W],
    position: [0, H / 2, 0],
    color,
    preset: 'matte'
  });
  markMain(cabin, color);
  addBox(group, { size: [L + 0.06, 0.08, W + 0.06], position: [0, H + 0.04, 0], color: '#0F172A', preset: 'metal' });
  addBox(group, { size: [L * 0.58, H * 0.5, 0.02], position: [0, H * 0.46, W / 2 + 0.011], color: '#E5E7EB', preset: 'glass', opacity: 0.48 });
}

function buildSinkStation(group, item, L, W, H, color) {
  const base = addBox(group, {
    size: [L, H * 0.82, W],
    position: [0, H * 0.41, 0],
    color,
    preset: 'matte'
  });
  markMain(base, color);
  addBox(group, { size: [L + 0.06, 0.05, W + 0.06], position: [0, H * 0.84, 0], color: '#CBD5E1', preset: 'metal' });
  addCylinder(group, { radiusTop: 0.07, height: 0.24, position: [0, H + 0.06, 0], color: '#94A3B8', preset: 'metal' });
}

function buildGenerator(group, item, L, W, H, color) {
  const body = addBox(group, {
    size: [L, H * 0.78, W],
    position: [0, H * 0.42, 0],
    color,
    preset: 'metal'
  });
  markMain(body, color);
  addBox(group, { size: [L * 0.86, H * 0.12, W * 0.8], position: [0, H * 0.83, 0], color: '#111827', preset: 'matte' });
  [-L * 0.32, L * 0.32].forEach(x => {
    addWheel(group, x, 0.12, -W / 2 - 0.05, 0.1);
    addWheel(group, x, 0.12, W / 2 + 0.05, 0.1);
  });
}

function buildElectricalBox(group, item, L, W, H, color) {
  const body = addBox(group, {
    size: [L, H, W],
    position: [0, H / 2, 0],
    color,
    preset: 'metal'
  });
  markMain(body, color);
  addBox(group, { size: [L * 0.7, H * 0.65, 0.02], position: [0, H * 0.52, W / 2 + 0.011], color: '#E5E7EB', preset: 'glass', opacity: 0.26 });
}

function buildExtinguisher(group, item, H, color) {
  const body = addCylinder(group, {
    radiusTop: 0.12,
    radiusBottom: 0.12,
    height: H,
    position: [0, H / 2, 0],
    color,
    preset: 'matte',
    radialSegments: 18
  });
  markMain(body, color);
  addCylinder(group, { radiusTop: 0.04, height: 0.16, position: [0, H + 0.06, 0], color: '#111827', preset: 'metal' });
  addPolylineTubes(group, [[0, H + 0.02, 0], [0.16, H + 0.08, 0.05], [0.1, H * 0.72, 0.08]], 0.012, '#111827');
}

function buildRecyclingPoint(group, item, L, W, H, color) {
  const segment = L / 3;
  for (let index = 0; index < 3; index += 1) {
    const x = -L / 2 + segment * 0.5 + segment * index;
    const bin = addBox(group, {
      size: [segment * 0.9, H, W],
      position: [x, H / 2, 0],
      color: index === 0 ? '#16A34A' : index === 1 ? '#0EA5E9' : color,
      preset: 'matte'
    });
    if (index === 0) markMain(bin, '#16A34A');
  }
}

function buildTrashContainer(group, item, W, H, color) {
  const body = addCylinder(group, {
    radiusTop: W * 0.46,
    radiusBottom: W * 0.4,
    height: H,
    position: [0, H / 2, 0],
    color,
    preset: 'matte',
    radialSegments: 20
  });
  markMain(body, color);
  addCylinder(group, { radiusTop: W * 0.5, height: 0.08, position: [0, H + 0.04, 0], color: '#111827', preset: 'metal' });
}

function buildSignPanel(group, item, L, W, H, color) {
  const board = addBox(group, {
    size: [L, H, Math.max(0.04, W)],
    position: [0, H / 2 + 0.32, 0],
    color,
    preset: 'glass',
    opacity: 0.82
  });
  markMain(board, color);
  [-L / 2 + 0.08, L / 2 - 0.08].forEach(x => {
    addCylinder(group, { radiusTop: 0.025, height: 0.64, position: [x, 0.32, 0], color: '#6B7280', preset: 'metal' });
  });
}

function buildFence(group, item, L, W, H, color) {
  const shell = addTransparentShell(group, new THREE.BoxGeometry(L, H, W), color, 0.05);
  markMain(shell, color);
  const sections = Math.max(2, Math.round(L / 0.6));
  for (let index = 0; index <= sections; index += 1) {
    const x = -L / 2 + (L * index) / sections;
    addCylinder(group, { radiusTop: 0.018, height: H, position: [x, H / 2, 0], color, preset: 'metal' });
  }
  [H * 0.32, H * 0.68].forEach(y => {
    addBox(group, { size: [L, 0.04, 0.04], position: [0, y, 0], color, preset: 'metal' });
  });
}

function buildInfoPoint(group, item, L, W, H, color) {
  const body = addBox(group, {
    size: [L, H * 0.72, W],
    position: [0, H * 0.36, 0],
    color,
    preset: 'fabric'
  });
  markMain(body, color);
  addBox(group, { size: [L * 0.72, H * 0.24, 0.05], position: [0, H * 0.86, W / 2 + 0.03], color: '#F8FAFC', preset: 'glass', opacity: 0.62 });
}

function buildBarStraight(group, item, L, W, H, color) {
  const counter = addBox(group, {
    size: [L, H * 0.82, W],
    position: [0, H * 0.41, 0],
    color,
    preset: 'matte'
  });
  markMain(counter, color);
  addBox(group, { size: [L + 0.08, 0.06, W + 0.1], position: [0, H + 0.02, 0], color: '#E5E7EB', preset: 'metal' });
  for (let index = 0; index < 4; index += 1) {
    const x = -L / 2 + L * (index + 0.5) / 4;
    addBox(group, { size: [0.05, H * 0.72, 0.03], position: [x, H * 0.38, W / 2 + 0.02], color: '#F8FAFC', preset: 'glass', opacity: 0.38 });
  }
}

function buildFridge(group, item, L, W, H, color) {
  const body = addBox(group, {
    size: [L, H, W],
    position: [0, H / 2, 0],
    color,
    preset: 'metal'
  });
  markMain(body, color);
  addBox(group, { size: [L * 0.78, H * 0.78, 0.03], position: [0, H * 0.54, W / 2 + 0.02], color: '#E5F4FF', preset: 'glass', opacity: 0.24 });
  addBox(group, { size: [0.04, H * 0.52, 0.02], position: [L * 0.24, H * 0.54, W / 2 + 0.03], color: '#64748B', preset: 'metal' });
}

function buildBottleRack(group, item, L, W, H, color) {
  const shell = addTransparentShell(group, new THREE.BoxGeometry(L, H, W), color, 0.06);
  markMain(shell, color);
  const postR = 0.018;
  const x = L / 2 - 0.04;
  const z = W / 2 - 0.04;
  [[-x, -z], [x, -z], [-x, z], [x, z]].forEach(([px, pz]) => {
    addCylinder(group, { radiusTop: postR, height: H, position: [px, H / 2, pz], color, preset: 'metal' });
  });
  [0.32, 0.62].forEach(t => {
    addBox(group, { size: [L, 0.03, W], position: [0, H * t, 0], color: '#CBD5E1', preset: 'metal' });
  });
}

function buildCoffeeMachine(group, item, L, W, H, color) {
  const body = addBox(group, {
    size: [L, H, W],
    position: [0, H / 2, 0],
    color,
    preset: 'metal'
  });
  markMain(body, color);
  addBox(group, { size: [L * 0.78, H * 0.22, W * 0.42], position: [0, H * 0.68, -W * 0.08], color: '#E5E7EB', preset: 'glass', opacity: 0.42 });
  [-L * 0.18, L * 0.18].forEach(x => addCylinder(group, { radiusTop: 0.02, height: 0.16, position: [x, H * 0.26, W * 0.28], color: '#94A3B8', preset: 'metal' }));
}

function buildServiceCart(group, item, L, W, H, color) {
  const shell = addTransparentShell(group, new THREE.BoxGeometry(L, H, W), color, 0.05);
  markMain(shell, color);
  const postR = 0.018;
  const x = L / 2 - 0.05;
  const z = W / 2 - 0.05;
  [[-x, -z], [x, -z], [-x, z], [x, z]].forEach(([px, pz]) => {
    addCylinder(group, { radiusTop: postR, height: H, position: [px, H / 2, pz], color: '#6B7280', preset: 'metal' });
  });
  [0.28, 0.7].forEach(t => addBox(group, { size: [L, 0.04, W], position: [0, H * t, 0], color, preset: 'matte' }));
  [[-x, -z], [x, -z], [-x, z], [x, z]].forEach(([px, pz]) => addWheel(group, px, 0.08, pz, 0.08));
}

function buildStool(group, item, W, H, color) {
  const seat = addCylinder(group, {
    radiusTop: W * 0.45,
    height: 0.06,
    position: [0, H, 0],
    color,
    preset: 'matte',
    radialSegments: 24
  });
  markMain(seat, color);
  const legRadius = 0.018;
  const legOffset = W * 0.28;
  [[-legOffset, -legOffset], [legOffset, -legOffset], [-legOffset, legOffset], [legOffset, legOffset]].forEach(([x, z]) => {
    addCylinder(group, { radiusTop: legRadius, height: H, position: [x, H / 2, z], color: '#6B7280', preset: 'metal' });
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(W * 0.24, 0.012, 8, 24),
    makeStandardMaterial('#6B7280', 'metal', 1)
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = H * 0.42;
  group.add(ring);
}

function buildDrinkDispenser(group, item, W, H, color) {
  const body = addCylinder(group, {
    radiusTop: W * 0.42,
    radiusBottom: W * 0.4,
    height: H,
    position: [0, H / 2 + 0.18, 0],
    color,
    preset: 'glass',
    opacity: 0.72,
    radialSegments: 24
  });
  markMain(body, color);
  addBox(group, { size: [W * 0.76, 0.08, W * 0.76], position: [0, 0.04, 0], color: '#6B7280', preset: 'metal' });
  addBox(group, { size: [0.08, 0.05, 0.16], position: [W * 0.18, H * 0.42, W * 0.42], color: '#6B7280', preset: 'metal' });
}

function buildShowcase(group, item, L, W, H, color) {
  const baseH = H * 0.32;
  const base = addBox(group, {
    size: [L, baseH, W],
    position: [0, baseH / 2, 0],
    color,
    preset: 'matte'
  });
  markMain(base, color);
  addBox(group, { size: [L, H * 0.66, W], position: [0, baseH + H * 0.33, 0], color: '#F8FAFC', preset: 'glass', opacity: 0.2 });
}

function buildFoldingScreen(group, item, L, W, H, color) {
  const panelW = L / 3;
  [-panelW, 0, panelW].forEach((x, index) => {
    const panel = addBox(group, {
      size: [panelW * 0.94, H, Math.max(0.04, W)],
      position: [x, H / 2, 0],
      color,
      preset: 'fabric'
    });
    if (index === 1) markMain(panel, color);
    panel.rotation.y = index === 0 ? -0.28 : index === 2 ? 0.28 : 0;
  });
}

function buildFlowerPanel(group, item, L, W, H, color) {
  const board = addBox(group, {
    size: [L, H, Math.max(0.06, W)],
    position: [0, H / 2, 0],
    color,
    preset: 'matte'
  });
  markMain(board, color);
  const flowerColors = ['#16A34A', '#F472B6', '#F59E0B', '#84CC16'];
  for (let index = 0; index < 10; index += 1) {
    const radius = 0.08 + (index % 3) * 0.03;
    addSphere(group, {
      radius,
      position: [
        -L / 2 + 0.25 + (index % 5) * (L / 5),
        H * 0.25 + Math.floor(index / 5) * (H * 0.28),
        W / 2 + 0.05
      ],
      color: flowerColors[index % flowerColors.length],
      preset: 'matte'
    });
  }
}

function buildLedPanel(group, item, L, W, H, color) {
  const panel = addBox(group, {
    size: [L, H, Math.max(0.04, W)],
    position: [0, H / 2 + 0.18, 0],
    color,
    preset: 'glass',
    opacity: 0.88
  });
  markMain(panel, color);
  addSphere(group, { radius: 0.1, position: [0, H * 0.72, W / 2 + 0.05], color: '#38BDF8', emissive: true });
  [-L / 2 + 0.08, L / 2 - 0.08].forEach(x => addCylinder(group, { radiusTop: 0.03, height: 0.36, position: [x, 0.18, 0], color: '#6B7280', preset: 'metal' }));
}

function buildPhotocall(group, item, L, W, H, color) {
  const banner = addBox(group, {
    size: [L, H, Math.max(0.03, W)],
    position: [0, H / 2 + 0.18, 0],
    color,
    preset: 'fabric'
  });
  markMain(banner, color);
  const x = L / 2 - 0.08;
  addCylinder(group, { radiusTop: 0.028, height: H + 0.36, position: [-x, (H + 0.36) / 2, 0], color: '#6B7280', preset: 'metal' });
  addCylinder(group, { radiusTop: 0.028, height: H + 0.36, position: [x, (H + 0.36) / 2, 0], color: '#6B7280', preset: 'metal' });
  addBox(group, { size: [L + 0.12, 0.04, 0.04], position: [0, H + 0.36, 0], color: '#6B7280', preset: 'metal' });
}

function buildDecorArch(group, item, L, W, H, color) {
  const shell = addTransparentShell(group, new THREE.BoxGeometry(L, H, W), color, 0.05);
  markMain(shell, color);
  const tubeRadius = Math.max(0.03, W * 0.08);
  const leftBase = new THREE.Vector3(-L / 2, 0, 0);
  const leftTop = new THREE.Vector3(-L / 2, H * 0.65, 0);
  const rightBase = new THREE.Vector3(L / 2, 0, 0);
  const rightTop = new THREE.Vector3(L / 2, H * 0.65, 0);
  group.add(tubeBetween(leftBase, leftTop, tubeRadius, color, 'metal'));
  group.add(tubeBetween(rightBase, rightTop, tubeRadius, color, 'metal'));
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(L / 2, tubeRadius, 12, 42, Math.PI),
    makeStandardMaterial(color, 'metal', 1)
  );
  ring.rotation.z = Math.PI;
  ring.position.y = H * 0.65;
  group.add(ring);
}

function buildGiantLetters(group, item, L, W, H, color) {
  const segments = 4;
  const glyphW = L / segments;
  for (let index = 0; index < segments; index += 1) {
    const body = addBox(group, {
      size: [glyphW * 0.72, H, W],
      position: [-L / 2 + glyphW * (index + 0.5), H / 2, 0],
      color,
      preset: 'matte'
    });
    if (index === 1) markMain(body, color);
  }
}

function buildNeonSign(group, item, L, W, H, color) {
  const back = addBox(group, {
    size: [L, H, Math.max(0.02, W)],
    position: [0, H / 2, 0],
    color: '#111827',
    preset: 'matte'
  });
  markMain(back, '#111827');
  const neon = new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(0.18, L * 0.18), 0.04, 10, 48, Math.PI * 1.35),
    new THREE.MeshStandardMaterial({
      color: colorNumber(color),
      emissive: colorNumber(color),
      emissiveIntensity: 1.15,
      roughness: 0.15
    })
  );
  neon.position.set(0, H * 0.56, W / 2 + 0.04);
  neon.rotation.z = -0.25;
  group.add(neon);
}

function buildGenericRect(item, view) {
  const group = new THREE.Group();
  const W = item.dims?.width ?? 1.2;
  const L = item.dims?.length ?? 1.2;
  const H = item.dims?.height ?? 1.2;
  const color = item.color || '#B6B1A9';
  const profile = inferRectProfile(item);

  if (view === 'top') {
    addTopFootprint(group, item, L, W, color, item.visual?.opacity ?? 0.2);
    return group;
  }

  switch (profile) {
    case 'trussBox':
      buildTrussBox(group, item, L, W, H, color);
      break;
    case 'trussTri':
      buildTrussTri(group, item, L, W, H, color);
      break;
    case 'screen':
      buildScreen(group, item, L, W, H, color);
      break;
    case 'totem':
      buildTotem(group, item, L, W, H, color);
      break;
    case 'podium':
      buildPodium(group, item, L, W, H, color);
      break;
    case 'runway':
      buildRunway(group, item, L, W, H, color);
      break;
    case 'booth':
      buildBooth(group, item, L, W, H, color);
      break;
    case 'portableToilet':
      buildPortableToilet(group, item, L, W, H, color);
      break;
    case 'sinkStation':
      buildSinkStation(group, item, L, W, H, color);
      break;
    case 'generator':
      buildGenerator(group, item, L, W, H, color);
      break;
    case 'electricalBox':
      buildElectricalBox(group, item, L, W, H, color);
      break;
    case 'extinguisher':
      buildExtinguisher(group, item, H, color);
      break;
    case 'recyclingPoint':
      buildRecyclingPoint(group, item, L, W, H, color);
      break;
    case 'trashContainer':
      buildTrashContainer(group, item, W, H, color);
      break;
    case 'signPanel':
      buildSignPanel(group, item, L, W, H, color);
      break;
    case 'fence':
      buildFence(group, item, L, W, H, color);
      break;
    case 'infoPoint':
      buildInfoPoint(group, item, L, W, H, color);
      break;
    case 'barStraight':
      buildBarStraight(group, item, L, W, H, color);
      break;
    case 'fridge':
      buildFridge(group, item, L, W, H, color);
      break;
    case 'bottleRack':
      buildBottleRack(group, item, L, W, H, color);
      break;
    case 'coffeeMachine':
      buildCoffeeMachine(group, item, L, W, H, color);
      break;
    case 'serviceCart':
      buildServiceCart(group, item, L, W, H, color);
      break;
    case 'stool':
      buildStool(group, item, W, H, color);
      break;
    case 'drinkDispenser':
      buildDrinkDispenser(group, item, W, H, color);
      break;
    case 'showcase':
      buildShowcase(group, item, L, W, H, color);
      break;
    case 'foldingScreen':
      buildFoldingScreen(group, item, L, W, H, color);
      break;
    case 'flowerPanel':
      buildFlowerPanel(group, item, L, W, H, color);
      break;
    case 'ledPanel':
      buildLedPanel(group, item, L, W, H, color);
      break;
    case 'photocall':
      buildPhotocall(group, item, L, W, H, color);
      break;
    case 'decorArch':
      buildDecorArch(group, item, L, W, H, color);
      break;
    case 'giantLetters':
      buildGiantLetters(group, item, L, W, H, color);
      break;
    case 'neonSign':
      buildNeonSign(group, item, L, W, H, color);
      break;
    default: {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(L, H, W),
        makeStandardMaterial(color, item.visual?.materialPreset || 'matte', item.visual?.opacity ?? 1)
      );
      body.position.y = H / 2 + (item.y || 0);
      body.castShadow = item.visual?.shadows !== false;
      markMain(body, color);
      group.add(body);
    }
  }

  addLabel(group, item.labelText, H + 0.45);
  return group;
}

function buildCurvedBar(group, diameter, height, color) {
  const radius = diameter / 2;
  const arc = Math.PI * 0.72;
  const start = Math.PI * 0.14;
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 44, 1, false, start, arc),
    makeStandardMaterial(color, 'matte', 0.96)
  );
  shell.position.y = height / 2;
  markMain(shell, color);
  group.add(shell);
  const top = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.74, 0.12, 10, 48, arc),
    makeStandardMaterial('#E5E7EB', 'metal', 1)
  );
  top.rotation.x = Math.PI / 2;
  top.rotation.z = start;
  top.position.y = height + 0.02;
  group.add(top);
}

function buildVase(group, diameter, height, color) {
  const profile = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(diameter * 0.18, 0.08),
    new THREE.Vector2(diameter * 0.3, height * 0.18),
    new THREE.Vector2(diameter * 0.16, height * 0.52),
    new THREE.Vector2(diameter * 0.26, height * 0.78),
    new THREE.Vector2(diameter * 0.1, height)
  ];
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 24),
    makeStandardMaterial(color, 'glass', 0.72)
  );
  markMain(body, color);
  group.add(body);
}

function buildCenterpiece(group, diameter, height, color) {
  const base = addCylinder(group, {
    radiusTop: diameter * 0.26,
    height: height * 0.32,
    position: [0, height * 0.16, 0],
    color: '#8B5E3C',
    preset: 'matte'
  });
  markMain(base, '#8B5E3C');
  ['#F472B6', '#FB7185', color, '#84CC16'].forEach((flowerColor, index) => {
    addSphere(group, {
      radius: diameter * 0.18,
      position: [
        (index % 2 === 0 ? -1 : 1) * diameter * 0.12,
        height * 0.56 + (index > 1 ? diameter * 0.08 : 0),
        index < 2 ? diameter * 0.08 : -diameter * 0.08
      ],
      color: flowerColor,
      preset: 'matte'
    });
  });
}

function buildCandelabra(group, diameter, height, color) {
  const base = addCylinder(group, {
    radiusTop: diameter * 0.2,
    height: 0.08,
    position: [0, 0.04, 0],
    color,
    preset: 'metal'
  });
  markMain(base, color);
  addCylinder(group, { radiusTop: 0.03, height: height, position: [0, height / 2, 0], color, preset: 'metal' });
  [-0.16, 0, 0.16].forEach(x => {
    addCylinder(group, { radiusTop: 0.016, height: 0.18, position: [x, height, 0], color, preset: 'metal' });
    addSphere(group, { radius: 0.05, position: [x, height + 0.12, 0], color: '#FCD34D', emissive: true });
  });
}

function buildPedestal(group, diameter, height, color) {
  const body = addCylinder(group, {
    radiusTop: diameter * 0.34,
    radiusBottom: diameter * 0.4,
    height,
    position: [0, height / 2, 0],
    color,
    preset: 'matte',
    radialSegments: 20
  });
  markMain(body, color);
}

function buildIceBucket(group, diameter, height, color) {
  const body = addCylinder(group, {
    radiusTop: diameter * 0.42,
    radiusBottom: diameter * 0.34,
    height,
    position: [0, height / 2, 0],
    color,
    preset: 'glass',
    opacity: 0.62,
    radialSegments: 20
  });
  markMain(body, color);
  addCylinder(group, { radiusTop: diameter * 0.48, height: 0.04, position: [0, height + 0.02, 0], color: '#CBD5E1', preset: 'metal' });
}

function buildGenericRound(item, view) {
  const group = new THREE.Group();
  const diameter = item.dims?.diameter ?? 1.5;
  const height = item.dims?.height ?? 0.8;
  const color = item.color || '#B6B1A9';
  const profile = inferRoundProfile(item);
  if (view === 'top') {
    const fill = new THREE.Mesh(new THREE.CircleGeometry(diameter / 2, 72), makeTopFill(color, item.visual?.opacity ?? 0.2));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    markMain(fill, color);
    group.add(fill);
    if (item.labelText) addTopLabel(group, item.labelText);
    return group;
  }

  switch (profile) {
    case 'curvedBar':
      buildCurvedBar(group, diameter, height, color);
      break;
    case 'vase':
      buildVase(group, diameter, height, color);
      break;
    case 'centerpiece':
      buildCenterpiece(group, diameter, height, color);
      break;
    case 'candelabra':
      buildCandelabra(group, diameter, height, color);
      break;
    case 'pedestal':
      buildPedestal(group, diameter, height, color);
      break;
    case 'iceBucket':
      buildIceBucket(group, diameter, height, color);
      break;
    default: {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, 56),
        makeStandardMaterial(color, item.visual?.materialPreset || 'matte', item.visual?.opacity ?? 1)
      );
      body.position.y = height / 2;
      body.castShadow = item.visual?.shadows !== false;
      markMain(body, color);
      group.add(body);
    }
  }

  addLabel(group, item.labelText, height + 0.45);
  return group;
}

function buildSurface(item, view) {
  const group = new THREE.Group();
  const W = item.dims?.width ?? 3;
  const L = item.dims?.length ?? 3;
  const color = item.color || '#6F8E57';
  const borderColor = item.borderColor || '#2F5A29';
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    view === 'top'
      ? makeTopFill(color, item.visual?.opacity ?? 0.65)
      : makeStandardMaterial(color, item.visual?.materialPreset || 'matte', item.visual?.opacity ?? 0.92)
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = view === 'top' ? 0.04 : 0.01;
  fill.receiveShadow = true;
  markMain(fill, color);
  group.add(fill);

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(L, W)),
    new THREE.LineBasicMaterial({ color: colorNumber(borderColor), transparent: true, opacity: 0.58 })
  );
  border.rotation.x = -Math.PI / 2;
  border.position.y = fill.position.y + 0.002;
  group.add(border);
  if (item.labelText) addTopLabel(group, item.labelText);
  return group;
}

function buildStandingPerson(group, item, height, color, accent) {
  const torsoH = height * 0.48;
  const legH = height * 0.32;
  const headR = Math.max(0.1, height * 0.095);
  const torso = addCylinder(group, {
    radiusTop: 0.14,
    radiusBottom: 0.16,
    height: torsoH,
    position: [0, legH + torsoH / 2, 0],
    color,
    preset: 'matte',
    radialSegments: 16
  });
  markMain(torso, color);
  addSphere(group, { radius: headR, position: [0, legH + torsoH + headR * 1.12, 0], color: accent, preset: 'matte' });
  [-0.08, 0.08].forEach(x => addCylinder(group, {
    radiusTop: 0.036,
    height: legH,
    position: [x, legH / 2, 0],
    color,
    preset: 'matte',
    radialSegments: 12
  }));
}

function buildSeatedPerson(group, item, height, color, accent) {
  const seatH = Math.max(0.42, height * 0.4);
  const torsoH = Math.max(0.34, height * 0.28);
  const seat = addBox(group, {
    size: [0.34, 0.06, 0.34],
    position: [0, seatH - 0.03, 0.02],
    color: '#64748B',
    preset: 'metal'
  });
  seat.userData.skipTopStroke = true;
  const torso = addBox(group, {
    size: [0.24, torsoH, 0.18],
    position: [0, seatH + torsoH / 2, -0.03],
    color,
    preset: 'matte'
  });
  markMain(torso, color);
  addSphere(group, { radius: 0.11, position: [0, seatH + torsoH + 0.14, -0.03], color: accent, preset: 'matte' });
  [-0.07, 0.07].forEach(x => addCylinder(group, {
    radiusTop: 0.028,
    height: 0.22,
    position: [x, seatH - 0.11, 0.12],
    color,
    preset: 'matte',
    radialSegments: 10
  }));
}

function buildPerson(item, view) {
  const group = new THREE.Group();
  const height = item.dims?.height ?? 1.75;
  const color = item.color || '#2C2C31';
  const accent = item.accentColor || '#D9D4CC';
  const pose = inferPersonPose(item);
  try {
    if (view === 'top') {
      const body = new THREE.Mesh(new THREE.CircleGeometry(pose === 'seated' ? 0.26 : 0.22, 36), makeTopFill(accent, 0.28));
      body.rotation.x = -Math.PI / 2;
      body.position.y = 0.04;
      markMain(body, accent);
      group.add(body);
      const head = new THREE.Mesh(new THREE.CircleGeometry(0.1, 28), makeTopFill(color, 0.8));
      head.rotation.x = -Math.PI / 2;
      head.position.set(0, 0.042, pose === 'seated' ? -0.08 : -0.14);
      group.add(head);
      return group;
    }

    if (pose === 'seated') buildSeatedPerson(group, item, height, color, accent);
    else buildStandingPerson(group, item, height, color, accent);
    return group;
  } catch (error) {
    console.error('[SchemaBuilders] buildPerson failed', {
      catalogDefinitionId: item.catalogDefinitionId || '',
      labelText: item.labelText || '',
      pose,
      view,
      dims: item.dims || {},
      error
    });
    throw error;
  }
}

function buildArrow(item) {
  const group = new THREE.Group();
  const W = item.dims?.width ?? 1.2;
  const L = item.dims?.length ?? 2.2;
  const color = item.color || '#111827';
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, -W / 3);
  shape.lineTo(0, -W / 3);
  shape.lineTo(0, -W / 2);
  shape.lineTo(L / 2, 0);
  shape.lineTo(0, W / 2);
  shape.lineTo(0, W / 3);
  shape.lineTo(-L / 2, W / 3);
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    makeTopFill(color, item.visual?.opacity ?? 0.9)
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  markMain(mesh, color);
  group.add(mesh);
  if (item.labelText) {
    addTopPlainText(group, item.labelText, {
      color: item.textColor || '#FFFFFF',
      fontSize: item.display?.textSize ?? 34,
      width: Math.max(4.2, L * 1.75),
      height: Math.max(1.05, W * 0.95)
    });
  }
  return group;
}

function buildSpotlight(group, item, height, color, lightColor) {
  addCylinder(group, { radiusTop: 0.04, height: height * 0.6, position: [0, height * 0.3, 0], color, preset: 'metal' });
  addBox(group, { size: [0.28, 0.12, 0.18], position: [0, height * 0.72, 0], color, preset: 'metal' });
  const head = addCylinder(group, {
    radiusTop: 0.11,
    height: 0.18,
    position: [0, height * 0.72, 0.12],
    color,
    preset: 'metal',
    radialSegments: 18,
    rotation: [Math.PI / 2, 0, 0]
  });
  markMain(head, color);
  addSphere(group, { radius: 0.06, position: [0, height * 0.72, 0.2], color: lightColor, emissive: true });
}

function buildTowerLight(group, item, height, color, lightColor) {
  buildTrussBox(group, item, 0.42, 0.42, height, color);
  addBox(group, { size: [0.34, 0.12, 0.22], position: [0, height + 0.12, 0], color, preset: 'metal' });
  addSphere(group, { radius: 0.08, position: [0, height + 0.12, 0.16], color: lightColor, emissive: true });
}

function buildStringLights(group, item, height, color, lightColor) {
  const postX = Math.max(0.8, (item.dims?.length ?? 0.6) * 0.8);
  [-postX, postX].forEach(x => addCylinder(group, { radiusTop: 0.03, height, position: [x, height / 2, 0], color, preset: 'metal' }));
  const cablePoints = [];
  const segments = 6;
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const x = -postX + t * postX * 2;
    const y = height - Math.sin(Math.PI * t) * 0.18;
    cablePoints.push([x, y, 0]);
  }
  addPolylineTubes(group, cablePoints, 0.01, color);
  for (let index = 1; index < cablePoints.length - 1; index += 1) {
    const point = cablePoints[index];
    addSphere(group, { radius: 0.045, position: [point[0], point[1] - 0.08, 0], color: lightColor, emissive: true });
  }
  if (group.children[0]) markMain(group.children[0], color);
}

function buildUplight(group, item, height, color, lightColor) {
  const base = addBox(group, { size: [0.24, Math.max(0.18, height * 0.22), 0.24], position: [0, Math.max(0.09, height * 0.11), 0], color, preset: 'metal' });
  markMain(base, color);
  addSphere(group, { radius: 0.14, position: [0, Math.max(0.18, height * 0.22), 0], color: lightColor, emissive: true });
}

function buildMovingHead(group, item, height, color, lightColor) {
  const base = addBox(group, { size: [0.28, height * 0.32, 0.28], position: [0, height * 0.16, 0], color, preset: 'metal' });
  markMain(base, color);
  addBox(group, { size: [0.08, height * 0.22, 0.08], position: [-0.1, height * 0.44, 0], color, preset: 'metal' });
  addBox(group, { size: [0.08, height * 0.22, 0.08], position: [0.1, height * 0.44, 0], color, preset: 'metal' });
  const head = addBox(group, { size: [0.26, height * 0.18, 0.18], position: [0, height * 0.6, 0.02], color, preset: 'metal' });
  addSphere(group, { radius: 0.06, position: [0, height * 0.6, 0.14], color: lightColor, emissive: true });
  head.rotation.x = -0.35;
}

function buildLaser(group, item, height, color, lightColor) {
  const base = addBox(group, { size: [0.34, height * 0.26, 0.28], position: [0, height * 0.13, 0], color, preset: 'metal' });
  markMain(base, color);
  const head = addBox(group, { size: [0.22, height * 0.12, 0.26], position: [0, height * 0.34, 0], color, preset: 'metal' });
  head.rotation.x = -0.2;
  addSphere(group, { radius: 0.04, position: [0, height * 0.34, 0.16], color: lightColor, emissive: true });
}

function buildLogoProjector(group, item, height, color, lightColor) {
  addCylinder(group, { radiusTop: 0.04, height: height * 0.72, position: [0, height * 0.36, 0], color, preset: 'metal' });
  const head = addCylinder(group, {
    radiusTop: 0.12,
    height: 0.24,
    position: [0, height * 0.78, 0],
    color,
    preset: 'metal',
    radialSegments: 18,
    rotation: [0, 0, Math.PI / 2]
  });
  markMain(head, color);
  addSphere(group, { radius: 0.045, position: [0.14, height * 0.78, 0], color: lightColor, emissive: true });
}

function buildBollard(group, item, height, color, lightColor) {
  const body = addCylinder(group, {
    radiusTop: 0.12,
    radiusBottom: 0.16,
    height,
    position: [0, height / 2, 0],
    color,
    preset: 'metal'
  });
  markMain(body, color);
  addSphere(group, { radius: 0.08, position: [0, height - 0.04, 0], color: lightColor, emissive: true });
}

function buildLightCurtain(group, item, height, color, lightColor) {
  const width = Math.max(0.8, item.dims?.width ?? 0.6);
  addBox(group, { size: [width, 0.05, 0.05], position: [0, height, 0], color, preset: 'metal' });
  const lines = 5;
  for (let index = 0; index < lines; index += 1) {
    const x = -width / 2 + width * index / (lines - 1);
    addCylinder(group, { radiusTop: 0.008, height: height * 0.92, position: [x, height * 0.54, 0], color, preset: 'metal' });
    [0.3, 0.54, 0.78].forEach(t => addSphere(group, { radius: 0.03, position: [x, height * t, 0], color: lightColor, emissive: true }));
  }
  if (group.children[0]) markMain(group.children[0], color);
}

function buildLighting(item, view) {
  const group = new THREE.Group();
  const height = item.dims?.height ?? 2.5;
  const color = item.color || '#111827';
  const lightColor = item.lightColor || '#FFE8A3';
  const profile = inferLightingProfile(item);
  if (view === 'top') {
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.18, 30), makeTopFill(color, 0.9));
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.04;
    markMain(base, color);
    group.add(base);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(0.42, 42), makeTopFill(lightColor, 0.28));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.041;
    group.add(halo);
    return group;
  }

  switch (profile) {
    case 'towerLight':
      buildTowerLight(group, item, height, color, lightColor);
      break;
    case 'stringLights':
      buildStringLights(group, item, height, color, lightColor);
      break;
    case 'uplight':
      buildUplight(group, item, height, color, lightColor);
      break;
    case 'movingHead':
      buildMovingHead(group, item, height, color, lightColor);
      break;
    case 'laser':
      buildLaser(group, item, height, color, lightColor);
      break;
    case 'logoProjector':
      buildLogoProjector(group, item, height, color, lightColor);
      break;
    case 'bollard':
      buildBollard(group, item, height, color, lightColor);
      break;
    case 'lightCurtain':
      buildLightCurtain(group, item, height, color, lightColor);
      break;
    default:
      buildSpotlight(group, item, height, color, lightColor);
      break;
  }
  addLabel(group, item.labelText, height + 0.35, '#111827');
  return group;
}

function buildSofa(item, view) {
  const group = new THREE.Group();
  const W = item.dims?.width ?? 1.4;
  const D = item.dims?.length ?? 0.9;
  const H = item.dims?.height ?? 0.82;
  const color = item.color || '#CFC7BC';
  const accent = item.accentColor || '#8B5E3C';

  if (view === 'top') {
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(W, D), makeTopFill(color, 0.26));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    markMain(fill, color);
    group.add(fill);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.12), makeTopFill(accent, 0.9));
    back.rotation.x = -Math.PI / 2;
    back.position.set(0, 0.041, D / 2 - 0.06);
    group.add(back);
    return group;
  }

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(W, H * 0.45, D),
    makeStandardMaterial(color, 'fabric', 1)
  );
  base.position.y = H * 0.22;
  base.castShadow = true;
  markMain(base, color);
  group.add(base);

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(W, H * 0.4, D * 0.16),
    makeStandardMaterial(color, 'fabric', 1)
  );
  back.position.set(0, H * 0.52, D / 2 - D * 0.08);
  group.add(back);

  const armGeo = new THREE.BoxGeometry(W * 0.12, H * 0.32, D * 0.82);
  [-W / 2 + W * 0.06, W / 2 - W * 0.06].forEach(x => {
    const arm = new THREE.Mesh(armGeo, makeStandardMaterial(accent, 'matte', 1));
    arm.position.set(x, H * 0.28, 0);
    group.add(arm);
  });
  addLabel(group, item.labelText, H + 0.35);
  return group;
}

export const SCHEMA_BUILDERS = {
  roundTableBanquet: buildRoundTable,
  chairDining: buildChair,
  chairLine: buildChairLine,
  buffetStation: buildBuffet,
  stagePlatform: buildStage,
  genericRectProp: buildGenericRect,
  genericRoundProp: buildGenericRound,
  genericSurface: buildSurface,
  genericPerson: buildPerson,
  arrow2D: buildArrow,
  genericLighting: buildLighting,
  sofaSeat: buildSofa
};

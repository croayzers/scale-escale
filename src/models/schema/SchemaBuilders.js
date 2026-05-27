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

function annularSectorShape(innerRadius, outerRadius, angle, startAngle = -angle / 2) {
  const shape = new THREE.Shape();
  const endAngle = startAngle + angle;
  const segments = Math.max(18, Math.ceil((angle * 180) / Math.PI / 4));

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const theta = startAngle + (endAngle - startAngle) * t;
    const x = Math.cos(theta) * outerRadius;
    const y = Math.sin(theta) * outerRadius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }

  for (let index = segments; index >= 0; index -= 1) {
    const t = index / segments;
    const theta = startAngle + (endAngle - startAngle) * t;
    shape.lineTo(Math.cos(theta) * innerRadius, Math.sin(theta) * innerRadius);
  }

  shape.closePath();
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
    case 'tarima_curva': return 'curvedPlatform';
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
    case 'coche':       return 'coche';
    case 'moto':        return 'moto';
    case 'camion':      return 'camion';
    case 'avioneta':    return 'avioneta';
    case 'barco':       return 'barco';
    case 'helicoptero': return 'helicoptero';
    case 'escalera':    return 'escalera';
    case 'mesa_dj':     return 'mesaDJ';
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

  // Counter top
  addBox(group, {
    size: [L + 0.04, 0.05, W + 0.04],
    position: [0, H + 0.02, 0],
    color: '#6B6864',
    preset: 'matte'
  });

  // Toldo / awning
  const toldoColor = item.toldoColor || '#C8A87A';
  const postH = 0.85;
  const awningW = W + 0.35;
  const awningL = L + 0.08;
  const awningY = H + postH;
  // Two rear support posts
  [-(L / 2 - 0.06), (L / 2 - 0.06)].forEach(x => {
    addBox(group, { size: [0.04, postH, 0.04], position: [x, H + postH / 2, W / 2 - 0.03], color: toldoColor, preset: 'matte' });
  });
  // Awning roof panel (slightly angled — front lower than back)
  const awning = addBox(group, {
    size: [awningL, 0.06, awningW],
    position: [0, awningY, (awningW - W) / 2 - 0.05],
    color: toldoColor,
    preset: 'fabric'
  });
  awning.rotation.x = 0.15;  // slight forward pitch

  // Valance / front edge strip
  addBox(group, {
    size: [awningL, 0.22, 0.03],
    position: [0, awningY - 0.12, -(awningW / 2) + 0.02],
    color: toldoColor,
    preset: 'fabric'
  });

  addLabel(group, item.labelText || item.subtype || 'Buffet', awningY + 0.45);
  return group;
}

function buildBuffetCarrito(item, view) {
  const group = new THREE.Group();
  const L = item.dims?.length ?? 1.2;
  const W = item.dims?.width ?? 0.7;
  const H = item.dims?.height ?? 0.9;
  const color = item.color || '#E0DDD8';
  const metal = '#9CA3AF';

  if (view === 'top') {
    addTopFootprint(group, item, L, W, color, 0.15);
    addTopLabel(group, item.labelText || 'Carrito');
    return group;
  }

  // lower shelf
  const shelf1 = addBox(group, { size: [L, 0.03, W], position: [0, H * 0.28, 0], color: '#D1CEC9', preset: 'matte' });
  markMain(shelf1, color);

  // upper shelf / tray
  const shelf2 = addBox(group, { size: [L, 0.03, W], position: [0, H * 0.62, 0], color: '#D1CEC9', preset: 'matte' });
  markMain(shelf2, color);

  // top surface
  addBox(group, { size: [L + 0.02, 0.025, W + 0.02], position: [0, H, 0], color: '#C8C4BE', preset: 'matte' });

  // 4 corner legs
  const lh = H;
  const offX = L / 2 - 0.04;
  const offZ = W / 2 - 0.04;
  [[offX, offZ], [-offX, offZ], [offX, -offZ], [-offX, -offZ]].forEach(([x, z]) => {
    addBox(group, { size: [0.03, lh, 0.03], position: [x, lh / 2, z], color: metal, preset: 'metal' });
  });

  // small wheels
  [[offX, offZ], [-offX, offZ], [offX, -offZ], [-offX, -offZ]].forEach(([x, z]) => {
    addSphere(group, { radius: 0.035, position: [x, 0.035, z], color: '#374151', preset: 'matte' });
  });

  addLabel(group, item.labelText || 'Carrito', H + 0.35);
  return group;
}

function buildBuffetCarro(item, view) {
  const group = new THREE.Group();
  const L = item.dims?.length ?? 3;
  const W = item.dims?.width ?? 1.5;
  const H = item.dims?.height ?? 1.0;
  const color = item.color || '#E8E4DF';
  const accent = '#4B5563';

  if (view === 'top') {
    addTopFootprint(group, item, L, W, color, 0.18);
    addTopLabel(group, item.labelText || 'Buffet carro');
    return group;
  }

  // base frame
  const base = addBox(group, { size: [L, 0.08, W], position: [0, 0.08, 0], color: accent, preset: 'matte' });
  markMain(base, color);

  // main body / shelf unit
  const body = addBox(group, { size: [L, H * 0.55, W * 0.92], position: [0, H * 0.28 + 0.08, 0], color, preset: 'fabric' });
  markMain(body, color);

  // top tray surface
  addBox(group, { size: [L + 0.04, 0.05, W + 0.04], position: [0, H * 0.58 + 0.08, 0], color: '#D1D5DB', preset: 'matte' });

  // mid shelf
  addBox(group, { size: [L - 0.06, 0.03, W * 0.88], position: [0, H * 0.38, 0], color: '#D4D0CB', preset: 'matte' });

  // back panel / sneeze guard frame
  addBox(group, { size: [L, H * 0.38, 0.025], position: [0, H * 0.62 + 0.12, W / 2 - 0.015], color: '#B0CAD8', preset: 'glass' });

  // legs (4 corners)
  const lh = 0.18;
  const offX = L / 2 - 0.08;
  const offZ = W / 2 - 0.08;
  [[offX, offZ], [-offX, offZ], [offX, -offZ], [-offX, -offZ]].forEach(([x, z]) => {
    addBox(group, { size: [0.05, lh, 0.05], position: [x, lh / 2, z], color: accent, preset: 'metal' });
  });

  // wheel hubs (bottom)
  [[offX, offZ], [-offX, offZ], [offX, -offZ], [-offX, -offZ]].forEach(([x, z]) => {
    addSphere(group, { radius: 0.045, position: [x, 0.045, z], color: '#374151', preset: 'matte' });
  });

  addLabel(group, item.labelText || 'Buffet carro', H + 0.45);
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

function buildCoche(group, item, L, W, H, color) {
  const bH = H * 0.50;
  const body = addBox(group, { size: [L, bH, W], position: [0, bH / 2, 0], color, preset: 'matte' });
  markMain(body, color);
  addBox(group, { size: [L * 0.48, H - bH, W * 0.88], position: [-L * 0.04, bH + (H - bH) / 2, 0], color, preset: 'matte' });
  addBox(group, { size: [0.06, (H - bH) * 0.72, W * 0.82], position: [L * 0.19, bH + (H - bH) * 0.36, 0], color: '#9EC8EE', preset: 'glass', opacity: 0.52 });
  addBox(group, { size: [0.06, (H - bH) * 0.72, W * 0.82], position: [-L * 0.26, bH + (H - bH) * 0.36, 0], color: '#9EC8EE', preset: 'glass', opacity: 0.52 });
  [-W * 0.28, W * 0.28].forEach(z =>
    addBox(group, { size: [0.06, 0.1, 0.16], position: [L / 2 - 0.04, bH * 0.58, z], color: '#FFFDE7', preset: 'glass', opacity: 0.9 })
  );
  const wr = H * 0.22;
  const wt = wr * 0.52;
  [[L * 0.3, W / 2 + wt / 2], [L * 0.3, -(W / 2 + wt / 2)],
   [-L * 0.3, W / 2 + wt / 2], [-L * 0.3, -(W / 2 + wt / 2)]].forEach(([wx, wz]) => {
    addWheel(group, wx, wr, wz, wr, '#1C1C1E');
    addCylinder(group, { radiusTop: wr * 0.44, height: 0.02, position: [wx, wr, wz + (wz > 0 ? -wt * 0.4 : wt * 0.4)], color: '#94A3B8', preset: 'metal', radialSegments: 14, rotation: [Math.PI / 2, 0, 0] });
  });
}

function buildMoto(group, item, L, W, H, color) {
  const wr = H * 0.3;
  const frameW = Math.min(W * 0.28, 0.22);
  addBox(group, { size: [L * 0.32, H * 0.32, frameW], position: [0, wr * 1.1, 0], color: '#374151', preset: 'metal' });
  const frame = addBox(group, { size: [L * 0.54, 0.08, 0.06], position: [-L * 0.04, wr + H * 0.28, 0], color, preset: 'metal' });
  markMain(frame, color);
  addBox(group, { size: [L * 0.24, H * 0.18, frameW * 1.4], position: [L * 0.08, wr + H * 0.36, 0], color, preset: 'matte' });
  addBox(group, { size: [L * 0.26, 0.08, frameW * 1.6], position: [-L * 0.08, wr + H * 0.44, 0], color: '#111827', preset: 'matte' });
  addBox(group, { size: [0.06, 0.06, W * 0.78], position: [L * 0.3, wr + H * 0.5, 0], color: '#94A3B8', preset: 'metal' });
  addBox(group, { size: [0.04, wr * 0.9, 0.04], position: [L * 0.36, wr * 0.64, frameW * 0.4], color: '#9CA3AF', preset: 'metal' });
  addBox(group, { size: [0.04, wr * 0.9, 0.04], position: [L * 0.36, wr * 0.64, -frameW * 0.4], color: '#9CA3AF', preset: 'metal' });
  addBox(group, { size: [L * 0.32, 0.06, 0.06], position: [-L * 0.08, wr * 0.82, frameW * 0.6], color: '#6B7280', preset: 'metal' });
  addWheel(group, L * 0.36, wr, 0, wr, '#1C1C1E');
  addWheel(group, -L * 0.36, wr, 0, wr, '#1C1C1E');
}

function buildCamion(group, item, L, W, H, color) {
  const cabL = L * 0.24;
  const cargoL = L - cabL;
  const cargoH = H * 0.74;
  const cabX = L / 2 - cabL / 2;
  const cargoX = -L / 2 + cargoL / 2;
  const cargo = addBox(group, { size: [cargoL, cargoH, W], position: [cargoX, cargoH / 2, 0], color: '#E2E8F0', preset: 'matte' });
  markMain(cargo, '#E2E8F0');
  addBox(group, { size: [cargoL + 0.06, 0.04, W + 0.06], position: [cargoX, cargoH, 0], color: '#CBD5E1', preset: 'metal' });
  addBox(group, { size: [cabL, H, W], position: [cabX, H / 2, 0], color, preset: 'matte' });
  addBox(group, { size: [0.08, H * 0.36, W * 0.82], position: [L / 2 - cabL + 0.04, H * 0.66, 0], color: '#9EC8EE', preset: 'glass', opacity: 0.52 });
  addBox(group, { size: [0.08, H * 0.22, W * 0.68], position: [L / 2 - 0.04, H * 0.22, 0], color: '#4B5563', preset: 'metal' });
  [-W * 0.32, W * 0.32].forEach(z =>
    addBox(group, { size: [0.06, 0.14, 0.2], position: [L / 2 - 0.04, H * 0.26, z], color: '#FFFDE7', preset: 'glass', opacity: 0.9 })
  );
  addCylinder(group, { radiusTop: 0.06, height: H * 0.42, position: [L / 2 - cabL + 0.18, H * 1.06, -W * 0.38], color: '#374151', preset: 'metal' });
  const wr = H * 0.16;
  const wz = W / 2 + wr * 0.5;
  [[L * 0.36, wz], [L * 0.36, -wz], [-cargoL * 0.2, wz], [-cargoL * 0.2, -wz], [-cargoL * 0.44, wz], [-cargoL * 0.44, -wz]].forEach(([wx, wz_]) =>
    addWheel(group, wx, wr, wz_, wr, '#1C1C1E')
  );
}

function buildAvioneta(group, item, L, W, H, color) {
  const fR = H * 0.21;
  const fuselage = new THREE.Mesh(
    new THREE.CylinderGeometry(fR, fR * 0.72, L * 0.86, 18),
    makeStandardMaterial(color, 'matte', 1)
  );
  fuselage.rotation.z = Math.PI / 2;
  fuselage.position.set(-L * 0.06, fR * 1.6, 0);
  markMain(fuselage, color);
  group.add(fuselage);
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(fR, fR * 1.6, 16),
    makeStandardMaterial(color, 'matte', 1)
  );
  nose.rotation.z = Math.PI / 2;
  nose.position.set(L * 0.4, fR * 1.6, 0);
  group.add(nose);
  addBox(group, { size: [L * 0.26, 0.1, W], position: [-L * 0.06, fR * 1.16, 0], color, preset: 'matte' });
  addBox(group, { size: [L * 0.18, H * 0.44, 0.1], position: [-L * 0.38, fR * 1.6 + H * 0.18, 0], color, preset: 'matte' });
  addBox(group, { size: [L * 0.16, 0.08, W * 0.28], position: [-L * 0.38, fR * 1.6 + 0.04, 0], color, preset: 'matte' });
  addBox(group, { size: [0.08, H * 0.52, 0.06], position: [L * 0.42 + fR * 0.8, fR * 1.6, 0], color: '#374151', preset: 'metal' });
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(fR * 0.78, 14, 8, 0, Math.PI * 0.9, 0, Math.PI * 0.55),
    makeStandardMaterial('#9EC8EE', 'glass', 0.48)
  );
  cockpit.rotation.z = Math.PI / 2;
  cockpit.position.set(L * 0.22, fR * 1.82, 0);
  group.add(cockpit);
  const lgY = fR * 1.16;
  addCylinder(group, { radiusTop: 0.04, height: lgY, position: [L * 0.1, lgY / 2, W * 0.22], color: '#6B7280', preset: 'metal' });
  addCylinder(group, { radiusTop: 0.04, height: lgY, position: [L * 0.1, lgY / 2, -W * 0.22], color: '#6B7280', preset: 'metal' });
  addWheel(group, L * 0.1, fR * 0.36, W * 0.22, fR * 0.36, '#1C1C1E');
  addWheel(group, L * 0.1, fR * 0.36, -W * 0.22, fR * 0.36, '#1C1C1E');
  addCylinder(group, { radiusTop: 0.025, height: lgY * 0.48, position: [-L * 0.38, lgY * 0.24, 0], color: '#6B7280', preset: 'metal' });
  addWheel(group, -L * 0.38, fR * 0.16, 0, fR * 0.16, '#1C1C1E');
}

function buildBarco(group, item, L, W, H, color) {
  const hullH = H * 0.38;
  const hull = addBox(group, { size: [L, hullH, W], position: [0, hullH / 2, 0], color, preset: 'matte' });
  markMain(hull, color);
  addBox(group, { size: [L * 0.14, hullH, W * 0.6], position: [L * 0.43, hullH / 2, 0], color, preset: 'matte' });
  addBox(group, { size: [L * 0.08, hullH, W * 0.24], position: [L * 0.47, hullH / 2, 0], color, preset: 'matte' });
  addBox(group, { size: [L * 0.82, 0.05, W * 0.92], position: [-L * 0.06, hullH + 0.025, 0], color: '#D4C5A0', preset: 'matte' });
  const superH = H * 0.48;
  addBox(group, { size: [L * 0.32, superH, W * 0.76], position: [-L * 0.14, hullH + superH / 2, 0], color: '#F1F5F9', preset: 'matte' });
  addBox(group, { size: [0.08, superH * 0.46, W * 0.64], position: [-L * 0.14 + L * 0.16, hullH + superH * 0.62, 0], color: '#9EC8EE', preset: 'glass', opacity: 0.52 });
  [-W * 0.38, W * 0.38].forEach(z =>
    addBox(group, { size: [L * 0.28, superH * 0.38, 0.08], position: [-L * 0.14, hullH + superH * 0.62, z], color: '#9EC8EE', preset: 'glass', opacity: 0.52 })
  );
  addCylinder(group, { radiusTop: 0.05, height: H * 0.72, position: [-L * 0.14, hullH + superH + H * 0.36, 0], color: '#9CA3AF', preset: 'metal' });
  for (let i = 0; i < 6; i++) {
    const rx = -L * 0.36 + i * (L * 0.78 / 5);
    addCylinder(group, { radiusTop: 0.022, height: H * 0.18, position: [rx, hullH + H * 0.09, W * 0.46], color: '#CBD5E1', preset: 'metal' });
    addCylinder(group, { radiusTop: 0.022, height: H * 0.18, position: [rx, hullH + H * 0.09, -W * 0.46], color: '#CBD5E1', preset: 'metal' });
  }
  addBox(group, { size: [L * 0.78, 0.025, 0.04], position: [-L * 0.06, hullH + H * 0.18, W * 0.46], color: '#CBD5E1', preset: 'metal' });
  addBox(group, { size: [L * 0.78, 0.025, 0.04], position: [-L * 0.06, hullH + H * 0.18, -W * 0.46], color: '#CBD5E1', preset: 'metal' });
}

function buildHelicoptero(group, item, L, W, H, color) {
  const bodyH = H * 0.52;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyH * 0.5, bodyH * 0.44, L * 0.44, 20),
    makeStandardMaterial(color, 'matte', 1)
  );
  body.rotation.z = Math.PI / 2;
  body.position.set(L * 0.1, bodyH * 0.78, 0);
  markMain(body, color);
  group.add(body);
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(bodyH * 0.46, 16, 10, 0, Math.PI * 0.82, 0, Math.PI * 0.62),
    makeStandardMaterial('#9EC8EE', 'glass', 0.5)
  );
  cockpit.rotation.z = -Math.PI / 2;
  cockpit.position.set(L * 0.34, bodyH * 0.78, 0);
  group.add(cockpit);
  addBox(group, { size: [L * 0.5, bodyH * 0.24, bodyH * 0.24], position: [-L * 0.26, bodyH * 0.68, 0], color, preset: 'matte' });
  addBox(group, { size: [L * 0.16, bodyH * 0.44, 0.08], position: [-L * 0.44, bodyH * 0.82, 0], color, preset: 'matte' });
  addCylinder(group, { radiusTop: W * 0.22, height: 0.04, position: [-L * 0.48, bodyH * 0.82, W * 0.14], color: '#374151', preset: 'metal', radialSegments: 18, rotation: [Math.PI / 2, 0, 0] });
  addCylinder(group, { radiusTop: 0.06, height: bodyH * 0.34, position: [L * 0.1, bodyH * 1.28, 0], color: '#4B5563', preset: 'metal' });
  const rotorY = bodyH * 1.62;
  addBox(group, { size: [L * 0.92, 0.04, 0.12], position: [L * 0.1, rotorY, 0], color: '#1F2937', preset: 'metal' });
  addBox(group, { size: [0.12, 0.04, L * 0.92], position: [L * 0.1, rotorY, 0], color: '#1F2937', preset: 'metal' });
  const rotorDisc = new THREE.Mesh(
    new THREE.CircleGeometry(L * 0.46, 28),
    new THREE.MeshBasicMaterial({ color: 0x374151, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
  );
  rotorDisc.rotation.x = -Math.PI / 2;
  rotorDisc.position.set(L * 0.1, rotorY + 0.02, 0);
  group.add(rotorDisc);
  [-W * 0.4, W * 0.4].forEach(z => {
    addBox(group, { size: [L * 0.48, 0.04, 0.06], position: [L * 0.04, 0.04, z], color: '#6B7280', preset: 'metal' });
    addCylinder(group, { radiusTop: 0.025, height: bodyH * 0.44, position: [L * 0.18, bodyH * 0.22, z], color: '#6B7280', preset: 'metal', rotation: [0, 0, 0.18] });
    addCylinder(group, { radiusTop: 0.025, height: bodyH * 0.44, position: [-L * 0.08, bodyH * 0.22, z], color: '#6B7280', preset: 'metal', rotation: [0, 0, -0.18] });
  });
}

function buildEscalera(group, item, L, W, H, color) {
  const steps = Math.max(3, Math.round(L / 0.55));
  const stepW = L / steps;
  const stepH = H / steps;
  const rW = Math.max(0.03, W * 0.03);
  for (let i = 0; i < steps; i++) {
    const block = addBox(group, {
      size: [(i + 1) * stepW, (i + 1) * stepH, W],
      position: [-L / 2 + (i + 1) * stepW / 2, (i + 1) * stepH / 2, 0],
      color, preset: 'matte'
    });
    if (i === 0) markMain(block, color);
    addBox(group, {
      size: [stepW, 0.03, W],
      position: [-L / 2 + (i + 1) * stepW, (i + 1) * stepH + 0.015, 0],
      color: '#374151', preset: 'metal'
    });
  }
  [-W / 2 - rW, W / 2 + rW].forEach(z => {
    addBox(group, { size: [L * 1.08, rW * 1.2, rW * 1.2], position: [0, H + rW * 0.6, z], color: '#94A3B8', preset: 'metal' });
    [0, 0.5, 1].forEach(t => {
      addBox(group, { size: [rW, H * t + H * 0.12, rW], position: [-L / 2 + L * t, (H * t + H * 0.12) / 2, z], color: '#94A3B8', preset: 'metal' });
    });
  });
}

function buildMesaDJ(group, item, L, W, H, color) {
  const tH = H * 0.68;
  const base = addBox(group, { size: [L, tH * 0.84, W], position: [0, tH * 0.42, 0], color: '#111827', preset: 'matte' });
  markMain(base, '#111827');
  addBox(group, { size: [L + 0.04, 0.05, W + 0.04], position: [0, tH + 0.025, 0], color: '#1E293B', preset: 'metal' });
  addBox(group, { size: [L * 0.34, tH * 0.14, W * 0.84], position: [0, tH + 0.07, 0], color: '#0F172A', preset: 'matte' });
  const turntableR = Math.min(L * 0.15, W * 0.36);
  [-L * 0.24, L * 0.24].forEach(x =>
    addCylinder(group, { radiusTop: turntableR, height: 0.04, position: [x, tH + 0.07, 0], color: '#0F172A', preset: 'matte', radialSegments: 24 })
  );
  [-L * 0.48, L * 0.48].forEach(x => {
    addBox(group, { size: [L * 0.12, H * 0.86, W * 0.84], position: [x, H * 0.43, 0], color: '#0F172A', preset: 'matte' });
    addSphere(group, { radius: W * 0.24, position: [x, H * 0.36, W * 0.42 + 0.04], color: '#1E293B', preset: 'metal' });
    addSphere(group, { radius: W * 0.1, position: [x, H * 0.62, W * 0.42 + 0.04], color: '#374151', preset: 'metal' });
  });
  addSphere(group, { radius: 0.055, position: [0, tH + 0.2, W * 0.42 + 0.04], color: '#FF00AA', emissive: true });
}

function buildPared(group, item, L, W, H, color) {
  const body = addBox(group, { size: [L, H, W], position: [0, H / 2, 0], color, preset: 'matte' });
  markMain(body, color);
}

function buildMuro(group, item, L, W, H, color) {
  const body = addBox(group, { size: [L, H, W], position: [0, H / 2, 0], color, preset: 'matte' });
  markMain(body, color);
  addBox(group, { size: [L + 0.04, 0.06, W + 0.04], position: [0, H + 0.03, 0], color: '#6B4423', preset: 'matte' });
}

function buildTecho(group, item, L, W, H, color) {
  const t = Math.max(0.06, H);
  const body = addBox(group, { size: [L, t, W], position: [0, t / 2, 0], color, preset: 'matte' });
  markMain(body, color);
}

function buildParedPuerta(group, item, L, W, H, color) {
  const doorW = item.doorWidth ?? 1.0;
  const doorH = item.doorHeight ?? 2.0;
  const sideW = (L - doorW) / 2;
  const frameColor = '#8B7355';

  const leftBody = addBox(group, { size: [sideW, H, W], position: [-L / 2 + sideW / 2, H / 2, 0], color, preset: 'matte' });
  markMain(leftBody, color);
  addBox(group, { size: [sideW, H, W], position: [L / 2 - sideW / 2, H / 2, 0], color, preset: 'matte' });
  if (H > doorH) {
    addBox(group, { size: [doorW, H - doorH, W], position: [0, doorH + (H - doorH) / 2, 0], color, preset: 'matte' });
  }

  addBox(group, { size: [0.06, doorH, W + 0.02], position: [-doorW / 2 + 0.03, doorH / 2, 0], color: frameColor, preset: 'matte' });
  addBox(group, { size: [0.06, doorH, W + 0.02], position: [doorW / 2 - 0.03, doorH / 2, 0], color: frameColor, preset: 'matte' });
  addBox(group, { size: [doorW, 0.06, W + 0.02], position: [0, doorH - 0.03, 0], color: frameColor, preset: 'matte' });

  const doorPivot = new THREE.Group();
  doorPivot.position.set(-doorW / 2, 0, W / 2 + 0.02);
  doorPivot.rotation.y = Math.PI / 4;
  const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(doorW * 0.96, doorH * 0.97, 0.04),
    makeStandardMaterial(frameColor, 'matte', 1)
  );
  doorMesh.position.set(doorW * 0.48, doorH / 2, 0);
  doorMesh.castShadow = true;
  doorPivot.add(doorMesh);
  group.add(doorPivot);

  const hingeX = -doorW / 2;
  const hingeZ = W / 2 + 0.02;
  const arcSegs = 24;
  const arcPts = [];
  for (let i = 0; i <= arcSegs; i++) {
    const a = (i / arcSegs) * (Math.PI / 2);
    arcPts.push(new THREE.Vector3(hingeX + Math.cos(a) * doorW, 0.016, hingeZ + Math.sin(a) * doorW));
  }
  const arcLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(arcPts),
    new THREE.LineDashedMaterial({ color: 0x999999, dashSize: 0.1, gapSize: 0.06, transparent: true, opacity: 0.65 })
  );
  arcLine.computeLineDistances();
  group.add(arcLine);

  const arcShape = new THREE.Shape();
  arcShape.moveTo(hingeX, hingeZ);
  for (let i = 0; i <= arcSegs; i++) {
    const a = (i / arcSegs) * (Math.PI / 2);
    arcShape.lineTo(hingeX + Math.cos(a) * doorW, hingeZ + Math.sin(a) * doorW);
  }
  arcShape.lineTo(hingeX, hingeZ);
  const arcFill = new THREE.Mesh(
    new THREE.ShapeGeometry(arcShape),
    new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false })
  );
  arcFill.rotation.x = -Math.PI / 2;
  arcFill.position.y = 0.012;
  arcFill.renderOrder = 10;
  group.add(arcFill);
}

function buildArbustoRecto(group, item, L, W, H, color) {
  const baseColor = color || '#3D7A38';
  const leafColors = ['#4A8C45', '#3D7A38', '#558C50', '#2D6E30'];
  const base = addBox(group, { size: [L, H * 0.55, W * 0.65], position: [0, H * 0.275, 0], color: '#2A5E28', preset: 'matte' });
  markMain(base, baseColor);
  const count = Math.max(3, Math.round(L / 0.75));
  for (let i = 0; i < count; i++) {
    const x = -L / 2 + L * (i + 0.5) / count;
    addSphere(group, {
      radius: H * 0.42,
      position: [x, H * 0.68, Math.sin(i * 2.1) * W * 0.08],
      color: leafColors[i % leafColors.length],
      preset: 'matte'
    });
  }
}

function buildArbustoCorner(group, item, L, W, H, color) {
  const baseColor = color || '#3D7A38';
  const leafColors = ['#4A8C45', '#3D7A38', '#558C50'];
  const armW = W * 0.55;
  const armLen = L * 0.88;

  const armX = addBox(group, { size: [armLen, H * 0.55, armW], position: [-L / 2 + armLen / 2, H * 0.275, -W / 2 + armW / 2], color: '#2A5E28', preset: 'matte' });
  markMain(armX, baseColor);
  addBox(group, { size: [armW, H * 0.55, armLen], position: [-L / 2 + armW / 2, H * 0.275, -W / 2 + armLen / 2], color: '#2A5E28', preset: 'matte' });

  addSphere(group, { radius: H * 0.4, position: [-L / 2 + armW / 2, H * 0.68, -W / 2 + armW / 2], color: leafColors[0], preset: 'matte' });
  const nArm = Math.max(2, Math.round((armLen - armW) / 0.7));
  for (let i = 0; i < nArm; i++) {
    const t = (i + 0.5) / nArm;
    addSphere(group, { radius: H * 0.32, position: [-L / 2 + armW + (armLen - armW) * t, H * 0.68, -W / 2 + armW / 2], color: leafColors[(i + 1) % leafColors.length], preset: 'matte' });
    addSphere(group, { radius: H * 0.32, position: [-L / 2 + armW / 2, H * 0.68, -W / 2 + armW + (armLen - armW) * t], color: leafColors[(i + 2) % leafColors.length], preset: 'matte' });
  }
}

function buildArbustoCurvo(group, item, L, W, H, color) {
  const baseColor = color || '#3D7A38';
  const leafColors = ['#4A8C45', '#3D7A38', '#558C50', '#2D6E30'];
  const curveR = item.curveDiameter ?? 1.0;
  const totalAngle = L / curveR;
  const startAngle = -totalAngle / 2;
  const count = Math.max(4, Math.round(L / 0.7));
  let firstBase = null;
  for (let i = 0; i < count; i++) {
    const angle = startAngle + totalAngle * (i / (count - 1));
    const cx = Math.sin(angle) * curveR;
    const cz = (Math.cos(angle) - Math.cos(startAngle)) * curveR;
    const b = addBox(group, { size: [W * 0.55, H * 0.5, W * 0.55], position: [cx, H * 0.25, cz], color: '#2A5E28', preset: 'matte' });
    if (!firstBase) { firstBase = b; markMain(b, baseColor); }
    addSphere(group, { radius: H * 0.4, position: [cx, H * 0.65, cz], color: leafColors[i % leafColors.length], preset: 'matte' });
  }
}

function buildTejado1Aguas(group, item, L, W, H, color) {
  const peak = Math.max(0.1, H);
  const t = 0.14;
  const profile = new THREE.Shape();
  profile.moveTo(-W / 2, 0);
  profile.lineTo(W / 2, peak);
  profile.lineTo(W / 2, peak - t);
  profile.lineTo(-W / 2, -t);
  profile.closePath();
  const geo = new THREE.ExtrudeGeometry(profile, { depth: L, bevelEnabled: false, curveSegments: 1 });
  const mesh = new THREE.Mesh(geo, makeStandardMaterial(color, 'matte', 1));
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(-L / 2, 0, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  markMain(mesh, color);
  group.add(mesh);
}

function buildTejado2Aguas(group, item, L, W, H, color) {
  const peak = Math.max(0.1, H);
  const profile = new THREE.Shape();
  profile.moveTo(-W / 2, 0);
  profile.lineTo(0, peak);
  profile.lineTo(W / 2, 0);
  profile.closePath();
  const geo = new THREE.ExtrudeGeometry(profile, { depth: L, bevelEnabled: false, curveSegments: 1 });
  const mesh = new THREE.Mesh(geo, makeStandardMaterial(color, 'matte', 1));
  mesh.rotation.y = Math.PI / 2;
  mesh.position.set(-L / 2, 0, 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  markMain(mesh, color);
  group.add(mesh);
  addBox(group, { size: [L, 0.06, 0.08], position: [0, peak + 0.03, 0], color: '#8B7355', preset: 'matte' });
}

function buildTejado4Aguas(group, item, L, W, H, color) {
  const peak = Math.max(0.1, H);
  const mat = makeStandardMaterial(color, 'matte', 1);
  const apex = [0, peak, 0];
  const corners = [
    [-L / 2, 0, -W / 2],
    [L / 2, 0, -W / 2],
    [L / 2, 0, W / 2],
    [-L / 2, 0, W / 2]
  ];
  for (let i = 0; i < 4; i++) {
    const c1 = corners[i];
    const c2 = corners[(i + 1) % 4];
    const verts = new Float32Array([
      apex[0], apex[1], apex[2],
      c1[0], c1[1], c1[2],
      c2[0], c2[1], c2[2]
    ]);
    const faceGeo = new THREE.BufferGeometry();
    faceGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    faceGeo.setIndex([0, 1, 2]);
    faceGeo.computeVertexNormals();
    const face = new THREE.Mesh(faceGeo, mat.clone());
    face.castShadow = true;
    face.receiveShadow = true;
    markMain(face, color);
    group.add(face);
  }
  addBox(group, { size: [L, 0.02, W], position: [0, 0.01, 0], color, preset: 'matte', opacity: 0.35 });
}

// ── STRUCTURAL / AMBIENT BUILDERS ────────────────────────────────────────────

function buildPared(group, item, L, W, H, color) {
  const wall = addBox(group, { size: [L, H, W], position: [0, H / 2, 0], color, preset: 'matte' });
  markMain(wall, color);
}

function buildMuro(group, item, L, W, H, color) {
  const wall = addBox(group, { size: [L, H, W], position: [0, H / 2, 0], color, preset: 'matte' });
  markMain(wall, color);
  // Horizontal mortar lines for masonry texture
  const bands = Math.max(2, Math.round(H / 0.3));
  for (let i = 1; i < bands; i++) {
    addBox(group, { size: [L + 0.01, 0.025, W + 0.01], position: [0, (H / bands) * i, 0], color: '#2E1A0E', preset: 'matte' });
  }
}

function buildTecho(group, item, L, W, H, color) {
  const floorH = item.dims?.floorHeight ?? 2.0;
  const thick = Math.max(0.05, H);
  const panel = addBox(group, { size: [L, thick, W], position: [0, floorH + thick / 2, 0], color, preset: 'matte' });
  markMain(panel, color);
  // Corner support pillars
  const pillarColor = '#A09B95';
  const px = L / 2 - 0.08, pz = W / 2 - 0.08;
  [[px, pz], [px, -pz], [-px, pz], [-px, -pz]].forEach(([x, z]) => {
    addBox(group, { size: [0.1, floorH, 0.1], position: [x, floorH / 2, z], color: pillarColor, preset: 'matte' });
  });
}

function buildParedPuerta(group, item, L, W, H, color) {
  const doorW = item.dims?.doorWidth ?? 1.0;
  const doorH = item.dims?.doorHeight ?? 2.0;
  const sideW = Math.max(0, (L - doorW) / 2);
  const frameColor = '#C8B89A';

  if (sideW > 0.02) {
    const lw = addBox(group, { size: [sideW, H, W], position: [-L / 2 + sideW / 2, H / 2, 0], color, preset: 'matte' });
    markMain(lw, color);
    addBox(group, { size: [sideW, H, W], position: [L / 2 - sideW / 2, H / 2, 0], color, preset: 'matte' });
  }
  const headerH = H - doorH;
  if (headerH > 0.01) {
    addBox(group, { size: [doorW, headerH, W], position: [0, doorH + headerH / 2, 0], color, preset: 'matte' });
  }
  // Door panel (closed position on front face)
  addBox(group, { size: [doorW - 0.06, doorH - 0.04, 0.04], position: [0, doorH / 2, -W / 2 - 0.02], color: frameColor, preset: 'matte' });
  // Door frame strips
  addBox(group, { size: [0.06, doorH, W + 0.02], position: [-doorW / 2 - 0.03, doorH / 2, 0], color: frameColor, preset: 'matte' });
  addBox(group, { size: [0.06, doorH, W + 0.02], position: [ doorW / 2 + 0.03, doorH / 2, 0], color: frameColor, preset: 'matte' });
  addBox(group, { size: [doorW + 0.12, 0.06, W + 0.02], position: [0, doorH + 0.03, 0], color: frameColor, preset: 'matte' });

  // Door swing arc indicator on floor
  const hx = -doorW / 2, hz = -W / 2;
  const sectors = 20;
  const verts = [hx, 0.005, hz];
  for (let i = 0; i <= sectors; i++) {
    const a = (i / sectors) * (Math.PI / 2);
    verts.push(hx + Math.cos(a) * doorW, 0.005, hz - Math.sin(a) * doorW);
  }
  const arcGeo = new THREE.BufferGeometry();
  arcGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(verts), 3));
  const idx = [];
  for (let i = 0; i < sectors; i++) idx.push(0, i + 1, i + 2);
  arcGeo.setIndex(idx);
  arcGeo.computeVertexNormals();
  group.add(new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: 0x5588CC, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })));
  // Arc border line
  const linePts = [new THREE.Vector3(hx, 0.008, hz)];
  for (let i = 0; i <= sectors; i++) {
    const a = (i / sectors) * (Math.PI / 2);
    linePts.push(new THREE.Vector3(hx + Math.cos(a) * doorW, 0.008, hz - Math.sin(a) * doorW));
  }
  linePts.push(new THREE.Vector3(hx, 0.008, hz));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: 0x5588CC, opacity: 0.55, transparent: true })));
}

function buildTejado1Aguas(group, item, L, W, H, color) {
  const peakH = Math.max(0.1, H);
  // Wedge cross-section: Z=-W/2 is high (ridge), Z=W/2 is low eave
  const profile = new THREE.Shape();
  profile.moveTo(-W / 2, 0);
  profile.lineTo(-W / 2, peakH);
  profile.lineTo(W / 2, 0);
  profile.lineTo(-W / 2, 0);
  const geo = new THREE.ExtrudeGeometry(profile, { steps: 1, depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2);
  geo.rotateY(-Math.PI / 2);
  const mat = makeStandardMaterial(color, 'matte', 1);
  mat.flatShading = true;
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  markMain(mesh, color);
  group.add(mesh);
  // Ridge cap
  addBox(group, { size: [L + 0.06, 0.1, 0.14], position: [0, peakH + 0.05, -W / 2], color: '#7A6B5A', preset: 'matte' });
}

function buildTejado2Aguas(group, item, L, W, H, color) {
  const peakH = Math.max(0.1, H);
  // Triangular cross-section: peak at Z=0 top center
  const profile = new THREE.Shape();
  profile.moveTo(-W / 2, 0);
  profile.lineTo(0, peakH);
  profile.lineTo(W / 2, 0);
  profile.lineTo(-W / 2, 0);
  const geo = new THREE.ExtrudeGeometry(profile, { steps: 1, depth: L, bevelEnabled: false });
  geo.translate(0, 0, -L / 2);
  geo.rotateY(-Math.PI / 2);
  const mat = makeStandardMaterial(color, 'matte', 1);
  mat.flatShading = true;
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  markMain(mesh, color);
  group.add(mesh);
  // Ridge cap along the top
  addBox(group, { size: [L + 0.06, 0.1, 0.14], position: [0, peakH + 0.05, 0], color: '#7A6B5A', preset: 'matte' });
}

function buildTejado4Aguas(group, item, L, W, H, color) {
  const peakH = Math.max(0.1, H);
  const hipOff = W / 2;
  const ridgeLen = Math.max(0, L - 2 * hipOff);
  const halfL = L / 2, halfW = W / 2, rL = ridgeLen / 2;

  const A = [-halfL, 0, -halfW], B = [halfL, 0, -halfW];
  const C = [halfL, 0, halfW],  D = [-halfL, 0, halfW];

  let positions;
  if (ridgeLen < 0.05) {
    const apex = [0, peakH, 0];
    positions = new Float32Array([
      ...A, ...B, ...apex,
      ...B, ...C, ...apex,
      ...C, ...D, ...apex,
      ...D, ...A, ...apex,
      ...A, ...C, ...B,
      ...A, ...D, ...C
    ]);
  } else {
    const rLA = [-rL, peakH, 0], rRA = [rL, peakH, 0];
    positions = new Float32Array([
      ...A, ...B, ...rRA, ...A, ...rRA, ...rLA,
      ...D, ...rLA, ...rRA, ...D, ...rRA, ...C,
      ...A, ...rLA, ...D,
      ...B, ...C, ...rRA,
      ...A, ...C, ...B, ...A, ...D, ...C
    ]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mat = makeStandardMaterial(color, 'matte', 1);
  mat.flatShading = true;
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  markMain(mesh, color);
  group.add(mesh);
  if (ridgeLen >= 0.05) {
    addBox(group, { size: [ridgeLen + 0.06, 0.1, 0.14], position: [0, peakH + 0.05, 0], color: '#7A6B5A', preset: 'matte' });
  } else {
    addBox(group, { size: [0.2, 0.12, 0.2], position: [0, peakH + 0.05, 0], color: '#7A6B5A', preset: 'matte' });
  }
}

function buildArbustoRecto(group, item, L, W, H, color) {
  addBox(group, { size: [L, H * 0.08, W], position: [0, H * 0.04, 0], color: '#4A3020', preset: 'matte' });
  const mat = new THREE.MeshStandardMaterial({ color: colorNumber(color), roughness: 0.93, metalness: 0.0, flatShading: true });
  const sphereR = Math.min(H * 0.52, W * 0.52, 0.55);
  const nX = Math.max(3, Math.round(L / 0.48));
  const nZ = Math.max(2, Math.round(W / 0.48));
  let first = true;
  for (let i = 0; i < nX; i++) {
    for (let j = 0; j < nZ; j++) {
      const x = -L / 2 + (i + 0.5) * (L / nX);
      const z = -W / 2 + (j + 0.5) * (W / nZ);
      const vari = Math.sin(i * 2.3 + j * 5.7) * 0.5 + 0.5;
      const r = sphereR * (0.82 + vari * 0.36);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), mat);
      sphere.position.set(x, H * 0.08 + r * 0.85, z);
      if (first) { markMain(sphere, color); first = false; }
      group.add(sphere);
    }
  }
}

function buildArbustoCorner(group, item, L, W, H, color) {
  buildArbustoRecto(group, item, L, W, H, color);
}

function buildArbustoCurvo(group, item, L, W, H, color) {
  const R = Math.max(0.5, item.curveDiameter ?? 1.0);
  const totalAngle = L / R;
  const mat = new THREE.MeshStandardMaterial({ color: colorNumber(color), roughness: 0.93, metalness: 0.0, flatShading: true });
  const sphereR = Math.min(H * 0.52, W * 0.52, 0.55);
  const nAlong = Math.max(4, Math.round(L / 0.48));
  const nDepth = Math.max(2, Math.round(W / 0.48));
  let first = true;
  for (let i = 0; i < nAlong; i++) {
    for (let k = 0; k < nDepth; k++) {
      const t = i / Math.max(1, nAlong - 1);
      const angle = (t - 0.5) * totalAngle;
      const dR = -W / 2 + (k + 0.5) * (W / nDepth);
      const er = R + dR;
      const cx = er * Math.sin(angle);
      const cz = R - er * Math.cos(angle);
      const vari = Math.sin(i * 3.1 + k * 7.7) * 0.5 + 0.5;
      const r = sphereR * (0.82 + vari * 0.36);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), mat);
      sphere.position.set(cx, H * 0.08 + r * 0.85, cz);
      if (first) { markMain(sphere, color); first = false; }
      group.add(sphere);
    }
  }
  // Curved base strip using line geometry
  const pts = [];
  const steps = Math.max(20, nAlong * 3);
  for (let i = 0; i <= steps; i++) {
    const angle = ((i / steps) - 0.5) * totalAngle;
    pts.push(new THREE.Vector3(R * Math.sin(angle), H * 0.04, R - R * Math.cos(angle)));
  }
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x4A3020 })));
}

// ─────────────────────────────────────────────────────────────────────────────

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
    case 'curvedPlatform':
      buildCurvedPlatform(group, item, L, W, H, color);
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
    case 'coche':
      buildCoche(group, item, L, W, H, color);
      break;
    case 'moto':
      buildMoto(group, item, L, W, H, color);
      break;
    case 'camion':
      buildCamion(group, item, L, W, H, color);
      break;
    case 'avioneta':
      buildAvioneta(group, item, L, W, H, color);
      break;
    case 'barco':
      buildBarco(group, item, L, W, H, color);
      break;
    case 'helicoptero':
      buildHelicoptero(group, item, L, W, H, color);
      break;
    case 'escalera':
      buildEscalera(group, item, L, W, H, color);
      break;
    case 'mesaDJ':
      buildMesaDJ(group, item, L, W, H, color);
      break;
    case 'pared':
      buildPared(group, item, L, W, H, color);
      break;
    case 'muro':
      buildMuro(group, item, L, W, H, color);
      break;
    case 'techo':
      buildTecho(group, item, L, W, H, color);
      break;
    case 'paredPuerta':
      buildParedPuerta(group, item, L, W, H, color);
      break;
    case 'arbustoRecto':
      buildArbustoRecto(group, item, L, W, H, color);
      break;
    case 'arbustoCorner':
      buildArbustoCorner(group, item, L, W, H, color);
      break;
    case 'arbustoCurvo':
      buildArbustoCurvo(group, item, L, W, H, color);
      break;
    case 'tejado1Aguas':
      buildTejado1Aguas(group, item, L, W, H, color);
      break;
    case 'tejado2Aguas':
      buildTejado2Aguas(group, item, L, W, H, color);
      break;
    case 'tejado4Aguas':
      buildTejado4Aguas(group, item, L, W, H, color);
      break;
    default: {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(L, H, W),
        makeStandardMaterial(color, item.visual?.materialPreset || 'matte', item.visual?.opacity ?? 1)
      );
      body.position.y = H / 2;
      body.castShadow = item.visual?.shadows !== false;
      markMain(body, color);
      group.add(body);
    }
  }

  addLabel(group, item.labelText, H + 0.45);
  return group;
}

function buildCurvedPlatform(group, item, L, W, H, color) {
  const outerRadius = Math.max(L * 0.62, W * 0.9);
  const thickness = Math.max(0.28, Math.min(outerRadius - 0.12, W));
  const innerRadius = Math.max(0.12, outerRadius - thickness);
  const angle = Math.PI * 0.54;
  const shape = annularSectorShape(innerRadius, outerRadius, angle);
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false, curveSegments: 28 }),
    makeStandardMaterial(color, item.visual?.materialPreset || 'matte', item.visual?.opacity ?? 1)
  );
  body.rotation.x = -Math.PI / 2;
  body.position.y = 0;
  body.castShadow = item.visual?.shadows !== false;
  markMain(body, color);
  group.add(body);

  const trim = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.03, H * 0.12), bevelEnabled: false, curveSegments: 28 }),
    makeStandardMaterial('#4B5563', 'metal', 1)
  );
  trim.rotation.x = -Math.PI / 2;
  trim.position.y = H + Math.max(0.03, H * 0.12);
  group.add(trim);
}

function buildCurvedBar(group, diameter, height, color) {
  const outerRadius = diameter / 2;
  const counterDepth = Math.max(0.42, diameter * 0.2);
  const innerRadius = Math.max(0.24, outerRadius - counterDepth);
  const angle = Math.PI * 0.74;
  const shape = annularSectorShape(innerRadius, outerRadius, angle);
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 32 }),
    makeStandardMaterial(color, 'matte', 0.98)
  );
  body.rotation.x = -Math.PI / 2;
  body.position.y = 0;
  markMain(body, color);
  group.add(body);

  const top = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false, curveSegments: 32 }),
    makeStandardMaterial('#E5E7EB', 'metal', 1)
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = height;
  group.add(top);

  const frontRail = new THREE.Mesh(
    new THREE.TorusGeometry((innerRadius + outerRadius) / 2, counterDepth * 0.46, 12, 48, angle),
    makeStandardMaterial('#CBD5E1', 'metal', 0.22)
  );
  frontRail.rotation.x = Math.PI / 2;
  frontRail.position.y = height * 0.58;
  group.add(frontRail);
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
    if (profile === 'curvedBar') {
      const outerRadius = diameter / 2;
      const innerRadius = Math.max(0.24, outerRadius - Math.max(0.42, diameter * 0.2));
      const shape = annularSectorShape(innerRadius, outerRadius, Math.PI * 0.74);
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), makeTopFill(color, item.visual?.opacity ?? 0.24));
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.04;
      markMain(fill, color);
      group.add(fill);
    } else {
      const fill = new THREE.Mesh(new THREE.CircleGeometry(diameter / 2, 72), makeTopFill(color, item.visual?.opacity ?? 0.2));
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.04;
      markMain(fill, color);
      group.add(fill);
    }
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
  const H = item.dims?.height ?? 0.1;
  const color = item.color || '#6F8E57';
  const borderColor = item.borderColor || '#2F5A29';
  const defId = item.catalogDefinitionId || '';

  if (view !== 'top') {
    const visH = Math.max(0.3, H);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(L, visH, W),
      new THREE.MeshStandardMaterial({ color: colorNumber(color), roughness: 0.85, metalness: 0.0, flatShading: false })
    );
    box.position.y = visH / 2;
    box.receiveShadow = true;
    box.castShadow = false;
    markMain(box, color);
    group.add(box);
    if (item.labelText) addLabel(group, item.labelText, visH + 0.4);
    return group;
  }

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    makeTopFill(color, item.visual?.opacity ?? 0.65)
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.04;
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

function buildPergola(item, view) {
  const group = new THREE.Group();
  const L = item.dims?.length ?? 4;
  const W = item.dims?.width ?? 4;
  const postH = item.dims?.height ?? 3;
  const roofH = item.dims?.roofHeight ?? 0.12;
  const modSpacing = item.dims?.modSpacing ?? 4;
  const postColor = item.color || '#C4A265';
  const roofColor = item.roofColor || '#4A4744';
  const postDim = 0.1;

  if (view === 'top') {
    addTopFootprint(group, item, L, W, postColor, 0.10);
    addTopLabel(group, item.labelText || 'Pérgola');
    return group;
  }

  // Post grid positions along length axis
  const nSegsL = Math.max(1, Math.round(L / modSpacing));
  const postXs = Array.from({ length: nSegsL + 1 }, (_, i) => -L / 2 + i * (L / nSegsL));
  const postZs = [-W / 2, W / 2];

  // Posts
  postXs.forEach(x => {
    postZs.forEach(z => {
      const post = addBox(group, {
        size: [postDim, postH, postDim],
        position: [x, postH / 2, z],
        color: postColor,
        preset: 'matte'
      });
      markMain(post, postColor);
    });
  });

  // Side header beams (along length, at top of posts, one on each Z side)
  const beamH = 0.14;
  const beamD = 0.08;
  postZs.forEach(z => {
    addBox(group, {
      size: [L + postDim, beamH, beamD],
      position: [0, postH + beamH / 2, z],
      color: roofColor,
      preset: 'matte'
    });
  });

  // Rafters (perpendicular slats spanning width, between the two header beams)
  const nRafters = Math.max(3, Math.ceil(L / 0.45) + 1);
  const rafterW = 0.07;
  const rafterH = roofH;
  for (let i = 0; i < nRafters; i++) {
    const x = -L / 2 + (i / (nRafters - 1)) * L;
    addBox(group, {
      size: [rafterW, rafterH, W + postDim * 2],
      position: [x, postH + beamH + rafterH / 2, 0],
      color: roofColor,
      preset: 'matte'
    });
  }

  if (item.labelText) addLabel(group, item.labelText, postH + beamH + rafterH + 0.4);
  return group;
}

export const SCHEMA_BUILDERS = {
  roundTableBanquet: buildRoundTable,
  chairDining: buildChair,
  chairLine: buildChairLine,
  buffetStation: buildBuffet,
  buffetCarrito: buildBuffetCarrito,
  buffetCart: buildBuffetCarro,
  stagePlatform: buildStage,
  genericRectProp: buildGenericRect,
  genericRoundProp: buildGenericRound,
  genericSurface: buildSurface,
  genericPerson: buildPerson,
  arrow2D: buildArrow,
  genericLighting: buildLighting,
  sofaSeat: buildSofa,
  pergola: buildPergola
};

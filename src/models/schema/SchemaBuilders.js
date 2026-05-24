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
    fill.userData.baseColor = colorNumber(color);
    fill.userData.isMain = true;
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
  top.userData.isMain = true;
  top.userData.baseColor = colorNumber(color);
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
    seat.userData.isMain = true;
    seat.userData.baseColor = colorNumber(accent);
    group.add(seat);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.08), makeTopFill('#111827', 0.22));
    back.rotation.x = -Math.PI / 2;
    back.position.set(0, 0.041, -D / 2 + 0.04);
    group.add(back);
    return group;
  }

  const material = makeStandardMaterial(accent, item.visual?.materialPreset || 'default', item.visual?.opacity ?? 1);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, D), material);
  seat.position.y = SH;
  seat.castShadow = item.visual?.shadows !== false;
  seat.userData.baseColor = colorNumber(accent);
  seat.userData.isMain = true;
  group.add(seat);

  const backHeight = Math.max(0.2, TH - SH - 0.03);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, backHeight, 0.03), material.clone());
  back.position.set(0, SH + backHeight / 2, -D / 2 + 0.02);
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
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(L, W), makeTopFill(color, 0.22));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    fill.userData.isMain = true;
    group.add(fill);
    addTopLabel(group, item.labelText || item.subtype || 'Buffet');
    return group;
  }
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(L, H, W),
    makeStandardMaterial(color, item.visual?.materialPreset || 'fabric', item.visual?.opacity ?? 1)
  );
  body.position.y = H / 2;
  body.castShadow = item.visual?.shadows !== false;
  body.userData.isMain = true;
  group.add(body);

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(L + 0.04, 0.05, W + 0.04),
    makeStandardMaterial('#6B6864', 'matte', 1)
  );
  top.position.y = H + 0.02;
  top.castShadow = true;
  group.add(top);
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
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(L, W), makeTopFill(color, 0.18));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    fill.userData.isMain = true;
    group.add(fill);
    addTopLabel(group, item.labelText || 'Escenario');
    return group;
  }
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(L, H, W),
    makeStandardMaterial(color, item.visual?.materialPreset || 'matte', item.visual?.opacity ?? 1)
  );
  body.position.y = H / 2;
  body.castShadow = item.visual?.shadows !== false;
  body.userData.isMain = true;
  group.add(body);
  addLabel(group, item.labelText || 'Escenario', H + 0.45);
  return group;
}

function buildGenericRect(item, view) {
  const group = new THREE.Group();
  const W = item.dims?.width ?? 1.2;
  const L = item.dims?.length ?? 1.2;
  const H = item.dims?.height ?? 1.2;
  const color = item.color || '#B6B1A9';
  if (view === 'top') {
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(L, W), makeTopFill(color, item.visual?.opacity ?? 0.2));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    fill.userData.isMain = true;
    group.add(fill);
    if (item.labelText && item.display?.topLabel !== false) addTopLabel(group, item.labelText);
    return group;
  }
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(L, H, W),
    makeStandardMaterial(color, item.visual?.materialPreset || 'matte', item.visual?.opacity ?? 1)
  );
  body.position.y = H / 2 + (item.y || 0);
  body.castShadow = item.visual?.shadows !== false;
  body.userData.isMain = true;
  group.add(body);
  addLabel(group, item.labelText, H + 0.45);
  return group;
}

function buildGenericRound(item, view) {
  const group = new THREE.Group();
  const diameter = item.dims?.diameter ?? 1.5;
  const height = item.dims?.height ?? 0.8;
  const color = item.color || '#B6B1A9';
  if (view === 'top') {
    const fill = new THREE.Mesh(new THREE.CircleGeometry(diameter / 2, 72), makeTopFill(color, item.visual?.opacity ?? 0.2));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    fill.userData.isMain = true;
    group.add(fill);
    if (item.labelText) addTopLabel(group, item.labelText);
    return group;
  }
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, 56),
    makeStandardMaterial(color, item.visual?.materialPreset || 'matte', item.visual?.opacity ?? 1)
  );
  body.position.y = height / 2;
  body.castShadow = item.visual?.shadows !== false;
  body.userData.isMain = true;
  group.add(body);
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
  fill.userData.isMain = true;
  group.add(fill);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(0.01, Math.min(L, W) / 2 - 0.04), Math.min(L, W) / 2, 48),
    new THREE.MeshBasicMaterial({ color: colorNumber(borderColor), transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = fill.position.y + 0.002;
  group.add(ring);
  if (item.labelText) addTopLabel(group, item.labelText);
  return group;
}

function buildPerson(item, view) {
  const group = new THREE.Group();
  const height = item.dims?.height ?? 1.75;
  const color = item.color || '#2C2C31';
  const accent = item.accentColor || '#D9D4CC';
  if (view === 'top') {
    const body = new THREE.Mesh(new THREE.CircleGeometry(0.22, 36), makeTopFill(accent, 0.28));
    body.rotation.x = -Math.PI / 2;
    body.position.y = 0.04;
    body.userData.isMain = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.1, 28), makeTopFill(color, 0.8));
    head.rotation.x = -Math.PI / 2;
    head.position.set(0, 0.042, -0.14);
    group.add(head);
    return group;
  }
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, Math.max(0.2, height - 0.5), 6, 18),
    makeStandardMaterial(color, 'matte', 1)
  );
  body.position.y = height / 2;
  body.castShadow = true;
  body.userData.isMain = true;
  group.add(body);
  const sash = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.08, 0.05),
    makeStandardMaterial(accent, 'fabric', 1)
  );
  sash.position.set(0, height * 0.62, 0.17);
  group.add(sash);
  addLabel(group, item.labelText, height + 0.35);
  return group;
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
  mesh.userData.isMain = true;
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

function buildLighting(item, view) {
  const group = new THREE.Group();
  const height = item.dims?.height ?? 2.5;
  const color = item.color || '#111827';
  const lightColor = item.lightColor || '#FFE8A3';
  if (view === 'top') {
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.18, 30), makeTopFill(color, 0.9));
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.04;
    base.userData.isMain = true;
    group.add(base);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(0.42, 42), makeTopFill(lightColor, 0.28));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.041;
    group.add(halo);
    return group;
  }
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, height, 16),
    makeStandardMaterial(color, 'metal', 1)
  );
  mast.position.y = height / 2;
  mast.castShadow = true;
  mast.userData.isMain = true;
  group.add(mast);
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.18, 0.18),
    makeStandardMaterial(color, 'metal', 1)
  );
  lamp.position.y = height;
  lamp.castShadow = true;
  group.add(lamp);
  const emitter = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 18, 18),
    new THREE.MeshStandardMaterial({
      color: colorNumber(lightColor),
      emissive: colorNumber(lightColor),
      emissiveIntensity: 0.9,
      roughness: 0.2
    })
  );
  emitter.position.set(0, height, 0.12);
  group.add(emitter);
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
    fill.userData.isMain = true;
    group.add(fill);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.12), makeTopFill(accent, 0.9));
    back.rotation.x = -Math.PI / 2;
    back.position.set(0, 0.041, -D / 2 + 0.06);
    group.add(back);
    return group;
  }

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(W, H * 0.45, D),
    makeStandardMaterial(color, 'fabric', 1)
  );
  base.position.y = H * 0.22;
  base.castShadow = true;
  base.userData.isMain = true;
  group.add(base);

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(W, H * 0.4, D * 0.16),
    makeStandardMaterial(color, 'fabric', 1)
  );
  back.position.set(0, H * 0.52, -D / 2 + D * 0.08);
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

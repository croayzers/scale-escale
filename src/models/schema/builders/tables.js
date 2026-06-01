import {
  addBox, addCylinder, addLabel, addTopLabel, markMain,
  makeStandardMaterial, makeTopFill, colorNumber, annularSectorShape
} from './primitives.js';

export function buildRoundTable(item, view) {
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

export function buildChair(item, view) {
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

export function buildChairLine(item, view) {
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

function makeChair() {
  return buildChair({
    subtype: 'plegable',
    dims: { width: 0.44, depth: 0.44, seatHeight: 0.45, totalHeight: 0.92 }
  }, 'iso');
}

export function buildMesaPresi(item, view) {
  const group = new THREE.Group();
  const L     = item.dims?.length ?? 2.0;
  const W     = item.dims?.width  ?? 1.2;
  const H     = 0.74;
  const color = item.color || '#4a4744';

  if (view === 'top') {
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(L, W), makeTopFill(color, 0.18));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    markMain(fill, color);
    group.add(fill);
    addTopLabel(group, item.labelText);
    return group;
  }

  const top = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, W), makeStandardMaterial(color, 'matte', 1));
  top.position.y = H + 0.025;
  top.castShadow = true;
  top.receiveShadow = true;
  markMain(top, color);
  group.add(top);

  const cloth = new THREE.Mesh(new THREE.BoxGeometry(L + 0.04, H, W + 0.04), makeStandardMaterial('#c9c5bd', 'fabric', 1));
  cloth.position.y = H / 2;
  cloth.castShadow = true;
  group.add(cloth);

  const CHAIR_HALF_DEPTH = 0.21;
  const chairGap   = item.chairOffset ?? 0.10;
  const sideChairs = 4;
  const offsetZ    = W / 2 + CHAIR_HALF_DEPTH + chairGap;
  for (let i = 0; i < sideChairs; i++) {
    const t = (i + 0.5) / sideChairs;
    const x = -L / 2 + t * L;
    const cf = makeChair(); cf.position.set(x, 0,  offsetZ); cf.rotation.y = 0;            group.add(cf);
    const cb = makeChair(); cb.position.set(x, 0, -offsetZ); cb.rotation.y = Math.PI;      group.add(cb);
  }

  const endOffsetX = L / 2 + CHAIR_HALF_DEPTH + chairGap;
  if (item.endHead !== false) {
    const ch = makeChair(); ch.position.set( endOffsetX, 0, 0); ch.rotation.y =  Math.PI / 2; group.add(ch);
  }
  if (item.endFoot !== false) {
    const cf = makeChair(); cf.position.set(-endOffsetX, 0, 0); cf.rotation.y = -Math.PI / 2; group.add(cf);
  }

  addLabel(group, item.labelText, H + 0.45);
  return group;
}

export function buildMesaRect(item, view) {
  const group = new THREE.Group();
  const L     = item.dims?.length ?? 1.8;
  const W     = item.dims?.width  ?? 0.9;
  const H     = 0.74;
  const color = item.color || '#4a4744';

  if (view === 'top') {
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(L, W), makeTopFill(color, 0.18));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    markMain(fill, color);
    group.add(fill);
    addTopLabel(group, item.labelText);
    return group;
  }

  const top = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, W), makeStandardMaterial(color, 'matte', 1));
  top.position.y = H + 0.025;
  top.castShadow = true;
  top.receiveShadow = true;
  markMain(top, color);
  group.add(top);

  const cloth = new THREE.Mesh(new THREE.BoxGeometry(L + 0.03, H, W + 0.03), makeStandardMaterial('#c9c5bd', 'fabric', 1));
  cloth.position.y = H / 2;
  cloth.castShadow = true;
  group.add(cloth);

  placeRectChairs(group, item, L, W);
  addLabel(group, item.labelText, H + 0.45);
  return group;
}

/* Reparte sillas alrededor del perímetro de una mesa rectangular/cuadrada.
   Si item.chairs está definido, respeta exactamente ese total repartiéndolo
   entre lados largos (eje X) y cortos (eje Z) de forma proporcional y simétrica.
   Si no, recae en el comportamiento clásico: sillas solo en los lados largos. */
function placeRectChairs(group, item, L, W) {
  const CHAIR_HALF_DEPTH = 0.21;
  const gap     = item.chairOffset ?? 0.10;
  const offsetZ = W / 2 + CHAIR_HALF_DEPTH + gap;
  const offsetX = L / 2 + CHAIR_HALF_DEPTH + gap;

  const addRow = (n, axis, sidePos, rotY) => {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const c = makeChair();
      if (axis === 'x') c.position.set(-L / 2 + t * L, 0, sidePos);
      else              c.position.set(sidePos, 0, -W / 2 + t * W);
      c.rotation.y = rotY;
      group.add(c);
    }
  };

  if (item.chairs == null) {
    // Legacy: sillas solo en los dos lados largos según separación.
    const sep        = item.chairSep ?? 0.60;
    const sideChairs = Math.max(1, Math.floor(L / sep));
    addRow(sideChairs, 'x',  offsetZ, 0);
    addRow(sideChairs, 'x', -offsetZ, Math.PI);
    return;
  }

  const total = Math.max(0, Math.round(item.chairs));
  if (total === 0) return;

  // Sillas por lado corto (simétricas), el resto a los lados largos.
  const perim      = 2 * L + 2 * W;
  const nShortEach = Math.round((total * W) / perim);
  const remaining  = Math.max(0, total - 2 * nShortEach);
  const nLongFront = Math.ceil(remaining / 2);
  const nLongBack  = Math.floor(remaining / 2);

  addRow(nLongFront, 'x',  offsetZ, 0);
  addRow(nLongBack,  'x', -offsetZ, Math.PI);
  addRow(nShortEach, 'z',  offsetX, Math.PI / 2);
  addRow(nShortEach, 'z', -offsetX, -Math.PI / 2);
}

export function buildMesaCocktail(item, view) {
  const group = new THREE.Group();
  const D     = item.dims?.diameter ?? 0.8;
  const H     = item.dims?.height   ?? 1.10;
  const color = item.color || '#ffffff';

  if (view === 'top') {
    const fill = new THREE.Mesh(new THREE.CircleGeometry(D / 2 + 0.12, 48), makeTopFill(color, 0.18));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    markMain(fill, color);
    group.add(fill);
    addTopLabel(group, item.labelText);
    return group;
  }

  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(D / 2, D / 2, 0.04, 24),
    makeStandardMaterial(color, 'matte', 1)
  );
  top.position.y = H;
  top.castShadow = true;
  top.receiveShadow = true;
  markMain(top, color);
  group.add(top);

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(D / 2 + 0.02, D / 2 + 0.12, H - 0.05, 24, 1, true),
    makeStandardMaterial(color, 'fabric', 0.96)
  );
  skirt.position.y = (H - 0.05) / 2;
  skirt.castShadow = true;
  group.add(skirt);

  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, H, 8),
    makeStandardMaterial('#6b6864', 'metal', 1)
  );
  leg.position.y = H / 2;
  group.add(leg);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(D * 0.3, D * 0.35, 0.04, 16),
    makeStandardMaterial('#6b6864', 'metal', 1)
  );
  base.position.y = 0.02;
  base.castShadow = true;
  group.add(base);

  addLabel(group, item.labelText, H + 0.35);
  return group;
}

function buildArcStripGeo(rIn, rOut, ang, segs, thickness) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= segs; i++) {
    const a = -ang / 2 + (i / segs) * ang;
    const x = Math.cos(a) * rOut, y = Math.sin(a) * rOut;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  for (let i = segs; i >= 0; i--) {
    const a = -ang / 2 + (i / segs) * ang;
    shape.lineTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, thickness / 2, 0);
  return geo;
}

export function buildMesaCurva(item, view) {
  const group = new THREE.Group();
  const rIn  = item.dims?.radioInt  ?? 2.0;
  const anc  = item.dims?.anchoTab  ?? 0.7;
  const angD = item.dims?.anguloDeg ?? 90;
  const H    = item.dims?.alto      ?? 0.74;
  const sep  = item.chairSep ?? 0.60;
  const dist = item.distrib   ?? 'externa';
  const color = item.color || '#4a4744';
  const rOut  = rIn + anc;
  const ang   = angD * Math.PI / 180;

  if (view === 'top') {
    const shape = annularSectorShape(rIn, rOut, ang);
    const fill  = new THREE.Mesh(new THREE.ShapeGeometry(shape), makeTopFill(color, 0.18));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    markMain(fill, color);
    group.add(fill);
    addTopLabel(group, item.labelText);
    return group;
  }

  const segs = Math.max(8, Math.ceil(angD / 6));
  const top  = new THREE.Mesh(buildArcStripGeo(rIn, rOut, ang, segs, 0.05), makeStandardMaterial(color, 'matte', 1));
  top.position.y = H;
  top.castShadow = true;
  top.receiveShadow = true;
  markMain(top, color);
  group.add(top);

  const skirt = new THREE.Mesh(buildArcStripGeo(rIn, rOut, ang, segs, H), makeStandardMaterial('#c9c5bd', 'fabric', 1));
  skirt.position.y = H / 2;
  skirt.castShadow = true;
  group.add(skirt);

  const arcLen = (rIn + rOut) / 2 * ang;
  const nChairs = Math.max(1, Math.floor(arcLen / sep));
  const placeChairs = (radius, faceOut) => {
    for (let i = 0; i < nChairs; i++) {
      const t = (i + 0.5) / nChairs;
      const a = -ang / 2 + t * ang;
      const chair = makeChair();
      chair.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      chair.rotation.y = faceOut ? (Math.PI / 2 - a) : (-Math.PI / 2 - a);
      group.add(chair);
    }
  };
  if (dist === 'externa' || dist === 'ambas') placeChairs(rOut + 0.1, true);
  if (dist === 'interna' || dist === 'ambas') placeChairs(Math.max(0.1, rIn - 0.1), false);

  addLabel(group, item.labelText, H + 0.45);
  return group;
}

export function buildMesaSerpentina(item, view) {
  const group = new THREE.Group();
  const ang   = (item.dims?.anguloDeg ?? 60) * Math.PI / 180;
  const r     = (item.dims?.radioInt ?? 2.0) + (item.dims?.anchoTab ?? 0.7) / 2;

  const arc1 = buildMesaCurva(item, view);
  group.add(arc1);

  const invertDist = d => d === 'interna' ? 'externa' : d === 'externa' ? 'interna' : (d || 'externa');
  const cfg2 = { ...item, distrib: invertDist(item.distrib) };
  const arc2 = buildMesaCurva(cfg2, view);
  arc2.position.set(2 * r * Math.sin(ang / 2) * 2, 0, 0);
  arc2.rotation.y = Math.PI;
  group.add(arc2);

  return group;
}

export function buildMesaPlegable(group, item, L, W, H, color) {
  const topThick = 0.03;
  const legSize = 0.04;
  const legColor = '#C0BDB8';
  const inset = 0.06;
  const legH = H - topThick;

  const top = addBox(group, { size: [L, topThick, W], position: [0, H - topThick / 2, 0], color, preset: 'matte' });
  markMain(top, color);

  [[L / 2 - inset, W / 2 - inset], [L / 2 - inset, -W / 2 + inset],
   [-L / 2 + inset, W / 2 - inset], [-L / 2 + inset, -W / 2 + inset]].forEach(([x, z]) => {
    addBox(group, { size: [legSize, legH, legSize], position: [x, legH / 2, z], color: legColor, preset: 'metal' });
  });

  const braceY = H * 0.35;
  const bt = 0.02;
  addBox(group, { size: [L - 0.12, bt, bt], position: [0, braceY, W / 2 - inset], color: legColor, preset: 'metal' });
  addBox(group, { size: [L - 0.12, bt, bt], position: [0, braceY, -W / 2 + inset], color: legColor, preset: 'metal' });
}

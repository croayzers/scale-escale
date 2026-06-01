/* ─── Elementos colgantes de techo (escenografía) ───────────────────────────
   dims.height = altura a la que cuelga el objeto (posición Y de suspensión).
   Cada elemento dibuja una varilla/cable de suspensión hasta esa altura y el
   objeto colgado en su extremo. En vista top se dibuja una huella circular. */
import {
  addBox, addCylinder, addSphere, addLabel, markMain, makeTopFill,
  makeStandardMaterial, colorNumber
} from './primitives.js';

const TWO_PI = Math.PI * 2;

/* Cable/varilla fino de suspensión desde el techo (hangY) hasta el objeto (topY). */
function addDropCable(group, hangY, topY, color = '#3a3a3e') {
  const len = Math.max(0.02, hangY - topY);
  addCylinder(group, {
    radiusTop: 0.012, radiusBottom: 0.012, height: len,
    position: [0, topY + len / 2, 0], color, preset: 'metal', radialSegments: 8
  });
}

/* Anclaje al techo (placa). */
function addCeilingMount(group, hangY, color = '#2a2a2e') {
  addCylinder(group, {
    radiusTop: 0.09, radiusBottom: 0.09, height: 0.04,
    position: [0, hangY + 0.02, 0], color, preset: 'metal', radialSegments: 16
  });
}

/* ── 1. Bola de discoteca (mirror ball) ──────────────────────────────── */
export function buildDiscoBall(group, item, hangY) {
  const r = Math.max(0.18, (item.dims?.diameter ?? 0.5) / 2);
  const color = item.color || '#C7CBD1';
  addCeilingMount(group, hangY);
  const ballTopY = hangY - 0.12;
  addDropCable(group, hangY, ballTopY + r);
  // Núcleo
  const core = addSphere(group, { radius: r, position: [0, ballTopY, 0], color, preset: 'metal', segments: 24 });
  markMain(core, color);
  // Facetas: pequeños espejos sobre la esfera
  const rows = 9;
  for (let i = 0; i < rows; i++) {
    const phi = (i + 0.5) / rows * Math.PI;
    const ring = Math.max(3, Math.round(Math.sin(phi) * 14));
    for (let j = 0; j < ring; j++) {
      const theta = (j / ring) * TWO_PI;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const z = r * Math.sin(phi) * Math.sin(theta);
      const y = ballTopY + r * Math.cos(phi);
      const tile = addBox(group, {
        size: [r * 0.34, r * 0.34, 0.01],
        position: [x, y, z], color: '#EAEFF5', preset: 'metal'
      });
      tile.lookAt(0, ballTopY, 0);
    }
  }
}

/* ── 2. Araña de luces / lámpara de cristal (chandelier) ──────────────── */
export function buildChandelier(group, item, hangY) {
  const w = Math.max(0.4, item.dims?.diameter ?? 0.9);
  const color = item.color || '#D9C089';
  const lightColor = item.lightColor || '#FFE8A3';
  addCeilingMount(group, hangY);
  const topY = hangY - 0.5;
  addDropCable(group, hangY, topY + 0.3, color);
  // Cuerpo central
  const body = addCylinder(group, { radiusTop: 0.05, radiusBottom: 0.10, height: 0.3, position: [0, topY + 0.15, 0], color, preset: 'metal' });
  markMain(body, color);
  // Brazos con velas/bombillas
  const arms = 8;
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * TWO_PI;
    const x = Math.cos(a) * w / 2, z = Math.sin(a) * w / 2;
    addCylinder(group, { radiusTop: 0.018, radiusBottom: 0.018, height: w / 2, position: [x / 2, topY, z / 2], color, preset: 'metal', rotation: [0, -a, Math.PI / 2 - 0.5] });
    addSphere(group, { radius: 0.05, position: [x, topY + 0.06, z], color: lightColor, emissive: true, segments: 12 });
    // Lágrima de cristal
    addSphere(group, { radius: 0.03, position: [x * 0.7, topY - 0.18, z * 0.7], color: '#EAF2FA', preset: 'glass', opacity: 0.5, segments: 10 });
  }
}

/* ── 3. Globos colgantes (cluster de globos) ─────────────────────────── */
export function buildBalloonCluster(group, item, hangY) {
  const colors = ['#E04F5F', '#4F8FE0', '#F2C94C', '#27AE60', '#BB6BD9'];
  addCeilingMount(group, hangY);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    const rad = i === 0 ? 0 : 0.22;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const drop = 0.4 + (i % 3) * 0.18;
    const by = hangY - drop;
    const c = colors[i % colors.length];
    // Cuerda
    addCylinder(group, { radiusTop: 0.004, radiusBottom: 0.004, height: drop, position: [x, hangY - drop / 2, z], color: '#9aa', preset: 'matte', radialSegments: 6 });
    // Globo (esfera ligeramente alargada)
    const balloon = addSphere(group, { radius: 0.14, position: [x, by, z], color: c, preset: 'matte', segments: 18 });
    balloon.scale.y = 1.2;
    if (i === 0) markMain(balloon, c);
  }
}

/* ── 4. Banderines / guirnalda triangular (bunting) ──────────────────── */
export function buildBunting(group, item, hangY) {
  const span = Math.max(1.2, item.dims?.length ?? 3);
  const colors = ['#E04F5F', '#F2C94C', '#27AE60', '#4F8FE0', '#BB6BD9'];
  addCeilingMount(group, hangY);
  const segs = 14;
  const sag = span * 0.08;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push([-span / 2 + span * t, hangY - sag * (4 * t * (1 - t)), 0]);
  }
  // Cuerda
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    addCylinder(group, { radiusTop: 0.006, radiusBottom: 0.006, height: len, position: [mx, my, 0], color: '#7a6a55', preset: 'matte', radialSegments: 6, rotation: [0, 0, ang - Math.PI / 2] });
  }
  // Banderines triangulares
  const flags = 9;
  for (let i = 0; i < flags; i++) {
    const t = (i + 0.5) / flags;
    const x = -span / 2 + span * t;
    const y = hangY - sag * (4 * t * (1 - t));
    const c = colors[i % colors.length];
    const shape = new THREE.Shape();
    shape.moveTo(-0.09, 0); shape.lineTo(0.09, 0); shape.lineTo(0, -0.18); shape.closePath();
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), makeStandardMaterial(c, 'fabric', 1));
    flag.position.set(x, y, 0);
    flag.castShadow = true;
    if (i === 0) markMain(flag, c);
    group.add(flag);
  }
}

/* ── 5. Farolillos de papel (paper lanterns) ─────────────────────────── */
export function buildPaperLanterns(group, item, hangY) {
  const colors = ['#F2C94C', '#E04F5F', '#FFFFFF', '#BB6BD9'];
  addCeilingMount(group, hangY);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TWO_PI;
    const rad = i === 0 ? 0 : 0.3;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const drop = 0.5 + (i % 2) * 0.3;
    const by = hangY - drop;
    const c = colors[i % colors.length];
    addCylinder(group, { radiusTop: 0.004, radiusBottom: 0.004, height: drop, position: [x, hangY - drop / 2, z], color: '#bbb', preset: 'matte', radialSegments: 6 });
    const lantern = addSphere(group, { radius: 0.16, position: [x, by, z], color: c, preset: 'matte', segments: 18 });
    lantern.scale.y = 0.85;
    if (i === 0) markMain(lantern, c);
  }
}

/* ── 6. Pancarta / banner colgante (hanging banner) ──────────────────── */
export function buildHangingBanner(group, item, hangY) {
  const w = Math.max(0.8, item.dims?.length ?? 2);
  const h = Math.max(0.4, item.dims?.width ?? 0.7);
  const color = item.color || '#B33A3A';
  addCeilingMount(group, hangY);
  // Barra superior
  const bar = addCylinder(group, { radiusTop: 0.025, radiusBottom: 0.025, height: w + 0.1, position: [0, hangY - 0.05, 0], color: '#3a3a3e', preset: 'metal', radialSegments: 10, rotation: [0, 0, Math.PI / 2] });
  // Cuerdas
  [-w / 2 + 0.05, w / 2 - 0.05].forEach(x => addCylinder(group, { radiusTop: 0.004, radiusBottom: 0.004, height: 0.12, position: [x, hangY + 0.06, 0], color: '#888', preset: 'matte', radialSegments: 6 }));
  // Tela
  const cloth = addBox(group, { size: [w, h, 0.02], position: [0, hangY - 0.05 - h / 2, 0], color, preset: 'fabric' });
  markMain(cloth, color);
}

/* ── 7. Aro/aros decorativos colgantes (hanging hoops) ───────────────── */
export function buildHangingHoops(group, item, hangY) {
  const color = item.color || '#D9C089';
  addCeilingMount(group, hangY);
  const hoops = 3;
  for (let i = 0; i < hoops; i++) {
    const drop = 0.4 + i * 0.45;
    const r = 0.45 - i * 0.06;
    const x = (i - 1) * 0.5;
    addCylinder(group, { radiusTop: 0.004, radiusBottom: 0.004, height: drop, position: [x, hangY - drop / 2, 0], color: '#aaa', preset: 'matte', radialSegments: 6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 10, 40), makeStandardMaterial(color, 'metal', 1));
    ring.position.set(x, hangY - drop - r, 0);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    if (i === 0) markMain(ring, color);
    group.add(ring);
    // Algunas flores/hojas en el aro
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * TWO_PI;
      addSphere(group, { radius: 0.035, position: [x + Math.cos(a) * r, hangY - drop - r, Math.sin(a) * r], color: '#27AE60', preset: 'matte', segments: 8 });
    }
  }
}

/* ── 8. Cortina de luces colgante (hanging light strands) ────────────── */
export function buildLightDrop(group, item, hangY) {
  const w = Math.max(1, item.dims?.length ?? 2.4);
  const lightColor = item.lightColor || '#FFE8A3';
  addCeilingMount(group, hangY);
  // Barra superior
  addCylinder(group, { radiusTop: 0.02, radiusBottom: 0.02, height: w, position: [0, hangY - 0.03, 0], color: '#2a2a2e', preset: 'metal', radialSegments: 10, rotation: [0, 0, Math.PI / 2] });
  const strands = 7;
  for (let i = 0; i < strands; i++) {
    const x = -w / 2 + w * i / (strands - 1);
    const drop = 0.6 + (i % 3) * 0.35;
    addCylinder(group, { radiusTop: 0.003, radiusBottom: 0.003, height: drop, position: [x, hangY - drop / 2, 0], color: '#555', preset: 'matte', radialSegments: 5 });
    const bulbs = Math.max(2, Math.round(drop / 0.22));
    for (let b = 1; b <= bulbs; b++) {
      const y = hangY - (drop * b / bulbs);
      const bulb = addSphere(group, { radius: 0.028, position: [x, y, 0], color: lightColor, emissive: true, segments: 8 });
      if (i === 0 && b === 1) markMain(bulb, lightColor);
    }
  }
}

/* ── 9. Móvil de estrellas/nubes (hanging mobile) ────────────────────── */
export function buildHangingMobile(group, item, hangY) {
  const color = item.color || '#F2C94C';
  addCeilingMount(group, hangY);
  // Cruz superior
  const armLen = 0.5;
  ['x', 'z'].forEach(axis => {
    addCylinder(group, {
      radiusTop: 0.008, radiusBottom: 0.008, height: armLen * 2,
      position: [0, hangY - 0.35, 0], color: '#9a8', preset: 'matte', radialSegments: 6,
      rotation: axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]
    });
  });
  addDropCable(group, hangY, hangY - 0.35, '#9a8');
  const tips = [[armLen, 0], [-armLen, 0], [0, armLen], [0, -armLen]];
  const palette = ['#F2C94C', '#E04F5F', '#4F8FE0', '#FFFFFF'];
  tips.forEach(([x, z], i) => {
    const drop = 0.25 + (i % 2) * 0.2;
    addCylinder(group, { radiusTop: 0.003, radiusBottom: 0.003, height: drop, position: [x, hangY - 0.35 - drop / 2, z], color: '#aaa', preset: 'matte', radialSegments: 5 });
    // Estrella simplificada como esfera achatada con color
    const star = addSphere(group, { radius: 0.09, position: [x, hangY - 0.35 - drop - 0.06, z], color: palette[i % palette.length], preset: 'matte', segments: 12 });
    star.scale.set(1, 0.55, 1);
    if (i === 0) markMain(star, palette[0]);
  });
}

/* ── 10. Instalación floral colgante (floral installation) ───────────── */
export function buildFloralHang(group, item, hangY) {
  const w = Math.max(0.8, item.dims?.length ?? 1.6);
  const color = item.color || '#27AE60';
  addCeilingMount(group, hangY);
  // Base estructural
  addCylinder(group, { radiusTop: 0.02, radiusBottom: 0.02, height: w, position: [0, hangY - 0.05, 0], color: '#5a4a35', preset: 'matte', radialSegments: 8, rotation: [0, 0, Math.PI / 2] });
  const flowerColors = ['#E04F5F', '#F2C94C', '#FFFFFF', '#BB6BD9', '#27AE60'];
  const clusters = 16;
  for (let i = 0; i < clusters; i++) {
    const x = -w / 2 + Math.random() * w;
    const drop = 0.15 + Math.random() * 0.55;
    const y = hangY - 0.05 - drop;
    const z = (Math.random() - 0.5) * 0.18;
    // Follaje
    const leaf = addSphere(group, { radius: 0.07 + Math.random() * 0.04, position: [x, y, z], color, preset: 'matte', segments: 10 });
    if (i === 0) markMain(leaf, color);
    // Flor
    addSphere(group, { radius: 0.045, position: [x, y - 0.03, z + 0.05], color: flowerColors[i % flowerColors.length], preset: 'matte', segments: 8 });
  }
}

const CEILING_BUILDERS = {
  disco_ball:        buildDiscoBall,
  chandelier:        buildChandelier,
  balloon_cluster:   buildBalloonCluster,
  bunting:           buildBunting,
  paper_lanterns:    buildPaperLanterns,
  hanging_banner:    buildHangingBanner,
  hanging_hoops:     buildHangingHoops,
  light_drop:        buildLightDrop,
  hanging_mobile:    buildHangingMobile,
  floral_hang:       buildFloralHang
};

export function buildCeilingProp(item, view) {
  const group = new THREE.Group();
  const hangY = item.dims?.height ?? 2.6;   // altura de suspensión
  const color = item.color || '#C7CBD1';
  const profile = item.ceilingProfile || item.catalogDefinitionId;

  if (view === 'top') {
    const r = Math.max(0.25, (item.dims?.diameter ?? item.dims?.length ?? 0.6) / 2);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 32), makeTopFill(color, 0.5));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.04;
    markMain(fill, color);
    group.add(fill);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.85, r, 32),
      new THREE.MeshBasicMaterial({ color: colorNumber('#111827'), transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.045;
    group.add(ring);
    return group;
  }

  const builder = CEILING_BUILDERS[profile] || buildDiscoBall;
  builder(group, item, hangY);
  if (item.labelText) addLabel(group, item.labelText, hangY + 0.3, '#111827');
  return group;
}

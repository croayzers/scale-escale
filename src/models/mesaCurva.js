/* ─────────────────────────────────────────────────────────
   MESA CURVA — Arco de tablero con sillas internas/externas
   item.dims: { radioInt, anchoTab, anguloDeg, alto }
   item.chairSep    separación entre sillas (m, 0.60 por defecto)
   item.distrib:    'interna' | 'externa' | 'ambas'
   item.color:      hex
   ───────────────────────────────────────────────────────── */

export function createMesaCurva(item) {
  const g = new THREE.Group();
  const rIn   = item.dims?.radioInt  ?? 2.0;
  const anc   = item.dims?.anchoTab  ?? 0.7;
  const angD  = item.dims?.anguloDeg ?? 90;
  const H     = item.dims?.alto      ?? 0.74;
  const sep   = item.chairSep ?? 0.60;
  const dist  = item.distrib ?? 'externa';
  const color = parseHex(item.color || '#4a4744');
  const rOut  = rIn + anc;
  const ang   = angD * Math.PI / 180;

  // ── Tablero (anillo parcial usando RingGeometry rotada y extruida vía caja recortada) ──
  // Truco low-poly: aproximamos con N segmentos.
  const segs = Math.max(8, Math.ceil(angD / 6));
  const topMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, flatShading: true });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xc9c5bd, roughness: 0.9, flatShading: true });

  const tabletop = buildArcStrip(rIn, rOut, ang, segs, 0.05);
  const top = new THREE.Mesh(tabletop, topMat);
  top.position.y = H;
  top.castShadow = true; top.receiveShadow = true;
  top.userData.baseColor = color; top.userData.isMain = true;
  g.add(top);

  // Faldón: misma forma pero extruido hasta el suelo
  const skirtGeo = buildArcStrip(rIn, rOut, ang, segs, H);
  const skirt = new THREE.Mesh(skirtGeo, clothMat);
  skirt.position.y = H/2;
  skirt.userData.baseColor = 0xc9c5bd;
  g.add(skirt);

  // ── Sillas distribuidas a lo largo del arco ──
  const arcLen = (rIn + rOut) / 2 * ang;
  const nChairs = Math.max(1, Math.floor(arcLen / sep));

  const placeChair = (radius, faceOut) => {
    for (let i = 0; i < nChairs; i++) {
      const t = (i + 0.5) / nChairs;
      const a = -ang/2 + t * ang;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const chair = makeChair();
      chair.position.set(x, 0, z);
      // Mirar hacia centro (interna) o hacia fuera (externa)
      chair.rotation.y = faceOut ? a + Math.PI/2 : a - Math.PI/2;
      g.add(chair);
    }
  };

  let totalChairs = 0;
  if (dist === 'externa' || dist === 'ambas') {
    placeChair(rOut + 0.32, true);
    totalChairs += nChairs;
  }
  if (dist === 'interna' || dist === 'ambas') {
    placeChair(rIn - 0.32, false);
    totalChairs += nChairs;
  }
  item.chairs = totalChairs;

  return g;
}

/* Construye una franja en forma de arco entre rIn y rOut, altura `thickness` */
function buildArcStrip(rIn, rOut, ang, segs, thickness) {
  const shape = new THREE.Shape();
  // Borde exterior
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = -ang/2 + t * ang;
    const x = Math.cos(a) * rOut;
    const y = Math.sin(a) * rOut;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  // Borde interior (en sentido inverso)
  for (let i = segs; i >= 0; i--) {
    const t = i / segs;
    const a = -ang/2 + t * ang;
    const x = Math.cos(a) * rIn;
    const y = Math.sin(a) * rIn;
    shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  // ExtrudeGeometry extruye en Z; rotamos para que el grosor vaya en Y
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, thickness/2, 0);
  return geo;
}

function makeChair() {
  const c = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x55524d, roughness: 0.55, flatShading: true });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), mat);
  seat.position.y = 0.45; seat.castShadow = true;
  seat.userData.baseColor = 0x55524d;
  c.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.04), mat.clone());
  back.position.set(0, 0.7, -0.19); back.castShadow = true;
  back.userData.baseColor = 0x55524d;
  c.add(back);
  return c;
}

function parseHex(h) { return parseInt((h || '#4a4744').replace('#',''),16); }
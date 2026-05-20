/* ─────────────────────────────────────────────────────────
   CARPA PABELLÓN — Rectangular tipo "frame tent" con techo
   a 2 aguas y cumbrera longitudinal. Estructura modular con
   postes perimetrales cada `modSpacing` metros.
   item.dims: { length, width, height, ridgeRise, modSpacing }
   ───────────────────────────────────────────────────────── */

export function createCarpaPabellon(item) {
  const g = new THREE.Group();
  g.userData.isCarpa = true;

  const L     = item.dims?.length     ?? 12.0;
  const W     = item.dims?.width      ?? 6.0;
  const eaveH = item.dims?.height     ?? 3.0;
  const rise  = item.dims?.ridgeRise  ?? 1.8;
  const mod   = item.dims?.modSpacing ?? 3.0;
  const ridgeH = eaveH + rise;

  const tarpColor = parseHex(item.tarpColor || '#f0ead8');
  const poleColor = parseHex(item.poleColor || '#3a4d5c');

  // ── Base ──
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshBasicMaterial({
      color: 0x3a4d5c, transparent: true, opacity: 0.08,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  base.rotation.x = -Math.PI/2;
  base.position.y = 0.015;
  base.userData.baseColor = 0x3a4d5c;
  base.userData.baseOpacity = 0.08;
  base.userData.isMain = true;
  g.add(base);

  // ── Postes perimetrales modulares ──
  const postMat = new THREE.MeshStandardMaterial({
    color: poleColor, roughness: 0.5, metalness: 0.6, flatShading: true
  });
  const nMods = Math.max(1, Math.round(L / mod));
  const stepX = L / nMods;
  const xs = [];
  for (let i = 0; i <= nMods; i++) xs.push(-L/2 + i * stepX);

  xs.forEach(x => {
    [-W/2, W/2].forEach(z => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, eaveH, 10), postMat.clone());
      post.position.set(x, eaveH/2, z);
      post.castShadow = true;
      post.userData.baseColor = poleColor;
      g.add(post);
    });
    // Tirante (caballete) en cada módulo: poste vertical hasta cumbrera
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, ridgeH, 8), postMat.clone());
    ridge.position.set(x, ridgeH/2, 0);
    ridge.castShadow = true;
    ridge.userData.baseColor = poleColor;
    g.add(ridge);
  });

  // ── Cumbrera horizontal (línea continua) ──
  const ridgeLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-L/2, ridgeH, 0),
    new THREE.Vector3( L/2, ridgeH, 0),
  ]);
  g.add(new THREE.Line(ridgeLineGeo, new THREE.LineBasicMaterial({ color: 0x1a1a1c })));

  // ── Cubierta a 2 aguas (2 grandes rectángulos inclinados) ──
  const tarpMat = new THREE.MeshStandardMaterial({
    color: tarpColor, roughness: 0.85, side: THREE.DoubleSide,
    transparent: true, opacity: 0.94, flatShading: true
  });

  // Faldón sur (Z negativo)
  const south = buildRoofPanel(
    [-L/2, eaveH, -W/2],
    [ L/2, eaveH, -W/2],
    [ L/2, ridgeH, 0],
    [-L/2, ridgeH, 0]
  );
  const sMesh = new THREE.Mesh(south, tarpMat.clone());
  sMesh.castShadow = true; sMesh.receiveShadow = true;
  sMesh.userData.baseColor = tarpColor;
  g.add(sMesh);

  // Faldón norte
  const north = buildRoofPanel(
    [-L/2, ridgeH, 0],
    [ L/2, ridgeH, 0],
    [ L/2, eaveH,  W/2],
    [-L/2, eaveH,  W/2]
  );
  const nMesh = new THREE.Mesh(north, tarpMat.clone());
  nMesh.castShadow = true; nMesh.receiveShadow = true;
  nMesh.userData.baseColor = tarpColor;
  g.add(nMesh);

  // Tímpanos (triángulos en los testeros este/oeste)
  [-L/2, L/2].forEach(x => {
    const verts = new Float32Array([
      x, eaveH, -W/2,
      x, eaveH,  W/2,
      x, ridgeH, 0
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const t = new THREE.Mesh(geo, tarpMat.clone());
    t.castShadow = true;
    t.userData.baseColor = tarpColor;
    g.add(t);
  });

  return g;
}

function buildRoofPanel(a, b, c, d) {
  const v = new Float32Array([
    ...a, ...b, ...c,
    ...a, ...c, ...d
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}

function parseHex(h) { return parseInt((h || '#f0ead8').replace('#',''),16); }
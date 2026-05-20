/* ─────────────────────────────────────────────────────────
   CARPA BEDUINA — Tela tensada con curvas orgánicas tipo
   stretch tent: 4 picos en esquinas + 2-4 picos centrales
   altos. Geometría tipo "tela elástica".
   item.dims: { length, width, cornerHeight, peakHeight, sideDrop }
   ───────────────────────────────────────────────────────── */

export function createCarpaBeduina(item) {
  const g = new THREE.Group();
  g.userData.isCarpa = true;

  const L      = item.dims?.length        ?? 12.0;
  const W      = item.dims?.width         ?? 7.0;
  const cornH  = item.dims?.cornerHeight  ?? 2.2;
  const peakH  = item.dims?.peakHeight    ?? 4.0;
  const sideDr = item.dims?.sideDrop      ?? 1.4;   // caída a medio lado
  const tarpColor = parseHex(item.tarpColor || '#d9b88a');
  const poleColor = parseHex(item.poleColor || '#3a2d1f');

  // ── Base ──
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 1.1, W * 1.2),
    new THREE.MeshBasicMaterial({
      color: 0x3a2d1f, transparent: true, opacity: 0.08,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  base.rotation.x = -Math.PI/2;
  base.position.y = 0.015;
  base.userData.baseColor = 0x3a2d1f;
  base.userData.baseOpacity = 0.08;
  base.userData.isMain = true;
  g.add(base);

  // ── Postes de las 4 esquinas ──
  const postMat = new THREE.MeshStandardMaterial({
    color: poleColor, roughness: 0.7, metalness: 0.1, flatShading: true
  });
  const corners = [
    [-L/2, cornH, -W/2],[ L/2, cornH, -W/2],
    [ L/2, cornH,  W/2],[-L/2, cornH,  W/2]
  ];
  corners.forEach(([x,y,z]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, cornH, 10), postMat.clone());
    post.position.set(x, y/2, z);
    post.castShadow = true;
    post.userData.baseColor = poleColor;
    g.add(post);
  });

  // ── 2 mástiles centrales altos ──
  const peakXs = [-L/4, L/4];
  peakXs.forEach(px => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, peakH, 10), postMat.clone());
    mast.position.set(px, peakH/2, 0);
    mast.castShadow = true;
    mast.userData.baseColor = poleColor;
    g.add(mast);
  });

  // ── Tela orgánica: rejilla con altura definida por función ──
  const tarpMat = new THREE.MeshStandardMaterial({
    color: tarpColor, roughness: 0.92, side: THREE.DoubleSide,
    transparent: true, opacity: 0.96, flatShading: false
  });

  const segsX = 28, segsZ = 16;
  const verts = [];
  const grid = [];
  for (let i = 0; i <= segsZ; i++) {
    const row = [];
    const tz = i / segsZ;             // 0..1
    const z = -W/2 + tz * W;
    for (let j = 0; j <= segsX; j++) {
      const tx = j / segsX;
      const x = -L/2 + tx * L;

      // Esquinas a cornH, lados con caída sideDr
      // Función: altura mínima en lados (longitudinales) z=±W/2
      const sideFactor = Math.cos((tz - 0.5) * Math.PI);   // 1 centro, 0 lados
      let y = cornH + sideFactor * (sideDr * 0.5);

      // Cada mástil sube la tela:
      peakXs.forEach(px => {
        const dx = (x - px) / (L * 0.30);
        const peakFactor = Math.exp(-dx * dx);
        y += peakFactor * (peakH - cornH) * sideFactor;
      });

      // Caída orgánica entre los dos picos (suave U invertida):
      const midCarry = sideFactor * 0.3 * Math.sin((tx) * Math.PI);
      y += midCarry;

      row.push(new THREE.Vector3(x, y, z));
    }
    grid.push(row);
  }

  for (let i = 0; i < segsZ; i++) {
    for (let j = 0; j < segsX; j++) {
      const a = grid[i][j], b = grid[i][j+1], c = grid[i+1][j+1], d = grid[i+1][j];
      verts.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z);
      verts.push(a.x,a.y,a.z, c.x,c.y,c.z, d.x,d.y,d.z);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const tela = new THREE.Mesh(geo, tarpMat);
  tela.castShadow = true; tela.receiveShadow = true;
  tela.userData.baseColor = tarpColor;
  g.add(tela);

  // Cuerdas de tensión a los picos centrales (visuales)
  const ropeMat = new THREE.LineBasicMaterial({ color: 0x2a1810 });
  peakXs.forEach(px => {
    const top = new THREE.Vector3(px, peakH, 0);
    [-W*0.7, W*0.7].forEach(ze => {
      const rope = new THREE.BufferGeometry().setFromPoints([
        top, new THREE.Vector3(px + (ze>0?0.5:-0.5), 0, ze)
      ]);
      g.add(new THREE.Line(rope, ropeMat));
    });
  });

  return g;
}

function parseHex(h) { return parseInt((h || '#d9b88a').replace('#',''),16); }
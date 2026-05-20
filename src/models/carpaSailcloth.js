/* ─────────────────────────────────────────────────────────
   CARPA SAILCLOTH — Vela elegante con varios picos centrales
   y caída orgánica. Tela traslúcida.
   item.dims: { length, width, eaveHeight, peakHeight, peaks }
   ───────────────────────────────────────────────────────── */

export function createCarpaSailcloth(item) {
  const g = new THREE.Group();
  g.userData.isCarpa = true;

  const L      = item.dims?.length     ?? 14.0;
  const W      = item.dims?.width      ?? 8.0;
  const eaveH  = item.dims?.eaveHeight ?? 2.6;
  const peakH  = item.dims?.peakHeight ?? 5.0;
  const peaks  = item.dims?.peaks      ?? 2;
  const tarpColor = parseHex(item.tarpColor || '#f8f5ec');
  const poleColor = parseHex(item.poleColor || '#5d4a36');

  // ── Base ──
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshBasicMaterial({
      color: 0x5d4a36, transparent: true, opacity: 0.07,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  base.rotation.x = -Math.PI/2;
  base.position.y = 0.015;
  base.userData.baseColor = 0x5d4a36;
  base.userData.baseOpacity = 0.07;
  base.userData.isMain = true;
  g.add(base);

  // ── Postes perimetrales (4 esquinas) ──
  const postMat = new THREE.MeshStandardMaterial({
    color: poleColor, roughness: 0.55, metalness: 0.15, flatShading: true
  });
  const corners = [[-L/2,-W/2],[L/2,-W/2],[L/2,W/2],[-L/2,W/2]];
  corners.forEach(([x,z]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, eaveH, 12), postMat.clone());
    post.position.set(x, eaveH/2, z);
    post.castShadow = true;
    post.userData.baseColor = poleColor;
    g.add(post);
  });

  // ── Mástiles centrales ──
  const peakXs = [];
  for (let i = 0; i < peaks; i++) {
    const t = (i + 1) / (peaks + 1);
    const x = -L/2 + t * L;
    peakXs.push(x);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, peakH, 12), postMat.clone());
    mast.position.set(x, peakH/2, 0);
    mast.castShadow = true;
    mast.userData.baseColor = poleColor;
    g.add(mast);
  }

  // ── Cubierta de vela: rejilla L×W con altura interpolada ──
  const tarpMat = new THREE.MeshStandardMaterial({
    color: tarpColor, roughness: 0.7, side: THREE.DoubleSide,
    transparent: true, opacity: 0.88, flatShading: false
  });

  const segsX = 24, segsZ = 12;
  const verts = [];
  const grid = [];
  for (let i = 0; i <= segsZ; i++) {
    const row = [];
    const tz = i / segsZ;
    const z = -W/2 + tz * W;
    for (let j = 0; j <= segsX; j++) {
      const tx = j / segsX;
      const x = -L/2 + tx * L;
      // Altura: combinamos altura del faldón + influencia de cada pico
      // El faldón está a eaveH en los bordes (z=±W/2). Curva en Z:
      const zFactor = Math.cos((tz - 0.5) * Math.PI);   // 1 en centro, 0 en bordes
      let y = eaveH + zFactor * 0.4;                     // panza ligera
      // Influencia de cada pico (gaussiana en X)
      peakXs.forEach(px => {
        const dx = (x - px) / (L / peaks);
        const peakFactor = Math.exp(-dx * dx * 4);
        y += peakFactor * (peakH - eaveH) * zFactor;
      });
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
  const sail = new THREE.Mesh(geo, tarpMat);
  sail.castShadow = true; sail.receiveShadow = true;
  sail.userData.baseColor = tarpColor;
  g.add(sail);

  return g;
}

function parseHex(h) { return parseInt((h || '#f8f5ec').replace('#',''),16); }
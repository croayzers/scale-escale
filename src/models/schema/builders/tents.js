import { markMain, colorNumber } from './primitives.js';

// ── Private geometry helpers ────────────────────────────────

export function computePostPositions(L, W, spacing) {
  const positions = [];
  const sides = [
    { from: [-L / 2, -W / 2], to: [ L / 2, -W / 2] },
    { from: [ L / 2, -W / 2], to: [ L / 2,  W / 2] },
    { from: [ L / 2,  W / 2], to: [-L / 2,  W / 2] },
    { from: [-L / 2,  W / 2], to: [-L / 2, -W / 2] },
  ];
  sides.forEach(({ from, to }) => {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const sideLen = Math.hypot(dx, dz);
    const segs = Math.max(1, Math.ceil(sideLen / spacing));
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      positions.push([from[0] + dx * t, from[1] + dz * t]);
    }
  });
  return positions;
}

function computeColumnPositions(L, W, rows, cols) {
  const positions = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      positions.push([-L / 2 + (L * c) / (cols + 1), -W / 2 + (W * r) / (rows + 1)]);
    }
  }
  return positions;
}

function createPyramidRoof(L, W, eaveH, ridgeH, color) {
  const group = new THREE.Group();
  const mat   = new THREE.MeshStandardMaterial({
    color: colorNumber(color), roughness: 0.85, flatShading: true,
    side: THREE.DoubleSide, transparent: true, opacity: 0.92
  });

  const rs = -L / 4, re = L / 4;
  const corners = {
    SW: [-L / 2, eaveH, -W / 2], SE: [ L / 2, eaveH, -W / 2],
    NE: [ L / 2, eaveH,  W / 2], NW: [-L / 2, eaveH,  W / 2],
    SR: [rs, ridgeH, 0],          ER: [re, ridgeH, 0]
  };
  const verts = [];
  const pushTri = (a, b, c) => verts.push(...a, ...b, ...c);
  pushTri(corners.SW, corners.SE, corners.ER); pushTri(corners.SW, corners.ER, corners.SR);
  pushTri(corners.NE, corners.NW, corners.SR); pushTri(corners.NE, corners.SR, corners.ER);
  pushTri(corners.SE, corners.NE, corners.ER);
  pushTri(corners.NW, corners.SW, corners.SR);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const roof = new THREE.Mesh(geo, mat);
  roof.castShadow = true;
  group.add(roof);

  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...corners.SR), new THREE.Vector3(...corners.ER)]),
    new THREE.LineBasicMaterial({ color: 0x2a1810 })
  ));
  return group;
}

function buildRoofPanel(a, b, c, d) {
  const v = new Float32Array([...a, ...b, ...c, ...a, ...c, ...d]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildSailTriangle(A, B, C, mat, baseColor) {
  const segs  = 4;
  const verts = [];
  const pts   = [];
  for (let i = 0; i <= segs; i++) {
    for (let j = 0; j <= segs - i; j++) {
      const k = segs - i - j;
      const u = i / segs, v = j / segs, w = k / segs;
      const dip = 4 * u * v * w;
      pts.push(new THREE.Vector3(u * A.x + v * B.x + w * C.x, u * A.y + v * B.y + w * C.y - dip * 0.6, u * A.z + v * B.z + w * C.z));
    }
  }
  const idx = (i, j) => { let n = 0; for (let k = 0; k < i; k++) n += (segs - k + 1); return n + j; };
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < segs - i; j++) {
      const a = pts[idx(i, j)], b = pts[idx(i, j + 1)], c = pts[idx(i + 1, j)];
      verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      if (j < segs - i - 1) {
        const d = pts[idx(i + 1, j + 1)];
        verts.push(b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ── Tent builders ────────────────────────────────────────────

export function buildCarpa(item, view) {
  const group = new THREE.Group();
  group.userData.isCarpa = true;

  const L = item.dims?.length ?? 10;
  const W = item.dims?.width  ?? 6;
  const isTop = view === 'top';

  const postsEnabled  = item.posts?.enabled !== false;
  const postD         = item.posts?.diameter ?? 0.10;
  const postSpacing   = item.posts?.spacing  ?? 2.0;
  const eaveH         = item.posts?.height   ?? 3.0;
  const ridgeH        = eaveH + 0.8;
  const colsEnabled   = item.columns?.enabled === true;
  const colRows       = Math.max(1, item.columns?.rows ?? 1);
  const colCols       = Math.max(1, item.columns?.cols ?? 2);
  const colDiameter   = item.columns?.diameter ?? 0.15;

  const baseFill = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshBasicMaterial({ color: 0x6b4423, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false })
  );
  baseFill.rotation.x = -Math.PI / 2;
  baseFill.position.y = 0.015;
  markMain(baseFill, '#6b4423');
  group.add(baseFill);

  const edgePts = [
    new THREE.Vector3(-L / 2, 0.02, -W / 2), new THREE.Vector3( L / 2, 0.02, -W / 2),
    new THREE.Vector3( L / 2, 0.02,  W / 2), new THREE.Vector3(-L / 2, 0.02,  W / 2),
    new THREE.Vector3(-L / 2, 0.02, -W / 2)
  ];
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(edgePts),
    new THREE.LineBasicMaterial({ color: 0x6b4423, linewidth: 2 })
  ));

  const postPositions   = computePostPositions(L, W, postSpacing);
  const columnPositions = colsEnabled ? computeColumnPositions(L, W, colRows, colCols) : [];

  if (!isTop) {
    if (postsEnabled) {
      const postMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.7, metalness: 0.1, flatShading: true });
      postPositions.forEach(([px, pz]) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(postD / 2, postD / 2, eaveH, 8), postMat.clone());
        post.position.set(px, eaveH / 2, pz);
        post.castShadow = true;
        group.add(post);
      });
    }
    if (colsEnabled) {
      const colMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6, metalness: 0.2, flatShading: true });
      columnPositions.forEach(([cx, cz]) => {
        const colHeight = ridgeH - (ridgeH - eaveH) * (Math.abs(cz) / (W / 2));
        const col = new THREE.Mesh(new THREE.CylinderGeometry(colDiameter / 2, colDiameter / 2, colHeight, 10), colMat.clone());
        col.position.set(cx, colHeight / 2, cz);
        col.castShadow = true;
        group.add(col);
      });
    }
    group.add(createPyramidRoof(L, W, eaveH, ridgeH, '#3b2a1a'));
  }

  if (isTop) {
    if (postsEnabled) {
      const circleGeo = new THREE.CircleGeometry(Math.max(postD * 1.5, 0.08), 16);
      const circleMat = new THREE.MeshBasicMaterial({ color: 0x6b4423, side: THREE.DoubleSide });
      postPositions.forEach(([px, pz]) => {
        const c = new THREE.Mesh(circleGeo, circleMat.clone());
        c.rotation.x = -Math.PI / 2;
        c.position.set(px, 0.025, pz);
        group.add(c);
      });
    }
    if (colsEnabled) {
      const colGeo = new THREE.CircleGeometry(Math.max(colDiameter * 1.5, 0.12), 18);
      const colMat = new THREE.MeshBasicMaterial({ color: 0x8b5a2b, side: THREE.DoubleSide });
      columnPositions.forEach(([cx, cz]) => {
        const c = new THREE.Mesh(colGeo, colMat.clone());
        c.rotation.x = -Math.PI / 2;
        c.position.set(cx, 0.027, cz);
        group.add(c);
      });
    }
  }

  return group;
}

export function buildCarpaCuadrada(item, view) {
  const group = new THREE.Group();
  group.userData.isCarpa = true;

  const S      = item.dims?.size       ?? 6.0;
  const eaveH  = item.dims?.height     ?? 3.0;
  const ridgeH = eaveH + (item.dims?.ridgeRise ?? 1.6);
  const tarpColor = item.tarpColor || '#f5f1e8';
  const poleColor = item.poleColor || '#6b4423';

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(S, S),
    new THREE.MeshBasicMaterial({ color: 0x6b4423, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.015;
  markMain(base, poleColor);
  group.add(base);

  if (view === 'top') {
    return group;
  }

  const postMat = new THREE.MeshStandardMaterial({ color: colorNumber(poleColor), roughness: 0.6, metalness: 0.2, flatShading: true });
  [[-S / 2, -S / 2], [S / 2, -S / 2], [S / 2, S / 2], [-S / 2, S / 2]].forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, eaveH, 10), postMat.clone());
    post.position.set(x, eaveH / 2, z);
    post.castShadow = true;
    group.add(post);
  });

  const tarpMat = new THREE.MeshStandardMaterial({ color: colorNumber(tarpColor), roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 0.94, flatShading: true });
  const apex = new THREE.Vector3(0, ridgeH, 0);
  const cN = new THREE.Vector3(-S / 2, eaveH,  S / 2);
  const cE = new THREE.Vector3( S / 2, eaveH,  S / 2);
  const cS = new THREE.Vector3( S / 2, eaveH, -S / 2);
  const cW = new THREE.Vector3(-S / 2, eaveH, -S / 2);
  [[cN, cE], [cE, cS], [cS, cW], [cW, cN]].forEach(([a, b]) => {
    const v = new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z, apex.x, apex.y, apex.z]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, tarpMat.clone());
    m.castShadow = true;
    group.add(m);
  });

  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([cW, cN, cE, cS, cW]),
    new THREE.LineBasicMaterial({ color: 0x2a1810 })
  ));
  const apexSphere = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.6 }));
  apexSphere.position.copy(apex);
  group.add(apexSphere);

  return group;
}

export function buildCarpaStar(item, view) {
  const group = new THREE.Group();
  group.userData.isCarpa = true;

  const R        = (item.dims?.size  ?? 8.0) / 2;
  const eaveH    = item.dims?.height   ?? 2.6;
  const peakH    = eaveH + (item.dims?.peakRise ?? 2.2);
  const tarpColor = item.tarpColor || '#ede7d6';
  const poleColor = item.poleColor || '#6b4423';

  const base = new THREE.Mesh(
    new THREE.CircleGeometry(R, 6),
    new THREE.MeshBasicMaterial({ color: 0x6b4423, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.015;
  markMain(base, poleColor);
  group.add(base);

  if (view === 'top') {
    return group;
  }

  const postMat = new THREE.MeshStandardMaterial({ color: colorNumber(poleColor), roughness: 0.6, metalness: 0.2, flatShading: true });
  const outerPts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    outerPts.push(new THREE.Vector3(Math.cos(a) * R, eaveH, Math.sin(a) * R));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, eaveH, 10), postMat.clone());
    post.position.set(Math.cos(a) * R, eaveH / 2, Math.sin(a) * R);
    post.castShadow = true;
    group.add(post);
  }
  const center = new THREE.Vector3(0, peakH, 0);
  const centerPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, peakH, 10), postMat.clone());
  centerPost.position.set(0, peakH / 2, 0);
  centerPost.castShadow = true;
  group.add(centerPost);

  const tarpMat = new THREE.MeshStandardMaterial({ color: colorNumber(tarpColor), roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 0.94, flatShading: true });
  for (let i = 0; i < 6; i++) {
    group.add(buildSailTriangle(outerPts[i], outerPts[(i + 1) % 6], center, tarpMat, tarpColor));
  }

  return group;
}

export function buildCarpaPabellon(item, view) {
  const group = new THREE.Group();
  group.userData.isCarpa = true;

  const L     = item.dims?.length     ?? 12.0;
  const W     = item.dims?.width      ?? 6.0;
  const eaveH = item.dims?.height     ?? 3.0;
  const rise  = item.dims?.ridgeRise  ?? 1.8;
  const mod   = item.dims?.modSpacing ?? 3.0;
  const ridgeH = eaveH + rise;
  const tarpColor = item.tarpColor || '#f0ead8';
  const poleColor = item.poleColor || '#3a4d5c';

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshBasicMaterial({ color: 0x3a4d5c, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.015;
  markMain(base, poleColor);
  group.add(base);

  if (view === 'top') {
    return group;
  }

  const postMat = new THREE.MeshStandardMaterial({ color: colorNumber(poleColor), roughness: 0.5, metalness: 0.6, flatShading: true });
  const nMods = Math.max(1, Math.round(L / mod));
  const stepX = L / nMods;
  const xs = Array.from({ length: nMods + 1 }, (_, i) => -L / 2 + i * stepX);

  xs.forEach(x => {
    [-W / 2, W / 2].forEach(z => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, eaveH, 10), postMat.clone());
      post.position.set(x, eaveH / 2, z);
      post.castShadow = true;
      group.add(post);
    });
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, ridgeH, 8), postMat.clone());
    ridge.position.set(x, ridgeH / 2, 0);
    ridge.castShadow = true;
    group.add(ridge);
  });

  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-L / 2, ridgeH, 0), new THREE.Vector3(L / 2, ridgeH, 0)]),
    new THREE.LineBasicMaterial({ color: 0x1a1a1c })
  ));

  const tarpMat = new THREE.MeshStandardMaterial({ color: colorNumber(tarpColor), roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 0.94, flatShading: true });
  const sMesh = new THREE.Mesh(buildRoofPanel([-L / 2, eaveH, -W / 2], [L / 2, eaveH, -W / 2], [L / 2, ridgeH, 0], [-L / 2, ridgeH, 0]), tarpMat.clone());
  sMesh.castShadow = true;
  group.add(sMesh);
  const nMesh = new THREE.Mesh(buildRoofPanel([-L / 2, ridgeH, 0], [L / 2, ridgeH, 0], [L / 2, eaveH, W / 2], [-L / 2, eaveH, W / 2]), tarpMat.clone());
  nMesh.castShadow = true;
  group.add(nMesh);
  [-L / 2, L / 2].forEach(x => {
    const v = new Float32Array([x, eaveH, -W / 2, x, eaveH, W / 2, x, ridgeH, 0]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    const t = new THREE.Mesh(g, tarpMat.clone());
    t.castShadow = true;
    group.add(t);
  });

  return group;
}

export function buildCarpaSailcloth(item, view) {
  const group = new THREE.Group();
  group.userData.isCarpa = true;

  const L      = item.dims?.length     ?? 14.0;
  const W      = item.dims?.width      ?? 8.0;
  const eaveH  = item.dims?.eaveHeight ?? 2.6;
  const peakH  = item.dims?.peakHeight ?? 5.0;
  const peaks  = item.dims?.peaks      ?? 2;
  const tarpColor = item.tarpColor || '#f8f5ec';
  const poleColor = item.poleColor || '#5d4a36';

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshBasicMaterial({ color: 0x5d4a36, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.015;
  markMain(base, poleColor);
  group.add(base);

  if (view === 'top') {
    return group;
  }

  const postMat = new THREE.MeshStandardMaterial({ color: colorNumber(poleColor), roughness: 0.55, metalness: 0.15, flatShading: true });
  [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]].forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, eaveH, 12), postMat.clone());
    post.position.set(x, eaveH / 2, z);
    post.castShadow = true;
    group.add(post);
  });

  const peakXs = Array.from({ length: peaks }, (_, i) => -L / 2 + ((i + 1) / (peaks + 1)) * L);
  peakXs.forEach(px => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, peakH, 12), postMat.clone());
    mast.position.set(px, peakH / 2, 0);
    mast.castShadow = true;
    group.add(mast);
  });

  const tarpMat = new THREE.MeshStandardMaterial({ color: colorNumber(tarpColor), roughness: 0.7, side: THREE.DoubleSide, transparent: true, opacity: 0.88, flatShading: false });
  const segsX = 24, segsZ = 12;
  const verts = [];
  const grid  = [];
  for (let i = 0; i <= segsZ; i++) {
    const row = [];
    const tz  = i / segsZ;
    const z   = -W / 2 + tz * W;
    const zFactor = Math.cos((tz - 0.5) * Math.PI);
    for (let j = 0; j <= segsX; j++) {
      const tx = j / segsX;
      const x  = -L / 2 + tx * L;
      let y    = eaveH + zFactor * 0.4;
      peakXs.forEach(px => { const dx = (x - px) / (L / peaks); y += Math.exp(-dx * dx * 4) * (peakH - eaveH) * zFactor; });
      row.push(new THREE.Vector3(x, y, z));
    }
    grid.push(row);
  }
  for (let i = 0; i < segsZ; i++) {
    for (let j = 0; j < segsX; j++) {
      const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j + 1], d = grid[i + 1][j];
      verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const sail = new THREE.Mesh(geo, tarpMat);
  sail.castShadow = true;
  group.add(sail);

  return group;
}

export function buildCarpaBeduina(item, view) {
  const group = new THREE.Group();
  group.userData.isCarpa = true;

  const L      = item.dims?.length       ?? 12.0;
  const W      = item.dims?.width        ?? 7.0;
  const cornH  = item.dims?.cornerHeight ?? 2.2;
  const peakH  = item.dims?.peakHeight   ?? 4.0;
  const sideDr = item.dims?.sideDrop     ?? 1.4;
  const tarpColor = item.tarpColor || '#d9b88a';
  const poleColor = item.poleColor || '#3a2d1f';

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 1.1, W * 1.2),
    new THREE.MeshBasicMaterial({ color: 0x3a2d1f, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.015;
  markMain(base, poleColor);
  group.add(base);

  if (view === 'top') {
    return group;
  }

  const postMat = new THREE.MeshStandardMaterial({ color: colorNumber(poleColor), roughness: 0.7, metalness: 0.1, flatShading: true });
  [[-L / 2, cornH, -W / 2], [L / 2, cornH, -W / 2], [L / 2, cornH, W / 2], [-L / 2, cornH, W / 2]].forEach(([x, y, z]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, y, 10), postMat.clone());
    post.position.set(x, y / 2, z);
    post.castShadow = true;
    group.add(post);
  });

  const peakXs = [-L / 4, L / 4];
  peakXs.forEach(px => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, peakH, 10), postMat.clone());
    mast.position.set(px, peakH / 2, 0);
    mast.castShadow = true;
    group.add(mast);
  });

  const tarpMat = new THREE.MeshStandardMaterial({ color: colorNumber(tarpColor), roughness: 0.92, side: THREE.DoubleSide, transparent: true, opacity: 0.96, flatShading: false });
  const segsX = 28, segsZ = 16;
  const verts = [];
  const grid  = [];
  for (let i = 0; i <= segsZ; i++) {
    const row  = [];
    const tz   = i / segsZ;
    const z    = -W / 2 + tz * W;
    const sideFactor = Math.cos((tz - 0.5) * Math.PI);
    for (let j = 0; j <= segsX; j++) {
      const tx = j / segsX;
      const x  = -L / 2 + tx * L;
      let y    = cornH + sideFactor * (sideDr * 0.5);
      peakXs.forEach(px => { const dx = (x - px) / (L * 0.30); y += Math.exp(-dx * dx) * (peakH - cornH) * sideFactor; });
      y += sideFactor * 0.3 * Math.sin(tx * Math.PI);
      row.push(new THREE.Vector3(x, y, z));
    }
    grid.push(row);
  }
  for (let i = 0; i < segsZ; i++) {
    for (let j = 0; j < segsX; j++) {
      const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j + 1], d = grid[i + 1][j];
      verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const tela = new THREE.Mesh(geo, tarpMat);
  tela.castShadow = true;
  group.add(tela);

  const ropeMat = new THREE.LineBasicMaterial({ color: 0x2a1810 });
  peakXs.forEach(px => {
    const top = new THREE.Vector3(px, peakH, 0);
    [-W * 0.7, W * 0.7].forEach(ze => {
      group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([top, new THREE.Vector3(px + (ze > 0 ? 0.5 : -0.5), 0, ze)]),
        ropeMat
      ));
    });
  });

  return group;
}

export function buildCarpaTipi(item, view) {
  const group = new THREE.Group();
  group.userData.isCarpa = true;

  const D = item.dims?.diameter ?? 6.0;
  const H = item.dims?.height   ?? 5.5;
  const R = D / 2;
  const tarpColor = item.tarpColor || '#e8dcc4';
  const poleColor = item.poleColor || '#3a2d1f';

  const base = new THREE.Mesh(
    new THREE.CircleGeometry(R, 24),
    new THREE.MeshBasicMaterial({ color: 0x3a2d1f, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.015;
  markMain(base, poleColor);
  group.add(base);

  if (view === 'top') {
    return group;
  }

  const tarpMat = new THREE.MeshStandardMaterial({ color: colorNumber(tarpColor), roughness: 0.88, side: THREE.DoubleSide, transparent: true, opacity: 0.95, flatShading: false });
  const segments = 32, aperture = 2, apStart = segments / 2 - aperture / 2;
  const verts = [];
  for (let i = 0; i < segments; i++) {
    if (i >= apStart && i < apStart + aperture) continue;
    const a1 = (i / segments) * Math.PI * 2, a2 = ((i + 1) / segments) * Math.PI * 2;
    const p1 = [Math.cos(a1) * R, 0, Math.sin(a1) * R];
    const p2 = [Math.cos(a2) * R, 0, Math.sin(a2) * R];
    const ap = [0, H * 0.92, 0];
    verts.push(...p1, ...p2, ...ap);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const cone = new THREE.Mesh(geo, tarpMat);
  cone.castShadow = true;
  group.add(cone);

  const poleMat = new THREE.MeshStandardMaterial({ color: colorNumber(poleColor), roughness: 0.85, flatShading: true });
  const nPoles  = 8;
  for (let i = 0; i < nPoles; i++) {
    const a    = (i / nPoles) * Math.PI * 2 + Math.PI / nPoles;
    const xB   = Math.cos(a) * R * 0.96, zB = Math.sin(a) * R * 0.96;
    const xT   = Math.cos(a) * R * 0.15, zT = Math.sin(a) * R * 0.15;
    const yTop = H * 1.05;
    const dx = xT - xB, dy = yTop, dz = zT - zB;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, len, 6), poleMat.clone());
    pole.position.set((xB + xT) / 2, yTop / 2, (zB + zT) / 2);
    pole.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize()));
    pole.castShadow = true;
    group.add(pole);
  }

  return group;
}

export function buildCarpaTransparente(item, view) {
  const group = new THREE.Group();
  group.userData.isCarpa = true;

  const L      = item.dims?.length    ?? 10.0;
  const W      = item.dims?.width     ?? 5.0;
  const eaveH  = item.dims?.height    ?? 3.0;
  const rise   = item.dims?.ridgeRise ?? 1.5;
  const ridgeH = eaveH + rise;
  const glassColor = item.glassColor || '#a8d8e8';
  const poleColor  = item.poleColor  || '#ffffff';

  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshBasicMaterial({ color: 0xa8d8e8, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.015;
  markMain(base, poleColor);
  group.add(base);

  if (view === 'top') {
    return group;
  }

  const poleMat = new THREE.MeshStandardMaterial({ color: colorNumber(poleColor), roughness: 0.4, metalness: 0.3, flatShading: true });
  const nMods   = Math.max(2, Math.round(L / 2.5));
  const stepX   = L / nMods;
  const xs      = Array.from({ length: nMods + 1 }, (_, i) => -L / 2 + i * stepX);

  xs.forEach(x => {
    [-W / 2, W / 2].forEach(z => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.10, eaveH, 0.10), poleMat.clone());
      post.position.set(x, eaveH / 2, z);
      post.castShadow = true;
      group.add(post);
    });
    const apex = new THREE.Vector3(x, ridgeH, 0);
    [-W / 2, W / 2].forEach(z => {
      const eave = new THREE.Vector3(x, eaveH, z);
      const dx = apex.x - eave.x, dy = apex.y - eave.y, dz = apex.z - eave.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.08, len, 0.08), poleMat.clone());
      beam.position.set((apex.x + eave.x) / 2, (apex.y + eave.y) / 2, (apex.z + eave.z) / 2);
      beam.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize()));
      beam.castShadow = true;
      group.add(beam);
    });
  });

  const ridge = new THREE.Mesh(new THREE.BoxGeometry(L, 0.08, 0.08), poleMat.clone());
  ridge.position.set(0, ridgeH, 0);
  group.add(ridge);

  const glassMat = new THREE.MeshStandardMaterial({ color: colorNumber(glassColor), roughness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.22 });
  const c = {
    SW: [-L / 2, eaveH, -W / 2], SE: [L / 2, eaveH, -W / 2],
    NE: [L / 2, eaveH,  W / 2],  NW: [-L / 2, eaveH,  W / 2],
    SR: [-L / 2, ridgeH, 0],     ER: [L / 2, ridgeH, 0]
  };
  const gv = [];
  const push = (a, b, c) => gv.push(...a, ...b, ...c);
  push(c.SW, c.SE, c.ER); push(c.SW, c.ER, c.SR);
  push(c.NE, c.NW, c.SR); push(c.NE, c.SR, c.ER);
  push(c.SE, c.NE, c.ER); push(c.NW, c.SW, c.SR);
  const gnd = { SW: [-L/2,0,-W/2], SE:[L/2,0,-W/2], NE:[L/2,0,W/2], NW:[-L/2,0,W/2] };
  push(gnd.SW, gnd.SE, c.SE); push(gnd.SW, c.SE, c.SW);
  push(gnd.NE, gnd.NW, c.NW); push(gnd.NE, c.NW, c.NE);
  push(gnd.SE, gnd.NE, c.NE); push(gnd.SE, c.NE, c.SE);
  push(gnd.NW, gnd.SW, c.SW); push(gnd.NW, c.SW, c.NW);

  const glassGeo = new THREE.BufferGeometry();
  glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(gv, 3));
  glassGeo.computeVertexNormals();
  group.add(new THREE.Mesh(glassGeo, glassMat));

  return group;
}

export function buildCarpaDomo(item, view) {
  const group = new THREE.Group();
  group.userData.isCarpa = true;

  const D             = item.dims?.diameter ?? 8.0;
  const H             = item.dims?.height   ?? 4.0;
  const R             = D / 2;
  const heightFactor  = H / R;
  const tarpColor     = item.tarpColor     || '#e8e2d0';
  const poleColor     = item.poleColor     || '#3a4d5c';
  const transparent   = item.transparent   === true;

  const base = new THREE.Mesh(
    new THREE.CircleGeometry(R, 32),
    new THREE.MeshBasicMaterial({ color: 0x3a4d5c, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.015;
  markMain(base, poleColor);
  group.add(base);

  if (view === 'top') {
    return group;
  }

  const sphereGeo = new THREE.SphereGeometry(R, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  sphereGeo.scale(1, heightFactor, 1);
  const tarpMat = new THREE.MeshStandardMaterial({
    color: colorNumber(tarpColor),
    roughness: transparent ? 0.1 : 0.75, side: THREE.DoubleSide,
    transparent: true, opacity: transparent ? 0.28 : 0.92
  });
  const dome = new THREE.Mesh(sphereGeo, tarpMat);
  dome.castShadow = true;
  group.add(dome);

  const lineMat = new THREE.LineBasicMaterial({ color: colorNumber(poleColor), transparent: true, opacity: 0.8 });
  for (let m = 0; m < 8; m++) {
    const a = (m / 8) * Math.PI * 2;
    const pts = Array.from({ length: 21 }, (_, i) => {
      const phi = (i / 20) * Math.PI / 2;
      return new THREE.Vector3(Math.sin(phi) * Math.cos(a) * R, Math.cos(phi) * R * heightFactor, Math.sin(phi) * Math.sin(a) * R);
    });
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  }
  for (let p = 1; p <= 4; p++) {
    const phi = (p / 5) * Math.PI / 2;
    const r   = Math.sin(phi) * R;
    const y   = Math.cos(phi) * R * heightFactor;
    const pts = Array.from({ length: 33 }, (_, i) => {
      const a = (i / 32) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    });
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  }

  const doorH = 2.2, doorW = 1.2;
  const doorMat = new THREE.MeshStandardMaterial({ color: colorNumber(poleColor), roughness: 0.4, metalness: 0.3, flatShading: true });
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.1, doorH, 0.05), doorMat);
  doorFrame.position.set(0, doorH / 2, R - 0.025);
  group.add(doorFrame);

  return group;
}

// Preserve legacy globals for any UIManager code still using them
if (typeof window !== 'undefined') {
  window.computePostPositions   = computePostPositions;
  window.computeColumnPositions = computeColumnPositions;
}

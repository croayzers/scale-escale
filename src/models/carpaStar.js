/* ─────────────────────────────────────────────────────────
   CARPA STAR — Estructura de carpa estrella con 6 puntas
   tipo Stretch Tent: vela curva sostenida por postes
   distribuidos en hexágono + 1 poste central alto.
   item.dims: { size, height, peakRise }
   ───────────────────────────────────────────────────────── */

export function createCarpaStar(item) {
  const g = new THREE.Group();
  g.userData.isCarpa = true;

  const R        = (item.dims?.size  ?? 8.0) / 2;     // radio circunscrito
  const eaveH    =  item.dims?.height    ?? 2.6;
  const peak     =  item.dims?.peakRise  ?? 2.2;
  const peakH    = eaveH + peak;
  const tarpColor = parseHex(item.tarpColor || '#ede7d6');
  const poleColor = parseHex(item.poleColor || '#6b4423');

  // ── 6 postes perimetrales + 1 central ──
  const postMat = new THREE.MeshStandardMaterial({
    color: poleColor, roughness: 0.6, metalness: 0.2, flatShading: true
  });

  const outerPts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    outerPts.push(new THREE.Vector3(x, eaveH, z));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, eaveH, 10), postMat.clone());
    post.position.set(x, eaveH/2, z);
    post.castShadow = true;
    post.userData.baseColor = poleColor;
    g.add(post);
  }

  // Poste central alto
  const center = new THREE.Vector3(0, peakH, 0);
  const centerPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, peakH, 10), postMat.clone());
  centerPost.position.set(0, peakH/2, 0);
  centerPost.castShadow = true;
  centerPost.userData.baseColor = poleColor;
  g.add(centerPost);

  // ── Vela: 6 triángulos curvados (subdivisión x3 para "vela") ──
  const tarpMat = new THREE.MeshStandardMaterial({
    color: tarpColor, roughness: 0.85, side: THREE.DoubleSide,
    transparent: true, opacity: 0.94, flatShading: true
  });

  for (let i = 0; i < 6; i++) {
    const A = outerPts[i];
    const B = outerPts[(i+1) % 6];
    g.add(buildSailTriangle(A, B, center, tarpMat, tarpColor));
  }

  // Base translúcida hexagonal
  const baseGeo = new THREE.CircleGeometry(R, 6);
  const base = new THREE.Mesh(baseGeo, new THREE.MeshBasicMaterial({
    color: 0x6b4423, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false
  }));
  base.rotation.x = -Math.PI/2;
  base.position.y = 0.015;
  base.userData.baseColor = 0x6b4423;
  base.userData.baseOpacity = 0.08;
  base.userData.isMain = true;
  g.add(base);

  return g;
}

/* Triángulo con caída interior (vela): subdividimos y bajamos vértices interiores */
function buildSailTriangle(A, B, C, mat, baseColor) {
  const segs = 4;
  const verts = [];
  // Generamos rejilla baricéntrica de N segmentos
  const points = [];
  for (let i = 0; i <= segs; i++) {
    for (let j = 0; j <= segs - i; j++) {
      const k = segs - i - j;
      const u = i/segs, v = j/segs, w = k/segs;
      const x = u*A.x + v*B.x + w*C.x;
      const z = u*A.z + v*B.z + w*C.z;
      // caída suave hacia el centro del triángulo
      const dipFactor = 4 * u * v * w;   // 0 en bordes, máx en centro
      const y = u*A.y + v*B.y + w*C.y - dipFactor * 0.6;
      points.push(new THREE.Vector3(x, y, z));
    }
  }
  // Index helper
  const idx = (i, j) => {
    let n = 0;
    for (let k = 0; k < i; k++) n += (segs - k + 1);
    return n + j;
  };
  // Generar triángulos
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < segs - i; j++) {
      const a = points[idx(i, j)];
      const b = points[idx(i, j+1)];
      const c = points[idx(i+1, j)];
      verts.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z);
      if (j < segs - i - 1) {
        const d = points[idx(i+1, j+1)];
        verts.push(b.x,b.y,b.z, d.x,d.y,d.z, c.x,c.y,c.z);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat.clone());
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.baseColor = baseColor;
  return mesh;
}

function parseHex(h) { return parseInt((h || '#ede7d6').replace('#',''),16); }
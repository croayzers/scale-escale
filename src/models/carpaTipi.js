/* ─────────────────────────────────────────────────────────
   CARPA TIPI — Cono con palos visibles cruzados arriba,
   apertura triangular en el frente (puerta).
   item.dims: { diameter, height }
   ───────────────────────────────────────────────────────── */

export function createCarpaTipi(item) {
  const g = new THREE.Group();
  g.userData.isCarpa = true;

  const D = item.dims?.diameter ?? 6.0;
  const H = item.dims?.height   ?? 5.5;
  const R = D / 2;
  const tarpColor = parseHex(item.tarpColor || '#e8dcc4');
  const poleColor = parseHex(item.poleColor || '#3a2d1f');

  // ── Base ──
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(R, 24),
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

  // ── Cono de tela ──
  const tarpMat = new THREE.MeshStandardMaterial({
    color: tarpColor, roughness: 0.88, side: THREE.DoubleSide,
    transparent: true, opacity: 0.95, flatShading: false
  });

  // ConeGeometry con apertura: usamos open (sin tapa)
  // Para hacer la puerta, abrimos un sector frontal pequeño.
  const segments = 32;
  const apertureSegments = 2;   // segmentos quitados para la "puerta"
  const apertureStart = segments / 2 - apertureSegments / 2;

  const verts = [];
  for (let i = 0; i < segments; i++) {
    // Saltamos los segmentos de la puerta
    if (i >= apertureStart && i < apertureStart + apertureSegments) continue;
    const a1 = (i / segments) * Math.PI * 2;
    const a2 = ((i+1) / segments) * Math.PI * 2;
    const p1 = new THREE.Vector3(Math.cos(a1) * R, 0, Math.sin(a1) * R);
    const p2 = new THREE.Vector3(Math.cos(a2) * R, 0, Math.sin(a2) * R);
    const apex = new THREE.Vector3(0, H * 0.92, 0);
    verts.push(p1.x,p1.y,p1.z, p2.x,p2.y,p2.z, apex.x,apex.y,apex.z);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const cone = new THREE.Mesh(geo, tarpMat);
  cone.castShadow = true; cone.receiveShadow = true;
  cone.userData.baseColor = tarpColor;
  g.add(cone);

  // ── Postes que sobresalen por arriba (palos de tipi cruzados) ──
  const poleMat = new THREE.MeshStandardMaterial({
    color: poleColor, roughness: 0.85, metalness: 0.05, flatShading: true
  });
  const nPoles = 8;
  for (let i = 0; i < nPoles; i++) {
    const a = (i / nPoles) * Math.PI * 2 + Math.PI / nPoles;
    const xBase = Math.cos(a) * R * 0.96;
    const zBase = Math.sin(a) * R * 0.96;
    const xTop = Math.cos(a) * R * 0.15;
    const zTop = Math.sin(a) * R * 0.15;
    const yTop = H * 1.05;        // sobresale por encima

    // Cilindro entre base y top
    const dx = xTop - xBase, dy = yTop, dz = zTop - zBase;
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, len, 6),
      poleMat.clone()
    );
    // Posicionar al medio entre base y top
    pole.position.set((xBase+xTop)/2, yTop/2, (zBase+zTop)/2);
    // Orientar: el cilindro va en +Y por defecto
    const axis = new THREE.Vector3(0, 1, 0);
    const target = new THREE.Vector3(dx, dy, dz).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(axis, target);
    pole.quaternion.copy(quat);
    pole.castShadow = true;
    pole.userData.baseColor = poleColor;
    g.add(pole);
  }

  return g;
}

function parseHex(h) { return parseInt((h || '#e8dcc4').replace('#',''),16); }
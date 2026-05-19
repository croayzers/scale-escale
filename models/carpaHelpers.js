/* ─────────────────────────────────────────────────────────
   HELPERS DE CARPA — cálculos puros (postes, columnas, techo)
   ───────────────────────────────────────────────────────── */

/* THREE está disponible como variable global. */

/** Distribuye postes a lo largo del perímetro con espaciado máximo `spacing`.
 *  Garantiza siempre las 4 esquinas. */
export function computePostPositions(L, W, spacing) {
  const positions = [];
  const sides = [
    { from: [-L/2, -W/2], to: [ L/2, -W/2] },   // sur
    { from: [ L/2, -W/2], to: [ L/2,  W/2] },   // este
    { from: [ L/2,  W/2], to: [-L/2,  W/2] },   // norte
    { from: [-L/2,  W/2], to: [-L/2, -W/2] },   // oeste
  ];
  sides.forEach(side => {
    const dx = side.to[0] - side.from[0];
    const dz = side.to[1] - side.from[1];
    const sideLen = Math.hypot(dx, dz);
    const segments = Math.max(1, Math.ceil(sideLen / spacing));
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      positions.push([
        side.from[0] + dx * t,
        side.from[1] + dz * t
      ]);
    }
  });
  return positions;
}

/** Distribuye columnas internas en una rejilla uniforme dentro del rectángulo. */
export function computeColumnPositions(L, W, rows, cols) {
  const positions = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const x = -L/2 + (L * c) / (cols + 1);
      const z = -W/2 + (W * r) / (rows + 1);
      positions.push([x, z]);
    }
  }
  return positions;
}

/** Tejado piramidal con cumbrera longitudinal sobre X. */
export function createPyramidRoof(L, W, eaveH, ridgeH, color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.85,
    flatShading: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92
  });

  const ridgeStart = -L/4;
  const ridgeEnd   =  L/4;

  const corners = {
    SW_eave: [-L/2, eaveH, -W/2],
    SE_eave: [ L/2, eaveH, -W/2],
    NE_eave: [ L/2, eaveH,  W/2],
    NW_eave: [-L/2, eaveH,  W/2],
    SW_ridge: [ridgeStart, ridgeH, 0],
    SE_ridge: [ridgeEnd,   ridgeH, 0],
  };

  const verts = [];
  const pushTri = (a, b, c) => verts.push(...a, ...b, ...c);

  // Faldón SUR
  pushTri(corners.SW_eave, corners.SE_eave, corners.SE_ridge);
  pushTri(corners.SW_eave, corners.SE_ridge, corners.SW_ridge);
  // Faldón NORTE
  pushTri(corners.NE_eave, corners.NW_eave, corners.SW_ridge);
  pushTri(corners.NE_eave, corners.SW_ridge, corners.SE_ridge);
  // Faldón ESTE (triángulo)
  pushTri(corners.SE_eave, corners.NE_eave, corners.SE_ridge);
  // Faldón OESTE (triángulo)
  pushTri(corners.NW_eave, corners.SW_eave, corners.SW_ridge);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  const roof = new THREE.Mesh(geo, mat);
  roof.castShadow = true;
  roof.userData.baseColor = color;
  roof.userData.role = 'carpa-roof-mesh';
  group.add(roof);

  // Línea de cumbrera
  const ridgeGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...corners.SW_ridge),
    new THREE.Vector3(...corners.SE_ridge),
  ]);
  const ridgeLine = new THREE.Line(ridgeGeo,
    new THREE.LineBasicMaterial({ color: 0x2a1810 }));
  group.add(ridgeLine);

  return group;
}

// Compatibilidad: el código heredado (UIManager) referenciaba window.computePostPositions.
// Lo exponemos aquí para no romper esa parte mientras quede sin migrar.
window.computePostPositions = computePostPositions;
window.computeColumnPositions = computeColumnPositions;

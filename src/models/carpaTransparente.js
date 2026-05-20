/* ─────────────────────────────────────────────────────────
   CARPA TRANSPARENTE — Estructura tipo pabellón pero con
   tela transparente (cristal) y postes blancos visibles.
   Reutiliza estructura de pabellón con materiales distintos.
   ───────────────────────────────────────────────────────── */

export function createCarpaTransparente(item) {
  const g = new THREE.Group();
  g.userData.isCarpa = true;

  const L     = item.dims?.length    ?? 10.0;
  const W     = item.dims?.width     ?? 5.0;
  const eaveH = item.dims?.height    ?? 3.0;
  const rise  = item.dims?.ridgeRise ?? 1.5;
  const ridgeH = eaveH + rise;
  const glassColor = parseHex(item.glassColor || '#a8d8e8');
  const poleColor  = parseHex(item.poleColor  || '#ffffff');

  // Base
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W),
    new THREE.MeshBasicMaterial({
      color: 0xa8d8e8, transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  base.rotation.x = -Math.PI/2;
  base.position.y = 0.015;
  base.userData.baseColor = 0xa8d8e8;
  base.userData.baseOpacity = 0.05;
  base.userData.isMain = true;
  g.add(base);

  // Postes/perfiles blancos modulares
  const poleMat = new THREE.MeshStandardMaterial({
    color: poleColor, roughness: 0.4, metalness: 0.3, flatShading: true
  });
  const nMods = Math.max(2, Math.round(L / 2.5));
  const stepX = L / nMods;
  const xs = [];
  for (let i = 0; i <= nMods; i++) xs.push(-L/2 + i * stepX);

  xs.forEach(x => {
    [-W/2, W/2].forEach(z => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.10, eaveH, 0.10), poleMat.clone());
      post.position.set(x, eaveH/2, z);
      post.castShadow = true;
      post.userData.baseColor = poleColor;
      g.add(post);
    });
    // Estructura del techo (V invertida)
    const apex = new THREE.Vector3(x, ridgeH, 0);
    [-W/2, W/2].forEach(z => {
      const eave = new THREE.Vector3(x, eaveH, z);
      const dx = apex.x - eave.x, dy = apex.y - eave.y, dz = apex.z - eave.z;
      const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.08, len, 0.08), poleMat.clone());
      beam.position.set((apex.x+eave.x)/2, (apex.y+eave.y)/2, (apex.z+eave.z)/2);
      const axis = new THREE.Vector3(0,1,0);
      const target = new THREE.Vector3(dx,dy,dz).normalize();
      beam.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(axis, target));
      beam.castShadow = true;
      beam.userData.baseColor = poleColor;
      g.add(beam);
    });
  });

  // Cumbrera
  const ridgeGeo = new THREE.BoxGeometry(L, 0.08, 0.08);
  const ridge = new THREE.Mesh(ridgeGeo, poleMat.clone());
  ridge.position.set(0, ridgeH, 0);
  ridge.castShadow = true;
  ridge.userData.baseColor = poleColor;
  g.add(ridge);

  // Tela transparente (cristal)
  const glassMat = new THREE.MeshStandardMaterial({
    color: glassColor, roughness: 0.05, metalness: 0.0,
    side: THREE.DoubleSide, transparent: true, opacity: 0.22, flatShading: false
  });

  const corners = {
    SW_eave: [-L/2, eaveH, -W/2], SE_eave: [ L/2, eaveH, -W/2],
    NE_eave: [ L/2, eaveH,  W/2], NW_eave: [-L/2, eaveH,  W/2],
    SW_ridge: [-L/2, ridgeH, 0], SE_ridge: [ L/2, ridgeH, 0]
  };
  const pushTri = (verts, a, b, c) => verts.push(...a, ...b, ...c);
  const v = [];
  // Faldón sur
  pushTri(v, corners.SW_eave, corners.SE_eave, corners.SE_ridge);
  pushTri(v, corners.SW_eave, corners.SE_ridge, corners.SW_ridge);
  // Faldón norte
  pushTri(v, corners.NE_eave, corners.NW_eave, corners.SW_ridge);
  pushTri(v, corners.NE_eave, corners.SW_ridge, corners.SE_ridge);
  // Tímpano este
  pushTri(v, corners.SE_eave, corners.NE_eave, corners.SE_ridge);
  // Tímpano oeste
  pushTri(v, corners.NW_eave, corners.SW_eave, corners.SW_ridge);
  // Paredes laterales (verticales)
  const SW_g = [-L/2, 0, -W/2], SE_g = [L/2, 0, -W/2];
  const NE_g = [L/2, 0, W/2], NW_g = [-L/2, 0, W/2];
  pushTri(v, SW_g, SE_g, corners.SE_eave);
  pushTri(v, SW_g, corners.SE_eave, corners.SW_eave);
  pushTri(v, NE_g, NW_g, corners.NW_eave);
  pushTri(v, NE_g, corners.NW_eave, corners.NE_eave);
  pushTri(v, SE_g, NE_g, corners.NE_eave);
  pushTri(v, SE_g, corners.NE_eave, corners.SE_eave);
  pushTri(v, NW_g, SW_g, corners.SW_eave);
  pushTri(v, NW_g, corners.SW_eave, corners.NW_eave);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  const glass = new THREE.Mesh(geo, glassMat);
  glass.userData.baseColor = glassColor;
  glass.userData.baseOpacity = 0.22;
  g.add(glass);

  return g;
}

function parseHex(h) { return parseInt((h || '#a8d8e8').replace('#',''),16); }
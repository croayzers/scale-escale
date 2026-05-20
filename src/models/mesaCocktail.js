/* Mesa alta cocktail con falda blanca y poste central */
export function createMesaCocktail(item) {
  const g = new THREE.Group();
  const D = item.dims?.diameter ?? 0.8;
  const H = item.dims?.height ?? 1.10;
  const color = parseHex(item.color || '#ffffff');

  // Tablero
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(D/2, D/2, 0.04, 24),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, flatShading: true })
  );
  top.position.y = H;
  top.castShadow = true; top.receiveShadow = true;
  top.userData.baseColor = color; top.userData.isMain = true;
  g.add(top);

  // Falda blanca (cono truncado: ancho arriba, ligeramente más ancho abajo)
  const skirtGeo = new THREE.CylinderGeometry(D/2 + 0.02, D/2 + 0.12, H - 0.05, 24, 1, true);
  const skirt = new THREE.Mesh(skirtGeo, new THREE.MeshStandardMaterial({
    color, roughness: 0.9, side: THREE.DoubleSide, flatShading: true
  }));
  skirt.position.y = (H - 0.05) / 2;
  skirt.castShadow = true;
  skirt.userData.baseColor = color;
  g.add(skirt);

  // Poste central interior (oculto por la falda pero da estructura)
  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, H, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b6864, roughness: 0.4, metalness: 0.6 })
  );
  leg.position.y = H/2;
  leg.userData.baseColor = 0x6b6864;
  g.add(leg);

  // Base plato
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(D * 0.3, D * 0.35, 0.04, 16),
    new THREE.MeshStandardMaterial({ color: 0x6b6864, roughness: 0.4, metalness: 0.6 })
  );
  base.position.y = 0.02;
  base.castShadow = true;
  base.userData.baseColor = 0x6b6864;
  g.add(base);

  return g;
}

function parseHex(h) { return parseInt((h || '#ffffff').replace('#',''),16); }
/* Mesa rectangular/cuadrada estándar con sillas perimetrales */
export function createMesaRect(item) {
  const g = new THREE.Group();
  const L = item.dims?.length ?? 1.8;
  const W = item.dims?.width  ?? 0.9;
  const H = 0.74;
  const color = parseHex(item.color || '#4a4744');

  const topMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, flatShading: true });
  const top = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, W), topMat);
  top.position.y = H + 0.025;
  top.castShadow = true; top.receiveShadow = true;
  top.userData.baseColor = color; top.userData.isMain = true;
  g.add(top);

  const clothMat = new THREE.MeshStandardMaterial({ color: 0xc9c5bd, roughness: 0.9, flatShading: true });
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(L + 0.03, H, W + 0.03), clothMat);
  cloth.position.y = H/2;
  cloth.castShadow = true;
  cloth.userData.baseColor = 0xc9c5bd;
  g.add(cloth);

  // Sillas perimetrales (calculadas según longitud, sep 0.60m)
  const sep = item.chairSep ?? 0.60;
  const sideChairs = Math.max(1, Math.floor(L / sep));
  const offsetZ = W/2 + 0.32;
  for (let i = 0; i < sideChairs; i++) {
    const t = (i + 0.5) / sideChairs;
    const x = -L/2 + t * L;
    g.add(makeChair(x, offsetZ, 0));
    g.add(makeChair(x, -offsetZ, Math.PI));
  }
  item.chairs = sideChairs * 2;

  return g;
}

function makeChair(x, z, rotY) {
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
  c.position.set(x, 0, z);
  c.rotation.y = rotY;
  return c;
}

function parseHex(h) { return parseInt((h || '#4a4744').replace('#',''),16); }
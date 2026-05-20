/* ─────────────────────────────────────────────────────────
   CARPA DOMO — Geodesic dome de 2 frecuencias aprox.
   item.dims: { diameter, height }
   ───────────────────────────────────────────────────────── */

export function createCarpaDomo(item) {
  const g = new THREE.Group();
  g.userData.isCarpa = true;

  const D = item.dims?.diameter ?? 8.0;
  const H = item.dims?.height   ?? 4.0;
  const R = D / 2;
  const heightFactor = H / R;     // 1 = hemisferio puro
  const tarpColor = parseHex(item.tarpColor || '#e8e2d0');
  const poleColor = parseHex(item.poleColor || '#3a4d5c');
  const transparent = item.transparent === true;

  // Base
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(R, 32),
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

  // Esfera media usando SphereGeometry truncada (phiLength = π)
  // y escalada en Y para controlar altura
  const sphereGeo = new THREE.SphereGeometry(R, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  sphereGeo.scale(1, heightFactor, 1);

  const tarpMat = new THREE.MeshStandardMaterial({
    color: tarpColor,
    roughness: transparent ? 0.1 : 0.75,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: transparent ? 0.28 : 0.92,
    flatShading: false
  });

  const dome = new THREE.Mesh(sphereGeo, tarpMat);
  dome.castShadow = true; dome.receiveShadow = true;
  dome.userData.baseColor = tarpColor;
  dome.userData.baseOpacity = transparent ? 0.28 : 0.92;
  g.add(dome);

  // Estructura geodésica: líneas sobre la esfera
  const lineMat = new THREE.LineBasicMaterial({ color: poleColor, transparent: true, opacity: 0.8 });
  // Meridianos
  const meridians = 8;
  for (let m = 0; m < meridians; m++) {
    const a = (m / meridians) * Math.PI * 2;
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const phi = (i / 20) * Math.PI / 2;
      pts.push(new THREE.Vector3(
        Math.sin(phi) * Math.cos(a) * R,
        Math.cos(phi) * R * heightFactor,
        Math.sin(phi) * Math.sin(a) * R
      ));
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  }
  // Paralelos
  const parallels = 4;
  for (let p = 1; p <= parallels; p++) {
    const phi = (p / (parallels + 1)) * Math.PI / 2;
    const r = Math.sin(phi) * R;
    const y = Math.cos(phi) * R * heightFactor;
    const pts = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  }

  // Puerta tipo arco frontal (frame)
  const doorMat = new THREE.MeshStandardMaterial({
    color: poleColor, roughness: 0.4, metalness: 0.3, flatShading: true
  });
  const doorH = 2.2, doorW = 1.2;
  const doorFrame = new THREE.Mesh(
    new THREE.BoxGeometry(doorW + 0.1, doorH, 0.05),
    doorMat
  );
  doorFrame.position.set(0, doorH / 2, R - 0.025);
  doorFrame.userData.baseColor = poleColor;
  g.add(doorFrame);

  return g;
}

function parseHex(h) { return parseInt((h || '#e8e2d0').replace('#',''),16); }
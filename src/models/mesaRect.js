/* Mesa rectangular/cuadrada estándar con sillas perimetrales */
import { createChair } from './chair.js';

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
  cloth.position.y = H / 2;
  cloth.castShadow = true;
  cloth.userData.baseColor = 0xc9c5bd;
  g.add(cloth);

  // Sillas perimetrales — usa createChair canonical (respaldo en +Z, mira hacia -Z por defecto)
  // +Z side: rotY=0  → silla mira -Z (hacia la mesa) ✓
  // -Z side: rotY=π  → silla mira +Z (hacia la mesa) ✓
  const sep = item.chairSep ?? 0.60;
  const sideChairs = Math.max(1, Math.floor(L / sep));
  const offsetZ = W / 2 + 0.1;
  for (let i = 0; i < sideChairs; i++) {
    const t = (i + 0.5) / sideChairs;
    const x = -L / 2 + t * L;
    const front = createChair();
    front.position.set(x, 0, offsetZ);
    front.rotation.y = 0;
    g.add(front);
    const back = createChair();
    back.position.set(x, 0, -offsetZ);
    back.rotation.y = Math.PI;
    g.add(back);
  }
  item.chairs = sideChairs * 2;

  return g;
}

function parseHex(h) { return parseInt((h || '#4a4744').replace('#', ''), 16); }

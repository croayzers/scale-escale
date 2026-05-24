/* ─────────────────────────────────────────────────────────
   MESA — Estándar (Ø), Napoleón (Ø) y Presidencial (rect.)
   ───────────────────────────────────────────────────────── */

import { COLORS } from './colors.js';
import { createChair } from './chair.js';

export function createMesa(item) {
  // Presidencial es rectangular: deriva a su propio builder.
  if (item.subtype === 'presi') return createMesaPresi(item);

  const group = new THREE.Group();
  const r = item.dims.diameter / 2;
  const isNapoleon = item.subtype === 'napoleon';

  // Tablero circular
  const topGeo = new THREE.CylinderGeometry(r, r, 0.05, 24, 1);
  const topMat = new THREE.MeshStandardMaterial({
    color: COLORS.woodMid,
    roughness: 0.5,
    metalness: 0.05,
    flatShading: true
  });
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.y = 0.74;
  top.castShadow = true;
  top.receiveShadow = true;
  top.userData.baseColor = COLORS.woodMid;
  top.userData.isMain = true;
  group.add(top);

  if (isNapoleon) {
    // Mantel cilíndrico cono-truncado
    const clothGeo = new THREE.CylinderGeometry(r + 0.05, r + 0.18, 0.72, 24, 1, true);
    const clothMat = new THREE.MeshStandardMaterial({
      color: 0xc9c5bd,
      roughness: 0.9,
      side: THREE.DoubleSide,
      flatShading: true
    });
    const cloth = new THREE.Mesh(clothGeo, clothMat);
    cloth.position.y = 0.38;
    cloth.castShadow = true;
    cloth.userData.baseColor = 0xc9c5bd;
    group.add(cloth);
  } else {
    // Pata central + base
    const legGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.74, 8);
    const legMat = new THREE.MeshStandardMaterial({
      color: COLORS.metal,
      roughness: 0.4,
      metalness: 0.6,
      flatShading: true
    });
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.y = 0.37;
    leg.castShadow = true;
    leg.userData.baseColor = COLORS.metal;
    group.add(leg);

    const baseGeo = new THREE.CylinderGeometry(r * 0.35, r * 0.4, 0.05, 16);
    const base = new THREE.Mesh(baseGeo, legMat.clone());
    base.position.y = 0.025;
    base.castShadow = true;
    base.userData.baseColor = COLORS.metal;
    group.add(base);
  }

  // Sillas dispuestas radialmente (respaldo afuera)
  const chairRadius = r + 0.35;
  for (let i = 0; i < item.chairs; i++) {
    const angle = (i / item.chairs) * Math.PI * 2;
    const cx = Math.cos(angle) * chairRadius;
    const cz = Math.sin(angle) * chairRadius;
    const chair = createChair();
    chair.position.set(cx, 0, cz);
    chair.rotation.y = Math.PI / 2 - angle;
    group.add(chair);
  }

  return group;
}

/** MESA PRESIDENCIAL (rectangular 1.2 × 2m).
 *  4 sillas por lado largo + 1 opcional en cada extremo corto (endHead / endFoot). */
export function createMesaPresi(item) {
  const group = new THREE.Group();
  const L = item.dims.length || 2.0;
  const W = item.dims.width  || 1.2;
  const H = 0.74;

  // Tablero
  const topGeo = new THREE.BoxGeometry(L, 0.05, W);
  const topMat = new THREE.MeshStandardMaterial({
    color: COLORS.woodMid,
    roughness: 0.5,
    metalness: 0.05,
    flatShading: true
  });
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.y = H + 0.025;
  top.castShadow = true;
  top.receiveShadow = true;
  top.userData.baseColor = COLORS.woodMid;
  top.userData.isMain = true;
  group.add(top);

  // Mantel/faldón
  const clothGeo = new THREE.BoxGeometry(L + 0.04, H, W + 0.04);
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0xc9c5bd,
    roughness: 0.9,
    flatShading: true
  });
  const cloth = new THREE.Mesh(clothGeo, clothMat);
  cloth.position.y = H / 2;
  cloth.castShadow = true;
  cloth.userData.baseColor = 0xc9c5bd;
  group.add(cloth);

  // Sillas en lados largos (4 por lado = 8)
  const sideChairs = 4;
  const sideOffsetZ = W / 2 + 0.32;
  for (let i = 0; i < sideChairs; i++) {
    const t = (i + 0.5) / sideChairs;
    const x = -L / 2 + t * L;

    const chairFront = createChair();
    chairFront.position.set(x, 0, sideOffsetZ);
    chairFront.rotation.y = 0;
    group.add(chairFront);

    const chairBack = createChair();
    chairBack.position.set(x, 0, -sideOffsetZ);
    chairBack.rotation.y = Math.PI;
    group.add(chairBack);
  }

  // Sillas de los extremos (opcionales)
  const endOffsetX = L / 2 + 0.32;
  if (item.endHead !== false) {
    const chairHead = createChair();
    chairHead.position.set(endOffsetX, 0, 0);
    chairHead.rotation.y = Math.PI / 2;
    group.add(chairHead);
  }
  if (item.endFoot !== false) {
    const chairFoot = createChair();
    chairFoot.position.set(-endOffsetX, 0, 0);
    chairFoot.rotation.y = -Math.PI / 2;
    group.add(chairFoot);
  }

  return group;
}

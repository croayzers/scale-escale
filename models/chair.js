/* ─────────────────────────────────────────────────────────
   CHAIR — Silla low-poly reutilizable (usada por mesas)
   ───────────────────────────────────────────────────────── */

import { COLORS } from './colors.js';

export function createChair() {
  const chair = new THREE.Group();
  const seatMat = new THREE.MeshStandardMaterial({
    color: COLORS.chairMid,
    roughness: 0.55,
    flatShading: true
  });

  // Asiento
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), seatMat);
  seat.position.y = 0.45;
  seat.castShadow = true;
  seat.userData.baseColor = COLORS.chairMid;
  chair.add(seat);

  // Respaldo
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.04), seatMat.clone());
  back.position.set(0, 0.7, 0.19);
  back.castShadow = true;
  back.userData.baseColor = COLORS.chairMid;
  chair.add(back);

  // Patas low-poly
  const legMat = new THREE.MeshStandardMaterial({
    color: COLORS.chairDark,
    roughness: 0.6,
    flatShading: true
  });
  const legGeo = new THREE.BoxGeometry(0.04, 0.45, 0.04);
  [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([x, z]) => {
    const l = new THREE.Mesh(legGeo, legMat.clone());
    l.position.set(x, 0.22, z);
    l.castShadow = true;
    l.userData.baseColor = COLORS.chairDark;
    chair.add(l);
  });

  return chair;
}

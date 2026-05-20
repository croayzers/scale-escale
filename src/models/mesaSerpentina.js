/* ─────────────────────────────────────────────────────────
   MESA SERPENTINA — S compuesta de 2 arcos opuestos
   item.dims: { radioInt, anchoTab, anguloDeg, alto }
   item.distrib, item.chairSep, item.color
   ───────────────────────────────────────────────────────── */

import { createMesaCurva } from './mesaCurva.js';

export function createMesaSerpentina(item) {
  const g = new THREE.Group();
  const ang = (item.dims?.anguloDeg ?? 60) * Math.PI / 180;
  const r   = (item.dims?.radioInt ?? 2.0) + (item.dims?.anchoTab ?? 0.7) / 2;

  // Primer arco
  const arc1 = createMesaCurva(item);
  arc1.position.set(0, 0, 0);
  g.add(arc1);

  // Segundo arco, espejado y desplazado para formar la S
  const cfg2 = { ...item, distrib: invertDist(item.distrib) };
  const arc2 = createMesaCurva(cfg2);
  // Desplazamos para que el extremo final del 1º coincida con el inicial del 2º
  const xOff = 2 * r * Math.sin(ang / 2);
  arc2.position.set(xOff * 2, 0, 0);
  arc2.rotation.y = Math.PI;   // rotamos 180° para que curve al lado contrario
  g.add(arc2);

  // El conteo de sillas viene del primer createMesaCurva (asignado a item.chairs);
  // duplicamos porque hay dos arcos:
  item.chairs = (item.chairs || 0) * 2;

  return g;
}

function invertDist(d) {
  if (d === 'interna') return 'externa';
  if (d === 'externa') return 'interna';
  return d || 'externa';
}
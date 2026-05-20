/* ─────────────────────────────────────────────────────────
   CARPA CUADRADA — Estructura con techo a 4 aguas pira-
   midal simétrico (similar a "pagoda" / "marquee" clásica).
   item.dims: { size, height, ridgeRise }
   ───────────────────────────────────────────────────────── */

import { COLORS } from './colors.js';

export function createCarpaCuadrada(item) {
  const g = new THREE.Group();
  g.userData.isCarpa = true;

  const S    = item.dims?.size       ?? 6.0;
  const eaveH = item.dims?.height    ?? 3.0;
  const ridge = item.dims?.ridgeRise ?? 1.6;
  const ridgeH = eaveH + ridge;

  const tarpColor = parseHex(item.tarpColor || '#f5f1e8');
  const poleColor = parseHex(item.poleColor || '#6b4423');

  // ── Base translúcida ──
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(S, S),
    new THREE.MeshBasicMaterial({
      color: 0x6b4423, transparent: true, opacity: 0.08,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  base.rotation.x = -Math.PI/2;
  base.position.y = 0.015;
  base.userData.baseColor = 0x6b4423;
  base.userData.baseOpacity = 0.08;
  base.userData.isMain = true;
  g.add(base);

  // ── 4 postes en las esquinas ──
  const postR = 0.07;
  const postMat = new THREE.MeshStandardMaterial({
    color: poleColor, roughness: 0.6, metalness: 0.2, flatShading: true
  });
  const corners = [[-S/2,-S/2],[S/2,-S/2],[S/2,S/2],[-S/2,S/2]];
  corners.forEach(([x,z]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, eaveH, 10), postMat.clone());
    post.position.set(x, eaveH/2, z);
    post.castShadow = true;
    post.userData.baseColor = poleColor;
    g.add(post);
  });

  // ── Cubierta piramidal (4 triángulos al ápice) ──
  const tarpMat = new THREE.MeshStandardMaterial({
    color: tarpColor, roughness: 0.85, side: THREE.DoubleSide,
    transparent: true, opacity: 0.94, flatShading: true
  });
  const apex = new THREE.Vector3(0, ridgeH, 0);
  const cN = new THREE.Vector3(-S/2, eaveH,  S/2);
  const cE = new THREE.Vector3( S/2, eaveH,  S/2);
  const cS = new THREE.Vector3( S/2, eaveH, -S/2);
  const cW = new THREE.Vector3(-S/2, eaveH, -S/2);
  const faces = [[cN,cE],[cE,cS],[cS,cW],[cW,cN]];

  faces.forEach(([a,b]) => {
    const verts = new Float32Array([a.x,a.y,a.z, b.x,b.y,b.z, apex.x,apex.y,apex.z]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, tarpMat.clone());
    m.castShadow = true; m.receiveShadow = true;
    m.userData.baseColor = tarpColor;
    g.add(m);
  });

  // ── Borde inferior ──
  const eaveGeo = new THREE.BufferGeometry().setFromPoints([
    cW, cN, cE, cS, cW
  ]);
  g.add(new THREE.Line(eaveGeo, new THREE.LineBasicMaterial({ color: 0x2a1810 })));

  // ── Bolita de remate en la cima ──
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.6 })
  );
  cap.position.copy(apex);
  cap.userData.baseColor = 0x2a1810;
  g.add(cap);

  return g;
}

function parseHex(h) { return parseInt((h || '#f5f1e8').replace('#',''),16); }
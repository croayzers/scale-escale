/* ─────────────────────────────────────────────────────────
   BUFFET — Mesa rectangular con toldo street-food
   ───────────────────────────────────────────────────────── */

import { COLORS } from './colors.js';

export function createBuffet(item) {
  const group = new THREE.Group();
  const L = item.dims.length;
  const W = 0.8;
  const H = 0.85;

  // Tablón
  const topGeo = new THREE.BoxGeometry(L, 0.06, W);
  const topMat = new THREE.MeshStandardMaterial({
    color: COLORS.woodMid,
    roughness: 0.55,
    flatShading: true
  });
  const top = new THREE.Mesh(topGeo, topMat);
  top.position.y = H;
  top.castShadow = true;
  top.receiveShadow = true;
  top.userData.baseColor = COLORS.woodMid;
  top.userData.isMain = true;
  group.add(top);

  // Faldón / mantel
  const skirtGeo = new THREE.BoxGeometry(L + 0.03, H, W + 0.03);
  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0xc9c5bd,
    roughness: 0.9,
    transparent: true,
    opacity: 0.95,
    flatShading: true
  });
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.y = H / 2;
  skirt.castShadow = true;
  skirt.userData.baseColor = 0xc9c5bd;
  group.add(skirt);

  // 4 Patas finas
  const legMat = new THREE.MeshStandardMaterial({
    color: COLORS.metal,
    roughness: 0.4,
    metalness: 0.7,
    flatShading: true
  });
  const legGeo = new THREE.CylinderGeometry(0.025, 0.025, H, 6);
  const off = 0.08;
  [[-L/2+off,  W/2-off], [ L/2-off,  W/2-off],
   [-L/2+off, -W/2+off], [ L/2-off, -W/2+off]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeo, legMat.clone());
    leg.position.set(x, H/2, z);
    leg.castShadow = true;
    leg.userData.baseColor = COLORS.metal;
    group.add(leg);
  });

  // Toldo street-food
  const toldoGeo = new THREE.BoxGeometry(L + 0.4, 0.04, W + 0.6);
  const toldoTex = createStripePattern();
  const toldoMat = new THREE.MeshStandardMaterial({
    color: 0x1e1d1c,
    roughness: 0.8,
    map: toldoTex,
    flatShading: true
  });
  const toldo = new THREE.Mesh(toldoGeo, toldoMat);
  toldo.position.set(0, 2.0, 0);
  toldo.rotation.x = -0.18;
  toldo.castShadow = true;
  toldo.userData.baseColor = 0x1e1d1c;
  group.add(toldo);

  // Mástiles del toldo
  const postGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.0, 6);
  const postMat = new THREE.MeshStandardMaterial({
    color: COLORS.metal,
    roughness: 0.4,
    metalness: 0.7,
    flatShading: true
  });
  [[-L/2+0.05,  W/2-0.05], [ L/2-0.05,  W/2-0.05],
   [-L/2+0.05, -W/2+0.05], [ L/2-0.05, -W/2+0.05]].forEach(([x, z]) => {
    const p = new THREE.Mesh(postGeo, postMat.clone());
    p.position.set(x, 1.0, z);
    p.castShadow = true;
    p.userData.baseColor = COLORS.metal;
    group.add(p);
  });

  // Etiqueta de categoría
  if (item.subtype) {
    const labelSprite = createCategoryLabel(item.subtype);
    if (labelSprite) {
      labelSprite.position.set(0, 2.35, 0);
      group.add(labelSprite);
    }
  }

  return group;
}

function createCategoryLabel(category) {
  const labelMap = {
    arroces: 'ARROCES',
    feria: 'FERIA',
    quesos: 'QUESOS',
    italiano: 'ITALIANO',
    huevos: 'HUEVOS',
    jamon: 'JAMÓN'
  };
  const text = labelMap[category] || category.toUpperCase();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 512; canvas.height = 96;
  ctx.fillStyle = 'rgba(10,10,11,0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '500 42px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f5f3ee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width/2, canvas.height/2);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(1.6, 0.3, 1);
  return s;
}

function createStripePattern() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e1d1c';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#3a3835';
  for (let i = 0; i < 128; i += 16) ctx.fillRect(i, 0, 8, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

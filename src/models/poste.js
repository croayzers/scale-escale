/* ─────────────────────────────────────────────────────────
   POSTE — Vertical aislado para usar dentro de carpas o solo
   item.dims: { diameter, height }
   item.color: hex
   ───────────────────────────────────────────────────────── */

export function createPoste(item) {
  const g = new THREE.Group();
  const D = item.dims?.diameter ?? 0.12;
  const H = item.dims?.height   ?? 3.0;
  const color = parseHex(item.color || '#6b4423');

  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.6, metalness: 0.2, flatShading: true
  });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(D/2, D/2, H, 12), mat);
  post.position.y = H/2;
  post.castShadow = true; post.receiveShadow = true;
  post.userData.baseColor = color;
  post.userData.isMain = true;
  g.add(post);

  // Base/zapata
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(D * 1.6, D * 1.8, 0.04, 16),
    mat.clone()
  );
  base.position.y = 0.02;
  base.castShadow = true;
  base.userData.baseColor = color;
  g.add(base);

  return g;
}

function parseHex(h) { return parseInt((h || '#6b4423').replace('#',''),16); }
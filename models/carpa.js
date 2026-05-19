/* ─────────────────────────────────────────────────────────
   CARPA — Estructura con techo a 4 aguas y postes
   Render adaptativo: 3D en isométrica, círculos en cenital
   ───────────────────────────────────────────────────────── */

import { COLORS } from './colors.js';
import { AppState } from '../core/AppState.js';
import {
  computePostPositions,
  computeColumnPositions,
  createPyramidRoof
} from './carpaHelpers.js';

export function createCarpa(item) {
  const group = new THREE.Group();
  group.userData.isCarpa = true;

  const L = item.dims.length;
  const W = item.dims.width;
  const isTop = AppState.camera === 'top';

  // Configuración de postes
  const postsEnabled = item.posts?.enabled !== false;
  const postD = item.posts?.diameter ?? 0.10;
  const postSpacing = item.posts?.spacing ?? 2.0;
  const eaveH = item.posts?.height ?? 3.0;
  const ridgeH = eaveH + 0.8;

  // Configuración de columnas internas
  const colsEnabled = item.columns?.enabled === true;
  const colRows = Math.max(1, item.columns?.rows ?? 1);
  const colCols = Math.max(1, item.columns?.cols ?? 2);
  const colDiameter = item.columns?.diameter ?? 0.15;

  // ─── Base marrón (siempre visible) ───
  const baseGeo = new THREE.PlaneGeometry(L, W);
  const baseMat = new THREE.MeshBasicMaterial({
    color: COLORS.carpaBrown,
    transparent: true,
    opacity: 0.10,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const baseFill = new THREE.Mesh(baseGeo, baseMat);
  baseFill.rotation.x = -Math.PI / 2;
  baseFill.position.y = 0.015;
  baseFill.userData.baseColor = COLORS.carpaBrown;
  baseFill.userData.baseOpacity = 0.10;
  baseFill.userData.role = 'carpa-base';
  group.add(baseFill);

  // ─── Bordes del rectángulo ───
  const edgeGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-L/2, 0.02, -W/2),
    new THREE.Vector3( L/2, 0.02, -W/2),
    new THREE.Vector3( L/2, 0.02,  W/2),
    new THREE.Vector3(-L/2, 0.02,  W/2),
    new THREE.Vector3(-L/2, 0.02, -W/2),
  ]);
  const edgeMat = new THREE.LineBasicMaterial({
    color: COLORS.carpaBrown,
    linewidth: 2
  });
  const edges = new THREE.Line(edgeGeo, edgeMat);
  edges.userData.role = 'carpa-edges';
  group.add(edges);

  const postPositions = computePostPositions(L, W, postSpacing);
  const columnPositions = colsEnabled
    ? computeColumnPositions(L, W, colRows, colCols)
    : [];

  // ─── Estructura 3D (sólo en isométrica) ───
  if (!isTop) {
    if (postsEnabled) {
      const postMat = new THREE.MeshStandardMaterial({
        color: COLORS.carpaBrown,
        roughness: 0.7,
        metalness: 0.1,
        flatShading: true
      });
      postPositions.forEach(([px, pz]) => {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(postD/2, postD/2, eaveH, 8),
          postMat.clone()
        );
        post.position.set(px, eaveH / 2, pz);
        post.castShadow = true;
        post.userData.baseColor = COLORS.carpaBrown;
        post.userData.role = 'carpa-post-3d';
        group.add(post);
      });
    }

    if (colsEnabled) {
      const colMat = new THREE.MeshStandardMaterial({
        color: COLORS.carpaBrownLight,
        roughness: 0.6,
        metalness: 0.2,
        flatShading: true
      });
      columnPositions.forEach(([cx, cz]) => {
        const distFromCenterZ = Math.abs(cz) / (W / 2);
        const colHeight = ridgeH - (ridgeH - eaveH) * distFromCenterZ;

        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(colDiameter/2, colDiameter/2, colHeight, 10),
          colMat.clone()
        );
        col.position.set(cx, colHeight / 2, cz);
        col.castShadow = true;
        col.userData.baseColor = COLORS.carpaBrownLight;
        col.userData.role = 'carpa-column-3d';
        group.add(col);
      });
    }

    const roofGroup = createPyramidRoof(L, W, eaveH, ridgeH, COLORS.carpaTarp);
    roofGroup.userData.role = 'carpa-roof';
    group.add(roofGroup);
  }

  // ─── Círculos 2D (sólo en cenital) ───
  if (isTop) {
    if (postsEnabled) {
      const circleMat = new THREE.MeshBasicMaterial({
        color: COLORS.carpaBrown,
        side: THREE.DoubleSide
      });
      const circleGeo = new THREE.CircleGeometry(Math.max(postD * 1.5, 0.08), 16);
      postPositions.forEach(([px, pz]) => {
        const c = new THREE.Mesh(circleGeo, circleMat.clone());
        c.rotation.x = -Math.PI / 2;
        c.position.set(px, 0.025, pz);
        c.userData.baseColor = COLORS.carpaBrown;
        c.userData.role = 'carpa-post-2d';
        group.add(c);
      });
    }

    if (colsEnabled) {
      const colMat = new THREE.MeshBasicMaterial({
        color: COLORS.carpaBrownLight,
        side: THREE.DoubleSide
      });
      const colGeo = new THREE.CircleGeometry(Math.max(colDiameter * 1.5, 0.12), 18);
      const ringGeo = new THREE.RingGeometry(
        Math.max(colDiameter * 1.5, 0.12),
        Math.max(colDiameter * 1.9, 0.16),
        24
      );
      const ringMat = new THREE.MeshBasicMaterial({
        color: COLORS.carpaBrown,
        side: THREE.DoubleSide
      });
      columnPositions.forEach(([cx, cz]) => {
        const c = new THREE.Mesh(colGeo, colMat.clone());
        c.rotation.x = -Math.PI / 2;
        c.position.set(cx, 0.027, cz);
        c.userData.baseColor = COLORS.carpaBrownLight;
        c.userData.role = 'carpa-column-2d';
        group.add(c);
        const r = new THREE.Mesh(ringGeo, ringMat.clone());
        r.rotation.x = -Math.PI / 2;
        r.position.set(cx, 0.028, cz);
        r.userData.baseColor = COLORS.carpaBrown;
        r.userData.role = 'carpa-column-2d-ring';
        group.add(r);
      });
    }
  }

  return group;
}

/* ─────────────────────────────────────────────────────────
   SCENE MANAGER — Three.js: escena, cámaras, render, cotas
   ───────────────────────────────────────────────────────── */

import { ModelFactory } from '../models/index.js';
// Imports diferidos para romper ciclos:
// AppState y UIManager se cargan en runtime, no en estático.

let _appState, _uiManager;
async function bindDeps() {
  if (!_appState)  ({ AppState:  _appState  } = await import('../core/AppState.js'));
  if (!_uiManager) ({ UIManager: _uiManager } = await import('../ui/UIManager.js'));
}

let scene, renderer, perspectiveCam, orthoCam, controlsIso, controlsTop;
let activeCam, activeControls;
let groundPlane, planMesh, gridHelper, gridMain, axes;
const meshes = new Map();
let dragPlane;
let directionalLight, ambientLight, fillLight;
let cotasGroup;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function init() {
  const canvas = document.getElementById('scene-canvas');

  /* ===== Renderer ===== */
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;

  /* ===== Escena ===== */
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf5f3ee, 60, 140);

  /* ===== Cámaras ===== */
  const aspect = window.innerWidth / window.innerHeight;

  perspectiveCam = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
  perspectiveCam.position.set(28, 28, 28);
  perspectiveCam.lookAt(0, 0, 0);

  const orthoSize = 25;
  orthoCam = new THREE.OrthographicCamera(
    -orthoSize * aspect, orthoSize * aspect,
    orthoSize, -orthoSize,
    0.1, 500
  );
  orthoCam.position.set(0, 60, 0);
  orthoCam.lookAt(0, 0, 0);
  orthoCam.zoom = 1;
  orthoCam.updateProjectionMatrix();

  activeCam = perspectiveCam;

  /* ===== Controles ===== */
  controlsIso = new THREE.OrbitControls(perspectiveCam, canvas);
  controlsIso.enableDamping = true;
  controlsIso.dampingFactor = 0.08;
  controlsIso.minPolarAngle = Math.PI / 8;
  controlsIso.maxPolarAngle = Math.PI / 2.2;
  controlsIso.minDistance = 8;
  controlsIso.maxDistance = 80;
  controlsIso.target.set(0, 0, 0);

  controlsTop = new THREE.OrbitControls(orthoCam, canvas);
  controlsTop.enableRotate = false;
  controlsTop.enableDamping = true;
  controlsTop.dampingFactor = 0.1;
  controlsTop.screenSpacePanning = true;
  controlsTop.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN
  };
  controlsTop.minZoom = 0.3;
  controlsTop.maxZoom = 6;
  controlsTop.enabled = false;

  activeControls = controlsIso;

  /* ===== Iluminación ===== */
  ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambientLight);

  directionalLight = new THREE.DirectionalLight(0xffffff, 0.85);
  directionalLight.position.set(15, 25, 10);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  directionalLight.shadow.camera.left = -40;
  directionalLight.shadow.camera.right = 40;
  directionalLight.shadow.camera.top = 40;
  directionalLight.shadow.camera.bottom = -40;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 100;
  directionalLight.shadow.bias = -0.0003;
  scene.add(directionalLight);

  fillLight = new THREE.DirectionalLight(0xeae5da, 0.25);
  fillLight.position.set(-15, 10, -10);
  scene.add(fillLight);

  /* ===== Suelo ===== */
  groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({
      color: 0xe9e4da,
      roughness: 0.95,
      metalness: 0.0,
    })
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.receiveShadow = true;
  groundPlane.position.y = -0.01;
  scene.add(groundPlane);

  rebuildGrids();

  /* ===== Ejes ===== */
  const axesGroup = new THREE.Group();
  const xMat = new THREE.LineBasicMaterial({ color: 0x1a1a1c, transparent: true, opacity: 0.6 });
  const xLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-50, 0.01, 0), new THREE.Vector3(50, 0.01, 0)]),
    xMat
  );
  axesGroup.add(xLine);
  axesGroup.visible = false;
  scene.add(axesGroup);
  axes = axesGroup;

  /* ===== Plano matemático para drag ===== */
  dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /* ===== Grupo de cotas ===== */
  cotasGroup = new THREE.Group();
  scene.add(cotasGroup);

  window.addEventListener('resize', onResize);
  animate();
}

function rebuildGrids() {
  if (gridHelper) { scene.remove(gridHelper); gridHelper.geometry.dispose(); gridHelper.material.dispose(); }
  if (gridMain)   { scene.remove(gridMain);   gridMain.geometry.dispose();   gridMain.material.dispose();   }

  const SIZE = 60;
  const spacing = _appState?.snap?.spacing ?? 0.25;
  const fineDivisions = Math.min(1200, Math.round(SIZE / spacing));
  const mainDivisions = SIZE;

  gridHelper = new THREE.GridHelper(SIZE, fineDivisions, 0x1a1a1c, 0x1a1a1c);
  gridHelper.material.opacity = 0.10;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  gridMain = new THREE.GridHelper(SIZE, mainDivisions, 0x1a1a1c, 0x1a1a1c);
  gridMain.material.opacity = 0.25;
  gridMain.material.transparent = true;
  gridMain.position.y = 0.001;
  scene.add(gridMain);
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight, a = w / h;
  renderer.setSize(w, h);
  perspectiveCam.aspect = a;
  perspectiveCam.updateProjectionMatrix();

  const orthoSize = 25;
  orthoCam.left = -orthoSize * a;
  orthoCam.right = orthoSize * a;
  orthoCam.top = orthoSize;
  orthoCam.bottom = -orthoSize;
  orthoCam.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  activeControls.update();
  _uiManager?.updateTooltipPosition?.();
  renderer.render(scene, activeCam);
}

function setCamera(mode) {
  if (_appState) _appState.camera = mode;
  if (mode === 'iso') {
    activeCam = perspectiveCam;
    controlsIso.enabled = true;
    controlsTop.enabled = false;
    activeControls = controlsIso;
    document.getElementById('status-mode').textContent = 'ISO · 45°';
  } else {
    activeCam = orthoCam;
    controlsTop.enabled = true;
    controlsIso.enabled = false;
    activeControls = controlsTop;
    document.getElementById('status-mode').textContent = 'TOP · CENITAL';
  }
  // Las carpas tienen representación distinta según vista → reconstruir
  if (_appState) {
    _appState.items.filter(i => i.type === 'carpa').forEach(c => rebuild(c));
  }
  applyShadowState();
}

function spawn(item) {
  const group = ModelFactory.create(item);
  group.userData = { id: item.id };
  group.position.set(item.x, 0, item.z);
  if (item.rotY) group.rotation.y = item.rotY;
  meshes.set(item.id, group);
  scene.add(group);
  if (_appState?.showCotas) drawCotas();
}

function rebuild(item) {
  removeItem(item.id);
  spawn(item);
}

function removeItem(id) {
  const g = meshes.get(id);
  if (!g) return;
  scene.remove(g);
  disposeGroup(g);
  meshes.delete(id);
  if (_appState?.showCotas) drawCotas();
}

function disposeGroup(group) {
  group.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material.dispose();
    }
  });
}

function moveItem(id, x, z) {
  const g = meshes.get(id);
  if (!g) return;
  g.position.x = x;
  g.position.z = z;
  const item = _appState?.items.find(i => i.id === id);
  if (item) { item.x = x; item.z = z; }
  moveCotaFor(id, x, z);
}

function rotateItem(id, rotY) {
  const g = meshes.get(id);
  if (!g) return;
  g.rotation.y = rotY;
  const item = _appState?.items.find(i => i.id === id);
  if (item) item.rotY = rotY;
}

function highlightSelection() {
  if (!_appState) return;
  const sel = _appState.items.find(i => i.id === _appState.selectedId);
  const selectedSet = _appState.selectedIds || new Set();
  meshes.forEach((g, id) => {
    const it = _appState.items.find(x => x.id === id);
    g.traverse(child => {
      if (child.isMesh && child.userData.baseColor !== undefined) {
        const isSelected = selectedSet.has(id);
        const isSimilar = sel && sel.type === 'mesa' && it && it.type === 'mesa'
                          && it.dims.diameter === sel.dims.diameter && !selectedSet.has(id);
        const isCarpa = it && it.type === 'carpa';

        if (isCarpa) {
          if (isSelected) {
            if (child.material.opacity !== undefined) child.material.opacity = Math.min(1, (child.userData.baseOpacity || 1) * 1.5);
            child.material.color.setHex(0x8b5a2b);
          } else {
            if (child.material.opacity !== undefined && child.userData.baseOpacity) child.material.opacity = child.userData.baseOpacity;
            child.material.color.setHex(child.userData.baseColor);
          }
          return;
        }

        if (isSelected) {
          child.material.emissive = new THREE.Color(0xffffff);
          child.material.emissiveIntensity = 0.18;
          child.material.color.setHex(0x2a2a2c);
        } else if (isSimilar) {
          child.material.emissive = new THREE.Color(0xd4ff3a);
          child.material.emissiveIntensity = 0.10;
          child.material.color.setHex(child.userData.baseColor);
        } else {
          child.material.emissive = new THREE.Color(0x000000);
          child.material.emissiveIntensity = 0;
          child.material.color.setHex(child.userData.baseColor);
        }
      }
    });
  });
}

function drawCotas() {
  while (cotasGroup.children.length) {
    const c = cotasGroup.children.pop();
    if (c.material && c.material.map) c.material.map.dispose();
    if (c.material) c.material.dispose();
    if (c.geometry) c.geometry.dispose();
  }
  if (!_appState?.showCotas) return;

  const COTAS_ALWAYS = ['mesa', 'buffet', 'carpa', 'mesaRect', 'mesaImperial',
    'mesaCocktail', 'mesaCurva', 'mesaSerpentina', 'barraLibre',
    'sillaCatering', 'sillaLineal', 'carpaCuadrada', 'carpaStar',
    'carpaPabellon', 'carpaTransparente', 'carpaBeduina',
    'carpaSailcloth', 'carpaTipi', 'carpaDomo'];

  _appState.items.forEach(item => {
    if (!COTAS_ALWAYS.includes(item.type) && !item.showLabel) return;

    let label, kind, yOffset;

    switch (item.type) {
      case 'carpa':
      case 'carpaPabellon':
      case 'carpaTransparente':
      case 'carpaBeduina':
      case 'carpaSailcloth': {
        const L = item.dims.length ?? item.dims.size ?? 0;
        const W = item.dims.width  ?? item.dims.size ?? 0;
        label = `${L.toFixed(1)}×${W.toFixed(1)}m · ${(L*W).toFixed(0)}m²`;
        kind = 'carpa'; yOffset = _appState.camera === 'top' ? 0.5 : 4.5;
        break;
      }
      case 'carpaCuadrada': {
        const S = item.dims.size ?? 6;
        label = `${S.toFixed(1)}×${S.toFixed(1)}m · ${(S*S).toFixed(0)}m²`;
        kind = 'carpa'; yOffset = _appState.camera === 'top' ? 0.5 : 4.8;
        break;
      }
      case 'carpaStar': {
        const S = item.dims.size ?? 8;
        label = `Ø ${S.toFixed(1)}m · star`;
        kind = 'carpa'; yOffset = _appState.camera === 'top' ? 0.5 : 5.2;
        break;
      }
      case 'carpaTipi': {
        const D = item.dims.diameter ?? 6;
        label = `Ø ${D.toFixed(1)}m · tipi`;
        kind = 'carpa'; yOffset = _appState.camera === 'top' ? 0.5 : (item.dims.height + 0.6);
        break;
      }
      case 'carpaDomo': {
        const D = item.dims.diameter ?? 8;
        label = `Ø ${D.toFixed(1)}m · domo`;
        kind = 'carpa'; yOffset = _appState.camera === 'top' ? 0.5 : (item.dims.height + 0.6);
        break;
      }
      case 'mesa':
        label = item.subtype === 'presi'
          ? `${item.dims.length.toFixed(1)}×${item.dims.width.toFixed(1)}m · ${item.chairs}p`
          : `Ø ${item.dims.diameter.toFixed(2)}m · ${item.chairs}p`;
        kind = 'mesa'; yOffset = 1.55;
        break;
      case 'arbusto':
        label = `${item.dims.width.toFixed(1)}×${item.dims.height.toFixed(1)}m`;
        kind = 'green'; yOffset = item.dims.height + 0.4;
        break;
      case 'arbol':
        label = `H ${item.dims.height.toFixed(1)}m · Ø ${item.dims.crownWidth.toFixed(1)}m`;
        kind = 'green'; yOffset = item.dims.height + 0.4;
        break;
      case 'cableLuces': {
        const total = (item.count * item.spacing).toFixed(2);
        label = `${item.count} luces · ${total}m`;
        kind = 'lights'; yOffset = item.height + 0.4;
        break;
      }
      case 'room':
        label = `${item.dims.length.toFixed(1)}×${item.dims.width.toFixed(1)}×${item.dims.height.toFixed(1)}m`;
        kind = 'room'; yOffset = item.dims.height + 0.4;
        break;
      case 'sillaCatering':
        label = `Silla · ${item.subtype}`;
        kind = 'mesa'; yOffset = (item.dims?.totalHeight ?? 0.9) + 0.3;
        break;
      case 'sillaLineal': {
        const n = item.count ?? 6;
        const span = (n - 1) * (item.gap ?? 0.55);
        label = `${n} sillas · ${span.toFixed(2)}m`;
        kind = 'mesa'; yOffset = (item.dims?.totalHeight ?? 0.9) + 0.3;
        break;
      }
      case 'mesaRect':
      case 'mesaImperial':
        label = `${item.dims.length.toFixed(1)}×${item.dims.width.toFixed(1)}m · ${item.chairs}p`;
        kind = 'mesa'; yOffset = 1.55;
        break;
      case 'mesaCocktail':
        label = `Ø ${item.dims.diameter.toFixed(2)}m · alta`;
        kind = 'mesa'; yOffset = (item.dims.height || 1.1) + 0.3;
        break;
      case 'mesaCurva':
      case 'mesaSerpentina':
        label = `R ${item.dims.radioInt}m · ${item.dims.anguloDeg}° · ${item.chairs}p`;
        kind = 'mesa'; yOffset = 1.55;
        break;
      case 'poste':
        label = `Ø ${(item.dims.diameter*100).toFixed(0)}cm · H ${item.dims.height.toFixed(1)}m`;
        kind = 'carpa'; yOffset = item.dims.height + 0.4;
        break;
      case 'barraLibre': {
        const n = item.cubiteras ?? 1;
        label = `${item.dims.length.toFixed(1)}m · ${n} cubiter${n>1?'as':'a'}`;
        kind = 'buffet'; yOffset = (item.dims.height ?? 0.9) + 0.5;
        break;
      }
      case 'ambiente': {
        const subLabel = item.subtype === 'alfombra' ? `${item.dims.length}×${item.dims.width}m`
                       : item.subtype === 'planta'   ? `H ${item.dims.height}m`
                       : `Spot · H ${item.dims.height}m`;
        label = subLabel;
        kind = 'lights';
        yOffset = item.subtype === 'alfombra' ? 0.4 : (item.dims.height ?? 1) + 0.4;
        break;
      }
      default:
        label = `${item.dims.length.toFixed(2)}m · ${(item.subtype || '').toUpperCase()}`;
        kind = 'buffet'; yOffset = 2.55;
    }

    const sprite = makeTextSprite(label, kind);
    sprite.position.set(item.x, yOffset, item.z);
    sprite.userData.itemId = item.id;
    cotasGroup.add(sprite);
  });
}

function moveCotaFor(itemId, x, z) {
  if (!_appState?.showCotas) return;
  cotasGroup.children.forEach(sprite => {
    if (sprite.userData.itemId === itemId) {
      sprite.position.x = x;
      sprite.position.z = z;
    }
  });
}

function makeTextSprite(text, kind = 'mesa') {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 640; canvas.height = 144;

  const r = 16;
  ctx.fillStyle = 'rgba(10,10,11,0.92)';
  roundRect(ctx, 4, 4, canvas.width-8, canvas.height-8, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  roundRect(ctx, 4, 4, canvas.width-8, canvas.height-8, r);
  ctx.stroke();

  const labels = {
    mesa:   '— MESA —',
    buffet: '— BUFFET —',
    carpa:  '— CARPA —',
    green:  '— VEGETACIÓN —',
    lights: '— LUCES —',
    room:   '— ESTRUCTURA —'
  };
  const labelColors = {
    mesa:   'rgba(212,255,58,0.85)',
    buffet: 'rgba(212,255,58,0.85)',
    carpa:  'rgba(212,165,116,0.95)',
    green:  'rgba(120,220,140,0.95)',
    lights: 'rgba(255,210,90,0.95)',
    room:   'rgba(220,220,220,0.95)'
  };

  ctx.font = '500 22px "JetBrains Mono", monospace';
  ctx.fillStyle = labelColors[kind] || labelColors.mesa;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(labels[kind] || labels.mesa, canvas.width/2, 18);

  ctx.font = '500 44px "JetBrains Mono", monospace';
  ctx.fillStyle = '#f5f3ee';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width/2, canvas.height/2 + 14);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.8, 0.63, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

/* ─── Plano base (imagen/PDF/DXF aplicado como textura del suelo) ─── */
function setPlanTexture(texture) {
  if (planMesh) {
    scene.remove(planMesh);
    planMesh.geometry.dispose();
    planMesh.material.dispose();
  }
  const geo = new THREE.PlaneGeometry(_appState.plan.widthM, _appState.plan.lengthM);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: _appState.plan.opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  planMesh = new THREE.Mesh(geo, mat);
  planMesh.rotation.x = -Math.PI / 2;
  planMesh.position.y = 0.005;
  planMesh.renderOrder = 1;
  planMesh.receiveShadow = false;
  scene.add(planMesh);
  _appState.plan.mesh = planMesh;
  _appState.plan.texture = texture;
}

function updatePlanSize() {
  if (!planMesh) return;
  planMesh.geometry.dispose();
  planMesh.geometry = new THREE.PlaneGeometry(_appState.plan.widthM, _appState.plan.lengthM);
}

function updatePlanOpacity(val) {
  if (!planMesh) return;
  planMesh.material.opacity = val;
  _appState.plan.opacity = val;
}

function setControlsEnabled(enabled) {
  if (!_appState) return;
  if (_appState.camera === 'iso') {
    controlsIso.enabled = enabled;
  } else {
    controlsTop.enabled = enabled;
  }
}

/* ─── Sombras: ON solo si flag activo Y cámara isométrica ─── */
function applyShadowState() {
  if (!_appState || !renderer) return;
  const shouldRenderShadows = _appState.shadows === true && _appState.camera === 'iso';
  renderer.shadowMap.enabled = shouldRenderShadows;
  if (directionalLight) directionalLight.castShadow = shouldRenderShadows;
  // Fuerza repintado de materiales (los standard reciben shadow info)
  renderer.shadowMap.needsUpdate = true;
}

function setZoomPercent(pct) {
  const percent = Math.max(40, Math.min(300, pct));
  const factor = percent / 100;
  if (_appState.camera === 'iso') {
    const offset = perspectiveCam.position.clone().sub(controlsIso.target);
    offset.setLength(28 / factor);
    perspectiveCam.position.copy(controlsIso.target.clone().add(offset));
  } else {
    orthoCam.zoom = factor;
    orthoCam.updateProjectionMatrix();
  }
  document.dispatchEvent(new CustomEvent('escale:zoom-changed', { detail: { percent } }));
}

function screenToGround(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, activeCam);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(dragPlane, point) ? point : null;
}

function focusPoint(x, z, zoomPercent = 250) {
  if (_appState.camera === 'iso') {
    const offset = perspectiveCam.position.clone().sub(controlsIso.target);
    controlsIso.target.set(x, 0, z);
    offset.setLength(28 / Math.max(0.4, zoomPercent / 100));
    perspectiveCam.position.copy(controlsIso.target.clone().add(offset));
  } else {
    controlsTop.target.set(x, 0, z);
    orthoCam.position.x = x;
    orthoCam.position.z = z;
    orthoCam.lookAt(x, 0, z);
  }
  setZoomPercent(zoomPercent);
  activeControls.update();
}

/* ─── API exportada ─── */

/* ─── Canvas boundary (rectángulo de área de trabajo) ─── */
let canvasBoundary = null;

function setCanvasSize(wM, lM) {
  if (!_appState) return;
  if (canvasBoundary) { scene.remove(canvasBoundary); canvasBoundary = null; }
  const points = [
    new THREE.Vector3(-wM/2, 0.02, -lM/2),
    new THREE.Vector3( wM/2, 0.02, -lM/2),
    new THREE.Vector3( wM/2, 0.02,  lM/2),
    new THREE.Vector3(-wM/2, 0.02,  lM/2),
    new THREE.Vector3(-wM/2, 0.02, -lM/2),
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  canvasBoundary = new THREE.Line(geo,
    new THREE.LineBasicMaterial({ color: 0x00c853, linewidth: 3, transparent: true, opacity: 1.0, depthTest: false })
  );
  canvasBoundary.renderOrder = 999;
  scene.add(canvasBoundary);
  rebuildGrids();
}

/* ─── Modo mover plano ─── */
let planMoving = false;
let planLocked = false;
let planMoveStart = null;
let planMeshStart = null;

function setPlanMoving(active) {
  planMoving = active && !planLocked;
}

function setPlanLocked(locked) {
  planLocked = locked;
  if (locked) planMoving = false;
}

function isPlanLocked() { return planLocked; }
function isPlanMoving() { return planMoving; }

function startPlanMove(point) {
  if (!planMoving) return;
  planMoveStart = { x: point.x, z: point.z };
  // Guardamos posición actual del boundary
  planMeshStart = {
    x: canvasBoundary?.position.x ?? 0,
    z: canvasBoundary?.position.z ?? 0
  };
}

function updatePlanMove(point) {
  if (!planMoving || !planMoveStart || !canvasBoundary) return;
  const dx = point.x - planMoveStart.x;
  const dz = point.z - planMoveStart.z;
  canvasBoundary.position.x = planMeshStart.x + dx;
  canvasBoundary.position.z = planMeshStart.z + dz;
}

function endPlanMove() {
  planMoveStart = null;
  planMeshStart = null;
}

export const SceneManager = {
  async init() {
    await bindDeps();
    init();
  },
  spawn, rebuild, removeItem, moveItem, rotateItem,
  highlightSelection,
  drawCotas,
  setCamera,
  setControlsEnabled,
  setZoomPercent,
  screenToGround,
  focusPoint,
  rebuildGrids,
  applyShadowState,
  setPlanTexture, updatePlanSize, updatePlanOpacity,
  setCanvasSize,
  setPlanMoving, setPlanLocked, isPlanLocked, isPlanMoving,
  startPlanMove, updatePlanMove, endPlanMove,
  get scene() { return scene; },
  get renderer() { return renderer; },
  get activeCam() { return activeCam; },
  get activeControls() { return activeControls; },
  get meshes() { return meshes; },
  get dragPlane() { return dragPlane; }
};

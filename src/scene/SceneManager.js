/* ─────────────────────────────────────────────────────────
   SCENE MANAGER — Three.js: escena, cámaras, render, cotas
   ───────────────────────────────────────────────────────── */

import { ModelFactory } from '../models/index.js';
import { computePostPositions } from '../models/carpaHelpers.js';
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

function isCarpaType(type) {
  return type === 'carpa' || String(type || '').startsWith('carpa');
}

function isLightingItem(item) {
  return item.type === 'cableLuces'
    || item.type === 'poste'
    || (item.type === 'ambiente' && item.subtype === 'spot');
}

function isCameraSpecificItem(item) {
  return isCarpaType(item.type) || item.type === 'room' || isLightingItem(item);
}

function shouldUseTopSymbol(item) {
  return _appState?.camera === 'top' && isCameraSpecificItem(item);
}

function createModelForCurrentView(item) {
  const group = shouldUseTopSymbol(item) ? createTopSymbol(item) : ModelFactory.create(item);
  if (_appState?.camera === 'iso' && isCameraSpecificItem(item)) hideIsoFootprintFills(group, item);
  return group;
}

function createTopSymbol(item) {
  if (isCarpaType(item.type)) return createTopCarpaSymbol(item);
  if (item.type === 'room') return createTopRoomSymbol(item);
  if (item.type === 'cableLuces') return createTopCableSymbol(item);
  if (item.type === 'poste') return createTopPosteSymbol(item);
  if (item.type === 'ambiente' && item.subtype === 'spot') return createTopSpotSymbol(item);
  return ModelFactory.create(item);
}

function makeFlatMaterial(color, opacity = 0.12) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
    polygonOffset: false,
  });
  mat.needsUpdate = true;
  return mat;
}

function makeLine(points, color, y = 0.045) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, y, z)));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: true }));
  line.renderOrder = 25;
  return line;
}

function addFlatRect(group, L, W, color, fillOpacity = 0.10) {
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(L, W), makeFlatMaterial(color, fillOpacity));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.032;
  fill.renderOrder = 20;
  fill.userData.baseColor = color;
  fill.userData.baseOpacity = fillOpacity;
  fill.userData.isMain = true;
  group.add(fill);

  group.add(makeLine([
    [-L / 2, -W / 2],
    [ L / 2, -W / 2],
    [ L / 2,  W / 2],
    [-L / 2,  W / 2],
    [-L / 2, -W / 2]
  ], color));
}

function addFlatCircle(group, diameter, color, fillOpacity = 0.10) {
  const radius = diameter / 2;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), makeFlatMaterial(color, fillOpacity));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.032;
  fill.renderOrder = 20;
  fill.userData.baseColor = color;
  fill.userData.baseOpacity = fillOpacity;
  fill.userData.isMain = true;
  group.add(fill);

  const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.01, radius - 0.035), radius, 64), makeFlatMaterial(color, 0.9));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.046;
  ring.renderOrder = 26;
  ring.userData.baseColor = color;
  group.add(ring);
}

function addPostCircle(group, x, z, diameter, color) {
  const radius = Math.max(diameter / 2, 0.075);
  const post = new THREE.Mesh(new THREE.CircleGeometry(radius, 18), makeFlatMaterial(color, 0.95));
  post.rotation.x = -Math.PI / 2;
  post.position.set(x, 0.052, z);
  post.renderOrder = 30;
  post.userData.baseColor = color;
  group.add(post);
}

function carpaFootprint(item) {
  const dims = item.dims || {};
  if (typeof dims.diameter === 'number') return { shape: 'circle', diameter: dims.diameter };
  if (typeof dims.size === 'number') return { shape: 'rect', length: dims.size, width: dims.size };
  return { shape: 'rect', length: dims.length ?? 6, width: dims.width ?? 3 };
}

function createTopCarpaSymbol(item) {
  const group = new THREE.Group();
  const color = parseHex(item.poleColor || item.tarpColor || '#6b4423');
  const footprint = carpaFootprint(item);
  const postD = item.posts?.diameter ?? 0.12;
  const showPosts = item.posts?.enabled !== false;

  if (footprint.shape === 'circle') {
    addFlatCircle(group, footprint.diameter, color, 0.08);
    if (showPosts) addPostCircle(group, 0, 0, postD * 1.8, color);
    return group;
  }

  const L = footprint.length;
  const W = footprint.width;
  addFlatRect(group, L, W, color, 0.08);
  if (showPosts) {
    const spacing = item.posts?.spacing ?? Math.max(2, Math.min(L, W));
    computePostPositions(L, W, spacing).forEach(([x, z]) => addPostCircle(group, x, z, postD, color));
  }

  if (item.columns?.enabled === true) {
    const rows = Math.max(1, item.columns.rows ?? 1);
    const cols = Math.max(1, item.columns.cols ?? 2);
    const diameter = item.columns.diameter ?? 0.15;
    for (let r = 1; r <= rows; r += 1) {
      for (let c = 1; c <= cols; c += 1) {
        addPostCircle(group, -L / 2 + (L * c) / (cols + 1), -W / 2 + (W * r) / (rows + 1), diameter, 0x8b5a2b);
      }
    }
  }
  return group;
}

function createTopRoomSymbol(item) {
  const group = new THREE.Group();
  const L = item.dims?.length ?? 6;
  const W = item.dims?.width ?? 4;
  const T = item.dims?.thickness ?? 0.1;
  const color = parseHex(item.color || '#ffffff');

  addFlatRect(group, L, W, color, 0.035);
  const wallMat = makeFlatMaterial(color, 0.85);
  [
    { geo: new THREE.PlaneGeometry(L, T), pos: [0, 0.055, W / 2 - T / 2] },
    { geo: new THREE.PlaneGeometry(L, T), pos: [0, 0.055, -W / 2 + T / 2] },
    { geo: new THREE.PlaneGeometry(T, W), pos: [L / 2 - T / 2, 0.055, 0] },
    { geo: new THREE.PlaneGeometry(T, W), pos: [-L / 2 + T / 2, 0.055, 0] }
  ].forEach(({ geo, pos }, index) => {
    const wall = new THREE.Mesh(geo, wallMat.clone());
    wall.rotation.x = -Math.PI / 2;
    wall.position.set(...pos);
    wall.renderOrder = 31;
    wall.userData.baseColor = color;
    if (index === 0) wall.userData.isMain = true;
    group.add(wall);
  });
  return group;
}

function createTopCableSymbol(item) {
  const group = new THREE.Group();
  const count = Math.max(2, item.count ?? 8);
  const spacing = Math.max(0.2, item.spacing ?? 1.0);
  const totalLength = count * spacing;
  const cableColor = parseHex(item.cableColor || '#1a1a1c');
  const lightColor = parseHex(item.lightColor || '#ffd454');

  group.add(makeLine([[-totalLength / 2, 0], [totalLength / 2, 0]], cableColor, 0.055));

  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(totalLength, 0.45),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.rotation.x = -Math.PI / 2;
  hit.position.y = 0.04;
  hit.userData.baseColor = cableColor;
  hit.userData.isMain = true;
  group.add(hit);

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : (i + 0.5) / count;
    const x = -totalLength / 2 + totalLength * t;
    function addPostCircle(group, x, z, diameter, color) {
  const radius = Math.max(diameter / 2, 0.075);
  const post = new THREE.Mesh(new THREE.CircleGeometry(radius, 18), makeFlatMaterial(color, 0.95));
  post.rotation.x = -Math.PI / 2;
  post.position.set(x, 0.052, z);
  post.renderOrder = 30;
  post.userData.baseColor = color;
  group.add(post);
}
  }
  return group;
}

function createTopPosteSymbol(item) {
  const group = new THREE.Group();
  const color = parseHex(item.color || '#6b4423');
  addPostCircle(group, 0, 0, item.dims?.diameter ?? 0.12, color);
  group.children[0].userData.isMain = true;
  return group;
}

function createTopSpotSymbol(item) {
  const group = new THREE.Group();
  const color = parseHex(item.color || '#fffbe8');
  addFlatCircle(group, 0.55, color, 0.18);
  group.add(makeLine([[0, 0], [0, 0.9]], color, 0.056));
  return group;
}

function hideIsoFootprintFills(group, item) {
  group.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const role = child.userData?.role || '';
    const isKnownFootprint = role.includes('base') || role.includes('floor');
    const isSoftPlane = child.geometry?.type === 'PlaneGeometry'
      && child.material.transparent === true
      && child.material.opacity <= 0.15;
    if (isKnownFootprint || (isCarpaType(item.type) && isSoftPlane) || (item.type === 'room' && isSoftPlane)) {
      child.visible = false;
      child.userData.isMain = false;
    }
  });
}

function parseHex(hex) {
  return parseInt(String(hex || '#000000').replace('#', ''), 16);
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
  updatePlanViewMode();
  if (_appState) {
    _appState.items.filter(isCameraSpecificItem).forEach(item => rebuild(item));
  }
  applyShadowState();
}

function spawn(item) {
  const group = createModelForCurrentView(item);
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
  const disposed = new WeakSet();
  const items = [];
  group.traverse(o => items.push(o));
  // Quitamos primero del grafo, luego liberamos
  items.forEach(o => {
    if (o.parent) o.parent.remove(o);
  });
  items.forEach(o => {
    if (o.geometry && !disposed.has(o.geometry)) {
      disposed.add(o.geometry);
      try { o.geometry.dispose(); } catch(e) {}
    }
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        if (!m || disposed.has(m)) return;
        disposed.add(m);
        try {
          if (m.map && !disposed.has(m.map)) {
            disposed.add(m.map);
            m.map.dispose();
          }
          m.dispose();
        } catch(e) {}
      });
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
        label = item.subtype === 'alfombra' && typeof item.dims?.diameter === 'number'
          ? `Ø ${item.dims.diameter}m`
          : subLabel;
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

  // Sin fondo — solo texto
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Texto principal
  ctx.font = 'bold 48px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Stroke blanco
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, canvas.width/2, canvas.height/2);

  // Fill negro
  ctx.fillStyle = 'rgba(10,10,11,0.85)';
  ctx.fillText(text, canvas.width/2, canvas.height/2);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.5, 1.0, 1);
  sprite.position.y = 0.15;
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
  updatePlanViewMode();
}

function updatePlanViewMode() {
  if (!planMesh) return;
  const isTop = _appState?.camera === 'top';
  planMesh.position.y = isTop ? 0.005 : 0.018;
  planMesh.renderOrder = isTop ? 1 : 3;
  planMesh.material.depthWrite = false;
  planMesh.material.needsUpdate = true;
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
    z: canvasBoundary?.position.z ?? 0,
    planX: planMesh?.position.x ?? 0,
    planZ: planMesh?.position.z ?? 0
  };
}

function updatePlanMove(point) {
  if (!planMoving || !planMoveStart || !canvasBoundary) return;
  const dx = point.x - planMoveStart.x;
  const dz = point.z - planMoveStart.z;
  canvasBoundary.position.x = planMeshStart.x + dx;
  canvasBoundary.position.z = planMeshStart.z + dz;
  if (planMesh) {
    planMesh.position.x = planMeshStart.planX + dx;
    planMesh.position.z = planMeshStart.planZ + dz;
  }
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

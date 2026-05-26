/* ─────────────────────────────────────────────────────────
   SCENE MANAGER — Three.js: escena, cámaras, render, cotas
   ───────────────────────────────────────────────────────── */

import { ModelFactory } from '../models/index.js';
import { computePostPositions } from '../models/carpaHelpers.js';
import { SchemaRegistry } from '../schemas/SchemaRegistry.js';
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
let placementPreview = null;
let placementPreviewItem = null;
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

function buildRectGridGeo(sX, sZ, divX, divZ) {
  const verts = [];
  for (let i = 0; i <= divX; i++) {
    const x = -sX / 2 + i * (sX / divX);
    verts.push(x, 0, -sZ / 2, x, 0, sZ / 2);
  }
  for (let j = 0; j <= divZ; j++) {
    const z = -sZ / 2 + j * (sZ / divZ);
    verts.push(-sX / 2, 0, z, sX / 2, 0, z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return geo;
}

function rebuildGrids() {
  [gridHelper, gridMain].forEach(g => {
    if (!g) return;
    scene.remove(g);
    g.geometry.dispose();
    (Array.isArray(g.material) ? g.material : [g.material]).forEach(m => m?.dispose?.());
  });

  const sX = Math.max(20, _appState?.grid?.extentX ?? _appState?.grid?.extent ?? 60);
  const sZ = Math.max(20, _appState?.grid?.extentZ ?? _appState?.grid?.extent ?? 60);
  const subSize = Math.max(0.05, _appState?.grid?.subSize ?? _appState?.snap?.spacing ?? 0.25);
  const mainSize = Math.max(subSize, _appState?.grid?.majorSize ?? 1);
  const visibility = Math.max(0, Math.min(100, _appState?.grid?.opacity ?? 55)) / 100;

  const divXFine = Math.min(1600, Math.max(1, Math.round(sX / subSize)));
  const divZFine = Math.min(1600, Math.max(1, Math.round(sZ / subSize)));
  const divXMain = Math.min(800, Math.max(1, Math.round(sX / mainSize)));
  const divZMain = Math.min(800, Math.max(1, Math.round(sZ / mainSize)));

  const fineMat = new THREE.LineBasicMaterial({ color: 0x1a1a1c, transparent: true, opacity: visibility * 0.28 });
  gridHelper = new THREE.LineSegments(buildRectGridGeo(sX, sZ, divXFine, divZFine), fineMat);
  scene.add(gridHelper);

  const mainMat = new THREE.LineBasicMaterial({ color: 0x1a1a1c, transparent: true, opacity: visibility * 0.62 });
  gridMain = new THREE.LineSegments(buildRectGridGeo(sX, sZ, divXMain, divZMain), mainMat);
  scene.add(gridMain);
  applyGridOffsets();
}

function applyGridOffsets() {
  const offsetX = _appState?.grid?.offsetX ?? 0;
  const offsetZ = _appState?.grid?.offsetZ ?? 0;
  if (gridHelper) gridHelper.position.set(offsetX, 0.008, offsetZ);
  if (gridMain) gridMain.position.set(offsetX, 0.012, offsetZ);
}

function isCarpaType(type) {
  return type === 'carpa' || String(type || '').startsWith('carpa');
}

function isLightingItem(item) {
  return item.type === 'cableLuces'
    || item.type === 'poste'
    || (item.type === 'ambiente' && item.subtype === 'spot');
}

function isZoneItem(item) {
  return item?.type === 'zone';
}

function resolveItemCategory(item) {
  return item?.catalogCategory
    || SchemaRegistry.resolve(item)?.metadata?.category
    || item?.category
    || '';
}

function isChairCategoryItem(item) {
  const category = resolveItemCategory(item);
  return category === 'chairs'
    || item?.type === 'sillaCatering'
    || item?.type === 'sillaLineal'
    || item?.schemaId === 'seat.sofa';
}

function isCameraSpecificItem(item) {
  return isCarpaType(item.type) || item.type === 'room' || isLightingItem(item) || isZoneItem(item);
}

function shouldUseTopSymbol(item) {
  return _appState?.camera === 'top' && isCameraSpecificItem(item);
}

function createModelForCurrentView(item) {
  if (isZoneItem(item)) return createZoneSymbol(item);
  const view = _appState?.camera === 'top' ? 'top' : 'iso';
  const group = shouldUseTopSymbol(item) ? createTopSymbol(item) : ModelFactory.create(item, { view });
  if (_appState?.camera === 'iso' && isCameraSpecificItem(item)) hideIsoFootprintFills(group, item);
  if (view === 'top') addTopStrokes(group);
  return group;
}

function addTopStrokes(group) {
  group.traverse(child => {
    if (!child?.isMesh || !child.geometry || !child.material) return;
    if (child.userData?.skipTopStroke || child.userData?.isTopStroke) return;
    if (Array.isArray(child.material) ? child.material.some(material => material?.map) : child.material?.map) return;

    const edgesGeometry = new THREE.EdgesGeometry(child.geometry, 1);
    const position = edgesGeometry.getAttribute('position');
    if (!position || position.count === 0) {
      edgesGeometry.dispose();
      return;
    }

    const stroke = new THREE.LineSegments(
      edgesGeometry,
      new THREE.LineBasicMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.48,
        depthTest: false,
        depthWrite: false
      })
    );
    stroke.renderOrder = (child.renderOrder || 0) + 2;
    stroke.userData.isTopStroke = true;
    child.add(stroke);
  });
}

function eachMaterial(target, callback) {
  const materials = Array.isArray(target.material) ? target.material : [target.material];
  materials.filter(Boolean).forEach(callback);
}

function ensureInteractiveGroup(group, itemId) {
  let mainMesh = null;
  group.traverse(child => {
    child.userData = child.userData || {};
    child.userData.rootId = itemId;
    if (!child.isMesh) return;

    if (!mainMesh) mainMesh = child;
    if (child.userData.isMain && child.userData.baseColor === undefined) {
      eachMaterial(child, material => {
        if (child.userData.baseColor === undefined && material?.color) {
          child.userData.baseColor = material.color.getHex();
        }
        if (child.userData.baseOpacity === undefined
          && material?.transparent === true
          && typeof material.opacity === 'number') {
          child.userData.baseOpacity = material.opacity;
        }
      });
    }
  });

  if (mainMesh && mainMesh.userData.isMain !== true) {
    mainMesh.userData.isMain = true;
    if (mainMesh.userData.baseColor === undefined) {
      eachMaterial(mainMesh, material => {
        if (mainMesh.userData.baseColor === undefined && material?.color) {
          mainMesh.userData.baseColor = material.color.getHex();
        }
      });
    }
  }
}

function collectInteractiveMeshes() {
  const meshArray = [];
  meshes.forEach(group => {
    group.traverse(child => {
      if (!child?.isMesh || child.userData?.isPlacementPreview || child.userData?.isTopStroke) return;
      if (child.userData?.isMain === true || child.userData?.baseColor !== undefined) meshArray.push(child);
    });
  });
  return meshArray;
}

function resolveItemFromObject(object) {
  let node = object;
  while (node && (!node.userData || (node.userData.id === undefined && node.userData.rootId === undefined))) {
    node = node.parent;
  }
  const resolvedId = node?.userData?.id ?? node?.userData?.rootId;
  return resolvedId !== undefined ? _appState?.items.find(item => item.id === resolvedId) || null : null;
}

function computeMeshTopY(group) {
  const bounds = new THREE.Box3();
  const childBounds = new THREE.Box3();
  let hasMesh = false;
  group?.traverse?.(child => {
    if (!child?.isMesh || child.userData?.isPlacementPreview || child.visible === false) return;
    childBounds.setFromObject(child);
    if (!Number.isFinite(childBounds.max.y)) return;
    if (!hasMesh) bounds.copy(childBounds);
    else bounds.union(childBounds);
    hasMesh = true;
  });
  return hasMesh ? bounds.max.y : 0;
}

function measureItemTopY(item) {
  if (!item) return 0;
  const group = meshes.get(item.id);
  const canUseCurrentGroup = group && _appState?.camera === 'iso' && !shouldUseTopSymbol(item);
  if (canUseCurrentGroup) return computeMeshTopY(group);

  const probe = ModelFactory.create(item, { view: 'iso' }) || new THREE.Group();
  const topY = computeMeshTopY(probe) || Math.max(0, item.dims?.height ?? 0);
  disposeGroup(probe);
  return topY;
}

function stylePlacementPreview(group) {
  group.traverse(child => {
    child.userData = child.userData || {};
    child.userData.isPlacementPreview = true;

    if (child.isMesh && child.material) {
      child.castShadow = false;
      child.receiveShadow = false;
      if (Array.isArray(child.material)) {
        child.material = child.material.map(material => material?.clone?.() || material);
      } else if (child.material.clone) {
        child.material = child.material.clone();
      }
      eachMaterial(child, material => {
        material.transparent = true;
        material.depthWrite = false;
        material.opacity = Math.max(0.2, Math.min(typeof material.opacity === 'number' ? material.opacity * 0.48 : 0.48, 0.72));
        if ('emissive' in material && material.emissive) {
          material.emissive = new THREE.Color(0xffffff);
          material.emissiveIntensity = 0.14;
        }
      });
    }

    if (child.isSprite && child.material?.clone) {
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.opacity = 0.76;
      child.renderOrder = 60;
    }
  });
}

function refreshPlacementPreview() {
  if (!placementPreviewItem) return;
  const snapshot = {
    ...placementPreviewItem,
    dims: placementPreviewItem.dims ? { ...placementPreviewItem.dims } : placementPreviewItem.dims,
    visual: placementPreviewItem.visual ? { ...placementPreviewItem.visual } : placementPreviewItem.visual
  };
  clearPlacementPreview();
  setPlacementPreview(snapshot);
}

function createTopSymbol(item) {
  if (isZoneItem(item)) return createZoneSymbol(item);
  if (isCarpaType(item.type)) return createTopCarpaSymbol(item);
  if (item.type === 'room') return createTopRoomSymbol(item);
  if (item.type === 'cableLuces') return createTopCableSymbol(item);
  if (item.type === 'poste') return createTopPosteSymbol(item);
  if (item.type === 'ambiente' && item.subtype === 'spot') return createTopSpotSymbol(item);
  return ModelFactory.create(item, { view: 'top' });
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

function addFlatRect(group, L, W, color, fillOpacity = 0.10, borderColor = color) {
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
  ], borderColor));
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
    addPostCircle(group, x, 0, 0.12, lightColor);
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

function hexToRgba(hex, alpha = 1) {
  const parsed = parseHex(hex);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function makeZoneLabelSprite(text, color, options = {}) {
  const { fontSize = 58, textColor } = options;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 700;
  canvas.height = 180;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `600 ${fontSize}px "Inter Tight", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor || hexToRgba(color, 0.48);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4.8, 1.22, 1);
  sprite.position.set(0, 0.085, 0);
  sprite.renderOrder = 40;
  return sprite;
}

function createZoneSymbol(item) {
  const group = new THREE.Group();
  const length = Math.max(0.5, item.dims?.length ?? 4);
  const width = Math.max(0.5, item.dims?.width ?? 4);
  const borderColor = parseHex(item.borderColor || item.color || '#22c55e');
  const fillColor = parseHex(item.color || '#22c55e');
  const fillOpacity = item.fillEnabled === false
    ? 0.001
    : Math.max(0.05, Math.min(item.visual?.opacity ?? item.fillOpacity ?? 0.18, 0.6));

  addFlatRect(group, length, width, fillColor, fillOpacity, borderColor);

  if (item.labelText && item.showLabel !== false) {
    group.add(makeZoneLabelSprite(
      item.labelText,
      item.borderColor || item.color || '#22c55e',
      { fontSize: item.fontSize ?? 58, textColor: item.textColor }
    ));
  }

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
    _appState.items.forEach(item => rebuild(item));
  }
  if (placementPreviewItem) refreshPlacementPreview();
  applyShadowState();
}

function spawn(item) {
  const group = createModelForCurrentView(item);
  group.userData = { ...(group.userData || {}), id: item.id };
  ensureInteractiveGroup(group, item.id);
  group.position.set(item.x || 0, item.y || 0, item.z || 0);
  if (item.rotY) group.rotation.y = item.rotY;
  if (item.type === 'schemaSurface' && _appState?.camera === 'iso') group.visible = false;
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
  // ⚠️ No llamar drawCotas() aquí: cuando viene de AppState.remove(),
  // el item todavía está en AppState.items y las cotas se redibujarían
  // incluyendo la zona eliminada. drawCotas() se llama desde AppState.remove()
  // DESPUÉS del splice, y desde spawn() tras un rebuild().
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

function moveItem(id, x, z, y = null) {
  const g = meshes.get(id);
  if (!g) return;
  g.position.x = x;
  if (y !== null && y !== undefined) g.position.y = y;
  g.position.z = z;
  const item = _appState?.items.find(i => i.id === id);
  if (item) {
    item.x = x;
    item.z = z;
    if (y !== null && y !== undefined) item.y = y;
  }
  moveCotaFor(id, x, z);
}

function rotateItem(id, rotY) {
  const g = meshes.get(id);
  if (!g) return;
  g.rotation.y = rotY;
  const item = _appState?.items.find(i => i.id === id);
  if (item) item.rotY = rotY;
  if (_appState?.showCotas) drawCotas();
}

function highlightSelection() {
  if (!_appState) return;
  const selectedSet = _appState.selectedIds || new Set();

  // Pull same-style marks from SelectionManager if available
  const markedSameStyle = window.SelectionManager?.markedSameStyleIds || new Set();

  // Pull layer state from LayerManager if available
  const lm = window.LayerManager;

  meshes.forEach((g, id) => {
    const it = _appState.items.find(x => x.id === id);
    const isSelected   = selectedSet.has(id);
    const isMarked     = markedSameStyle.has(id);
    const isLocked     = Boolean(it?.locked);
    const layerLocked  = lm ? !lm.isItemEditable(it) && !isLocked : false;
    const isCarpa      = it && isCarpaType(it.type);

    g.traverse(child => {
      if (!child.isMesh || child.userData.baseColor === undefined) return;

      eachMaterial(child, material => {
        // ── Carpas: tint opacity/color on select ──
        if (isCarpa) {
          const baseOp = child.userData.baseOpacity ?? material.opacity ?? 1;
          if (typeof material.opacity === 'number') {
            material.opacity = isSelected
              ? Math.min(1, baseOp * 1.5)
              : isLocked || layerLocked ? baseOp * 0.45 : baseOp;
            material.needsUpdate = true;
          }
          if (material.color?.setHex) {
            material.color.setHex(isSelected ? 0x8b5a2b : child.userData.baseColor);
          }
          return;
        }

        // ── Emissive highlight (blue select, yellow mark) ──
        if ('emissive' in material && material.emissive) {
          let emColor = 0x000000;
          let emIntensity = 0;
          if (isSelected) {
            emColor = 0x3b82f6; // blue-500
            emIntensity = 0.22;
          } else if (isMarked) {
            emColor = 0xd4ff3a; // yellow-lime
            emIntensity = 0.18;
          }
          material.emissive = new THREE.Color(emColor);
          material.emissiveIntensity = emIntensity;
        }

        // ── Base color (restore or tint for lock) ──
        if (material.color?.setHex) {
          material.color.setHex(child.userData.baseColor);
        }

        // ── Locked items: reduce opacity ──
        if (material.transparent !== undefined) {
          const baseOp = child.userData.baseOpacity ?? 1;
          if (isLocked || layerLocked) {
            material.transparent = true;
            material.opacity = baseOp * 0.45;
          } else {
            material.opacity = baseOp;
            if (baseOp >= 1) material.transparent = false;
          }
          material.needsUpdate = true;
        }
      });
    });
  });
}

function createDimensionLabel(text) {
  const sprite = makeTextSprite(text, 'zone');
  sprite.scale.set(2.6, 0.72, 1);
  sprite.position.y = 0.01;
  return sprite;
}

function addDimensionArrow(group, start, end, label, labelOffset = [0, 0]) {
  const main = makeLine([start, end], 0x111111, 0.062);
  group.add(main);

  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  const arrowSize = Math.min(0.28, Math.max(0.12, length * 0.12));
  const wingAngle = 0.45;

  const arrowPoints = (origin, dir) => {
    const bx = origin[0] - dir * ux * arrowSize;
    const bz = origin[1] - dir * uz * arrowSize;
    const px = -uz;
    const pz = ux;
    return [
      [origin, [bx + px * arrowSize * wingAngle, bz + pz * arrowSize * wingAngle]],
      [origin, [bx - px * arrowSize * wingAngle, bz - pz * arrowSize * wingAngle]]
    ];
  };

  [...arrowPoints(start, -1), ...arrowPoints(end, 1)].forEach(([from, to]) => {
    group.add(makeLine([from, to], 0x111111, 0.062));
  });

  const labelSprite = createDimensionLabel(label);
  labelSprite.position.set(
    (start[0] + end[0]) / 2 + labelOffset[0],
    0.07,
    (start[1] + end[1]) / 2 + labelOffset[1]
  );
  group.add(labelSprite);
}

function createZoneCotasGroup(item) {
  const group = new THREE.Group();
  const length = Math.max(0.5, item.dims?.length ?? 4);
  const width = Math.max(0.5, item.dims?.width ?? 4);
  const offset = 0.46;

  group.userData.itemId = item.id;
  group.userData.isZoneCota = true;
  group.position.set(item.x, 0, item.z);
  group.rotation.y = item.rotY || 0;

  group.add(makeLine([
    [-length / 2, width / 2],
    [-length / 2, width / 2 + offset]
  ], 0x111111, 0.062));
  group.add(makeLine([
    [length / 2, width / 2],
    [length / 2, width / 2 + offset]
  ], 0x111111, 0.062));
  addDimensionArrow(
    group,
    [-length / 2, width / 2 + offset],
    [length / 2, width / 2 + offset],
    `${length.toFixed(1)}m`,
    [0, 0.24]
  );

  group.add(makeLine([
    [length / 2, -width / 2],
    [length / 2 + offset, -width / 2]
  ], 0x111111, 0.062));
  group.add(makeLine([
    [length / 2, width / 2],
    [length / 2 + offset, width / 2]
  ], 0x111111, 0.062));
  addDimensionArrow(
    group,
    [length / 2 + offset, -width / 2],
    [length / 2 + offset, width / 2],
    `${width.toFixed(1)}m`,
    [0.26, 0]
  );

  return group;
}

function drawCotas() {
  while (cotasGroup.children.length) {
    const c = cotasGroup.children.pop();
    disposeGroup(c);
  }
  if (!_appState?.showCotas) return;

  const COTAS_ALWAYS = ['mesa', 'buffet', 'carpa', 'mesaRect', 'mesaImperial',
    'mesaCocktail', 'mesaCurva', 'mesaSerpentina', 'barraLibre',
    'carpaCuadrada', 'carpaStar',
    'carpaPabellon', 'carpaTransparente', 'carpaBeduina',
    'carpaSailcloth', 'carpaTipi', 'carpaDomo', 'zone'];

  _appState.items.forEach(item => {
    if (isChairCategoryItem(item)) return;
    if (!COTAS_ALWAYS.includes(item.type) && !item.showLabel) return;

    if (isZoneItem(item)) {
      cotasGroup.add(createZoneCotasGroup(item));
      return;
    }

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
  cotasGroup.children.forEach(node => {
    if (node.userData.itemId === itemId) {
      node.position.x = x;
      node.position.z = z;
      if (node.userData.isZoneCota) {
        const item = _appState?.items.find(entry => entry.id === itemId);
        node.rotation.y = item?.rotY || 0;
      }
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

function screenToPlacement(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, activeCam);

  const intersects = raycaster.intersectObjects(collectInteractiveMeshes(), false);
  for (const hit of intersects) {
    const item = resolveItemFromObject(hit.object);
    if (!item || isZoneItem(item)) continue;
    return {
      x: hit.point.x,
      y: (item.y || 0) + measureItemTopY(item),
      z: hit.point.z,
      stacked: true,
      targetItem: item
    };
  }

  const ground = screenToGround(clientX, clientY);
  if (!ground) return null;
  return {
    x: ground.x,
    y: 0,
    z: ground.z,
    stacked: false,
    targetItem: null
  };
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

function setPlacementPreview(item) {
  if (!scene) return;
  clearPlacementPreview();
  if (!item) return;

  placementPreviewItem = JSON.parse(JSON.stringify(item));
  placementPreview = createModelForCurrentView(placementPreviewItem) || new THREE.Group();
  stylePlacementPreview(placementPreview);
  placementPreview.position.set(item.x || 0, item.y || 0, item.z || 0);
  placementPreview.rotation.y = item.rotY || 0;
  placementPreview.userData = { ...(placementPreview.userData || {}), isPlacementPreview: true };
  scene.add(placementPreview);
}

function updatePlacementPreview(x, z, y = null) {
  if (!placementPreview) return;
  placementPreview.position.x = x;
  if (y !== null && y !== undefined) placementPreview.position.y = y;
  placementPreview.position.z = z;
  if (placementPreviewItem) {
    placementPreviewItem.x = x;
    placementPreviewItem.z = z;
    if (y !== null && y !== undefined) placementPreviewItem.y = y;
  }
}

function clearPlacementPreview() {
  if (!placementPreview) return;
  scene.remove(placementPreview);
  disposeGroup(placementPreview);
  placementPreview = null;
  placementPreviewItem = null;
}

/* ─── API exportada ─── */

/* ─── Canvas boundary (rectángulo de área de trabajo) ─── */
let canvasBoundary = null;

function setCanvasSize(wM, lM) {
  if (!_appState) return;
  if (canvasBoundary) {
    scene.remove(canvasBoundary);
    canvasBoundary.geometry?.dispose?.();
    canvasBoundary.material?.dispose?.();
    canvasBoundary = null;
  }
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
  if (_appState?.grid) _appState.grid.locked = locked;
  if (locked) planMoving = false;
}

function isPlanLocked() { return planLocked; }
function isPlanMoving() { return planMoving; }

function startPlanMove(point) {
  if (!planMoving) return;
  planMoveStart = { x: point.x, z: point.z };
  // Guardamos posición actual del boundary
  planMeshStart = {
    x: _appState?.grid?.offsetX ?? 0,
    z: _appState?.grid?.offsetZ ?? 0
  };
}

function updatePlanMove(point) {
  if (!planMoving || !planMoveStart || !_appState?.grid) return;
  const dx = point.x - planMoveStart.x;
  const dz = point.z - planMoveStart.z;
  _appState.grid.offsetX = planMeshStart.x + dx;
  _appState.grid.offsetZ = planMeshStart.z + dz;
  applyGridOffsets();
}
function endPlanMove() {
  planMoveStart = null;
  planMeshStart = null;
}

function redrawCotas() {
  if (_appState?.showCotas) drawCotas();
}

export const SceneManager = {
  async init() {
    await bindDeps();
    init();
  },
  spawn, rebuild, removeItem, moveItem, rotateItem,
  highlightSelection,
  drawCotas,
  redrawCotas,
  setCamera,
  setControlsEnabled,
  setZoomPercent,
  screenToGround,
  screenToPlacement,
  focusPoint,
  setPlacementPreview,
  updatePlacementPreview,
  clearPlacementPreview,
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

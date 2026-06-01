/**
 * WallPainter — Dibujo de plano 2D → transformación a paredes 3D
 */

import { SceneManager } from '../scene/SceneManager.js';
import { AppState }     from '../core/AppState.js';

/* ─── Constantes ─────────────────────────────────────────────────────────── */
const WALL_THICKNESS  = 0.10;
const ANGLE_SNAP_RAD  = Math.PI / 12;
const ENDPOINT_SNAP_M = 0.35;
const LENGTH_SNAP_M   = 0.10;   // snap de longitud → múltiplos de 10 cm
const GUIDE_SNAP_M    = 0.18;   // tolerancia de alineación con extremos (smart guide)
const DOOR_HEIGHT_M   = 2.05;   // alto del hueco de puerta
const CURVE_HANDLE_PX = 7;      // radio en pantalla del tirador de curvatura

/* ─── Estado ─────────────────────────────────────────────────────────────── */
let _active     = false;
let _tool       = 'line';    // 'line' | 'rect' | 'select'
let _wallHeight = 2.5;
let _wallColor  = '#1a1a2c';

let _cvs, _ctx;

let _drawing    = false;
let _p1         = null;
let _p1Screen   = null;
let _guideState = null;
let _downPos    = null;
let _isDragging = false;
let _cursorScreen = { x: 0, y: 0 };
let _shiftDown  = false;
let _altDown    = false;

let _segs   = [];
let _meshes = [];
let _labels = [];

let _ctxSeg     = null;  // mesh 3D seleccionado (menú wall-ctx-menu)
let _ctxSegIdx  = -1;    // índice de segmento 2D seleccionado (menú wp-seg-menu)
let _doorMode   = null;  // { segIdx, clicks:[t,...] } durante colocación de puerta
let _curveDrag  = null;  // { segIdx } mientras se arrastra el tirador de curvatura
let _globalContextMenuBound = false;
let _globalDownPos  = null;
let _globalDownSeg  = null;

let _labelContainer = null;
let _rafId = null;

/* ─── Label container ────────────────────────────────────────────────────── */
function _ensureLabelContainer() {
  if (_labelContainer) return;
  _labelContainer = document.createElement('div');
  _labelContainer.id = 'wall-labels-container';
  _labelContainer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:200;overflow:hidden';
  document.body.appendChild(_labelContainer);
  document.addEventListener('escale:plan-cotas-changed', e => {
    _labelContainer.style.display = e.detail.visible ? '' : 'none';
  });
}

/* ─── RAF loop ───────────────────────────────────────────────────────────── */
function _startRafLoop() {
  if (_rafId) return;
  function tick() {
    _redrawCanvas();
    _updateLabels();
    _rafId = requestAnimationFrame(tick);
  }
  tick();
}

function _updateLabels() {
  const cam = SceneManager.activeCam;
  if (!cam || !_labelContainer) return;
  const W = window.innerWidth, H = window.innerHeight;
  _labels.forEach(({ el, seg }) => {
    if (seg.labelHidden) { el.style.display = 'none'; return; }
    let cx, cz, lenShown;
    if (_isCurved(seg)) {
      const mid = _curveMidPoint(seg);
      cx = mid.x; cz = mid.z;
      lenShown = _arcLength(seg);
    } else {
      cx = (seg.p1.x + seg.p2.x) / 2;
      cz = (seg.p1.z + seg.p2.z) / 2;
      lenShown = seg.len;
    }
    el.textContent = `${lenShown.toFixed(2)} m`;
    const v = new THREE.Vector3(cx, 0.25, cz).project(cam);
    if (v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = `${(v.x + 1) / 2 * W}px`;
    el.style.top  = `${(-v.y + 1) / 2 * H}px`;
  });
}

// Longitud aproximada del arco (suma de tramos muestreados).
function _arcLength(seg) {
  const pts = _sampleCurve(seg, 24);
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].z - pts[i].z);
  }
  return total;
}

/* ─── Coordenadas ────────────────────────────────────────────────────────── */
function _screenToWorld(sx, sy) {
  return SceneManager.screenToGround(sx, sy) ?? null;
}

function _worldToScreen(wx, wz) {
  const cam = SceneManager.activeCam;
  if (!cam || !_cvs) return { x: 0, y: 0 };
  const v = new THREE.Vector3(wx, 0, wz).project(cam);
  return {
    x: (v.x + 1) / 2 * _cvs.width,
    y: (-v.y + 1) / 2 * _cvs.height
  };
}

/* ─── Snaps ──────────────────────────────────────────────────────────────── */
function _applyAngleSnap(p1w, p2w) {
  const dx = p2w.x - p1w.wx, dz = p2w.z - p1w.wz;
  let len = Math.sqrt(dx*dx + dz*dz);
  if (len < 0.01) return p2w;
  let angle = Math.atan2(dz, dx);
  if (!_shiftDown) angle = Math.round(angle / ANGLE_SNAP_RAD) * ANGLE_SNAP_RAD;
  // Snap de longitud a múltiplos de 10 cm (Alt lo desactiva, igual que el snap de extremos).
  if (!_altDown) len = Math.max(LENGTH_SNAP_M, Math.round(len / LENGTH_SNAP_M) * LENGTH_SNAP_M);
  return { x: p1w.wx + len * Math.cos(angle), z: p1w.wz + len * Math.sin(angle) };
}

function _applyEndpointSnap(p) {
  if (_altDown) return p;
  let best = null, bestDist = ENDPOINT_SNAP_M;
  for (const s of _segs) {
    for (const ep of [s.p1, s.p2]) {
      const d = Math.hypot(p.x - ep.x, p.z - ep.z);
      if (d < bestDist) { bestDist = d; best = ep; }
    }
  }
  return best ? { x: best.x, z: best.z } : p;
}

/* Rectángulo: redondea ancho y fondo (cada eje desde p1) a múltiplos de 10 cm. */
function _snapRectCorner(p1w, p2w) {
  if (_altDown) return p2w;
  const snapAxis = (from, to) => from + Math.round((to - from) / LENGTH_SNAP_M) * LENGTH_SNAP_M;
  return { x: snapAxis(p1w.wx, p2w.x), z: snapAxis(p1w.wz, p2w.z) };
}

/* Reúne todos los extremos de pared como puntos candidatos de alineación.
   No incluye _p1: alinear con el propio inicio ya lo cubre el snap angular y
   dibujaría una guía solapada sobre la línea en curso. */
function _collectGuideAnchors() {
  const anchors = [];
  for (const s of _segs) { anchors.push(s.p1, s.p2); }
  return anchors;
}

/* Smart guide: si el punto se alinea (eje X o Z) con el extremo de una pared
   existente dentro de la tolerancia, engancha esa coordenada y devuelve las
   guías a dibujar. Devuelve { x, z, guides:[{axis,coord,anchor}] }. */
function _applySmartGuide(p) {
  if (_altDown) return { x: p.x, z: p.z, guides: [] };
  const anchors = _collectGuideAnchors();
  if (!anchors.length) return { x: p.x, z: p.z, guides: [] };

  let bestX = null, bestXd = GUIDE_SNAP_M;
  let bestZ = null, bestZd = GUIDE_SNAP_M;
  for (const a of anchors) {
    const dX = Math.abs(p.x - a.x);
    if (dX < bestXd) { bestXd = dX; bestX = a; }
    const dZ = Math.abs(p.z - a.z);
    if (dZ < bestZd) { bestZd = dZ; bestZ = a; }
  }

  const out = { x: p.x, z: p.z, guides: [] };
  if (bestX) { out.x = bestX.x; out.guides.push({ axis: 'x', coord: bestX.x, anchor: bestX }); }
  if (bestZ) { out.z = bestZ.z; out.guides.push({ axis: 'z', coord: bestZ.z, anchor: bestZ }); }
  return out;
}

/* ─── Canvas 2D ──────────────────────────────────────────────────────────── */
function _redrawCanvas() {
  if (!_ctx || !_cvs) return;
  _ctx.clearRect(0, 0, _cvs.width, _cvs.height);

  for (let i = 0; i < _segs.length; i++) {
    const seg = _segs[i];
    const s1 = _worldToScreen(seg.p1.x, seg.p1.z);
    const s2 = _worldToScreen(seg.p2.x, seg.p2.z);
    const isSelected = _tool === 'select' && i === _ctxSegIdx;
    const strokeColor = isSelected ? '#2563eb' : seg.color;
    const strokeW = isSelected ? 3.5 : 2.5;
    if (_isCurved(seg)) {
      _drawSegArc(seg, strokeColor, strokeW);
    } else {
      _drawSegLine(s1, s2, strokeColor, strokeW);
    }
    _drawDoors(seg);
    _drawDot(s1, seg.color);
    _drawDot(s2, seg.color);
    // Tirador de curvatura para el segmento seleccionado en modo selección
    if (isSelected) _drawCurveHandle(seg);
  }

  if (_guideState) {
    const { p1s, p2s, isRect, snapPt, guides } = _guideState;
    _drawSmartGuides(guides, p2s);
    _drawGuide(p1s, p2s, isRect, snapPt);
  }
}

/* Dibuja las líneas de alineación (smart guides) tipo Figma/AutoCAD: una línea
   magenta punteada que va del extremo de referencia al punto en curso. */
function _drawSmartGuides(guides, p2s) {
  if (!guides || !guides.length || !p2s) return;
  _ctx.save();
  _ctx.strokeStyle = '#e0218a';
  _ctx.fillStyle   = '#e0218a';
  _ctx.lineWidth   = 1.25;
  _ctx.setLineDash([5, 4]);
  for (const g of guides) {
    const a = g.anchorS;
    if (!a) continue;
    _ctx.beginPath();
    _ctx.moveTo(a.x, a.y);
    _ctx.lineTo(p2s.x, p2s.y);
    _ctx.stroke();
    // Marcador en el extremo de referencia
    _ctx.setLineDash([]);
    _ctx.beginPath(); _ctx.arc(a.x, a.y, 3.5, 0, Math.PI*2); _ctx.fill();
    _ctx.setLineDash([5, 4]);
  }
  _ctx.restore();
}

function _drawSegLine(s1, s2, color, lineWidth = 2.5) {
  _ctx.save();
  _ctx.strokeStyle = color || '#1a1a2c';
  _ctx.lineWidth   = lineWidth;
  _ctx.lineCap     = 'round';
  _ctx.setLineDash([]);
  _ctx.beginPath();
  _ctx.moveTo(s1.x, s1.y);
  _ctx.lineTo(s2.x, s2.y);
  _ctx.stroke();
  _ctx.restore();
}

// Dibuja un segmento curvo como Bézier cuadrática en pantalla.
function _drawSegArc(seg, color, lineWidth = 2.5) {
  const s1 = _worldToScreen(seg.p1.x, seg.p1.z);
  const s2 = _worldToScreen(seg.p2.x, seg.p2.z);
  const c  = _curveControlPoint(seg);
  const cs = _worldToScreen(c.x, c.z);
  _ctx.save();
  _ctx.strokeStyle = color || '#1a1a2c';
  _ctx.lineWidth   = lineWidth;
  _ctx.lineCap     = 'round';
  _ctx.setLineDash([]);
  _ctx.beginPath();
  _ctx.moveTo(s1.x, s1.y);
  _ctx.quadraticCurveTo(cs.x, cs.y, s2.x, s2.y);
  _ctx.stroke();
  _ctx.restore();
}

// Tirador arrastrable en el medio del arco para ajustar la curvatura.
function _drawCurveHandle(seg) {
  const mid = _curveMidPoint(seg);
  const ms  = _worldToScreen(mid.x, mid.z);
  // Línea de referencia desde el medio de la recta hasta el tirador
  const lineMid = _worldToScreen((seg.p1.x + seg.p2.x) / 2, (seg.p1.z + seg.p2.z) / 2);
  _ctx.save();
  _ctx.strokeStyle = 'rgba(37,99,235,0.45)';
  _ctx.lineWidth = 1;
  _ctx.setLineDash([3, 3]);
  _ctx.beginPath(); _ctx.moveTo(lineMid.x, lineMid.y); _ctx.lineTo(ms.x, ms.y); _ctx.stroke();
  _ctx.setLineDash([]);
  // Tirador
  _ctx.fillStyle = '#fff';
  _ctx.strokeStyle = '#2563eb';
  _ctx.lineWidth = 2;
  _ctx.beginPath(); _ctx.arc(ms.x, ms.y, CURVE_HANDLE_PX, 0, Math.PI*2);
  _ctx.fill(); _ctx.stroke();
  _ctx.restore();
}

// Dibuja los huecos de puerta de un segmento: borra el trazo y marca las jambas.
function _drawDoors(seg) {
  const doors = _normalizeDoors(seg.doors);
  if (!doors.length) return;
  const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
  const ptAt = t => _worldToScreen(seg.p1.x + dx * t, seg.p1.z + dz * t);
  for (const d of doors) {
    const a = ptAt(d.t1), b = ptAt(d.t2);
    // Borrar el trazo de la pared en el hueco
    _ctx.save();
    _ctx.strokeStyle = '#ffffff';
    _ctx.lineWidth = 6;
    _ctx.lineCap = 'butt';
    _ctx.beginPath(); _ctx.moveTo(a.x, a.y); _ctx.lineTo(b.x, b.y); _ctx.stroke();
    // Jambas
    _ctx.strokeStyle = '#16a34a';
    _ctx.lineWidth = 2.5;
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
    const jx = Math.cos(ang) * 6, jy = Math.sin(ang) * 6;
    [a, b].forEach(p => { _ctx.beginPath(); _ctx.moveTo(p.x - jx, p.y - jy); _ctx.lineTo(p.x + jx, p.y + jy); _ctx.stroke(); });
    _ctx.restore();
  }
}

function _drawDot(s, color) {
  _ctx.save();
  _ctx.fillStyle = color || '#1a1a2c';
  _ctx.beginPath();
  _ctx.arc(s.x, s.y, 4, 0, Math.PI*2);
  _ctx.fill();
  _ctx.restore();
}

function _drawGuide(p1s, p2s, isRect, snapPt) {
  _ctx.save();
  _ctx.strokeStyle = '#2563eb';
  _ctx.lineWidth   = 1.5;
  _ctx.setLineDash([6, 4]);
  _ctx.lineCap     = 'round';
  if (isRect) {
    _ctx.strokeRect(
      Math.min(p1s.x, p2s.x), Math.min(p1s.y, p2s.y),
      Math.abs(p2s.x - p1s.x), Math.abs(p2s.y - p1s.y)
    );
  } else {
    _ctx.beginPath(); _ctx.moveTo(p1s.x, p1s.y); _ctx.lineTo(p2s.x, p2s.y); _ctx.stroke();
  }
  _ctx.restore();

  _ctx.save();
  _ctx.fillStyle = '#2563eb';
  _ctx.beginPath(); _ctx.arc(p1s.x, p1s.y, 5, 0, Math.PI*2); _ctx.fill();
  _ctx.restore();

  if (snapPt) {
    _ctx.save();
    _ctx.strokeStyle = '#2563eb'; _ctx.lineWidth = 1.5; _ctx.setLineDash([]);
    _ctx.beginPath(); _ctx.arc(snapPt.x, snapPt.y, 7, 0, Math.PI*2); _ctx.stroke();
    _ctx.restore();
  }
}

/* ─── Tooltip ────────────────────────────────────────────────────────────── */
function _showConfirmToast(msg) {
  const el = document.createElement('div');
  el.textContent = '✓ ' + msg;
  el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;font-family:"JetBrains Mono",monospace;font-size:12px;padding:8px 20px;border-radius:20px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.3);opacity:1;transition:opacity 0.4s';
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 1800);
}

function _showTooltip(text, sx, sy) {
  const el = document.getElementById('wall-painter-tooltip');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  el.style.left = `${sx + 14}px`;
  el.style.top  = `${sy - 10}px`;
}
function _hideTooltip() {
  const el = document.getElementById('wall-painter-tooltip');
  if (el) el.style.display = 'none';
}

/* ─── Segmentos 2D ───────────────────────────────────────────────────────── */
function _addSeg(p1, p2) {
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const len = Math.sqrt(dx*dx + dz*dz);
  if (len < 0.05) return;

  const seg = { p1: {x: p1.x, z: p1.z}, p2: {x: p2.x, z: p2.z}, len, color: _wallColor, doors: [] };
  _segs.push(seg);

  const labelEl = document.createElement('div');
  labelEl.className = 'wall-label';
  labelEl.textContent = `${len.toFixed(2)} m`;
  labelEl.style.cssText = `
    position:absolute;transform:translate(-50%,-50%);
    background:rgba(10,10,11,0.78);color:#fff;
    font-family:'JetBrains Mono',monospace;font-size:10px;
    padding:2px 8px;border-radius:4px;
    white-space:nowrap;user-select:none;pointer-events:none;
  `;
  _labelContainer?.appendChild(labelEl);
  _labels.push({ el: labelEl, seg });
}

/* ─── Transformar ────────────────────────────────────────────────────────── */
function _transform() {
  _meshes.forEach(m => {
    SceneManager.scene.remove(m);
    m.geometry.dispose(); m.material.dispose();
  });
  _meshes = [];

  for (let i = 0; i < _segs.length; i++) {
    _buildWallMesh(_segs[i].p1, _segs[i].p2, _segs[i].color, i, _segs[i].doors, _segs[i]);
  }
}

// Normaliza la lista de puertas: clampa a [0,1], ordena y descarta vacías.
function _normalizeDoors(doors) {
  return (doors || [])
    .map(d => ({ t1: Math.max(0, Math.min(1, Math.min(d.t1, d.t2))), t2: Math.max(0, Math.min(1, Math.max(d.t1, d.t2))) }))
    .filter(d => d.t2 - d.t1 > 0.005)
    .sort((a, b) => a.t1 - b.t1);
}

function _buildWallMesh(p1, p2, color, segIdx = -1, doors = [], seg = null) {
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const len = Math.sqrt(dx*dx + dz*dz);
  if (len < 0.05) return;
  const doorH = Math.min(DOOR_HEIGHT_M, _wallHeight);
  const mat0 = () => new THREE.MeshStandardMaterial({ color: color || _wallColor, roughness: 0.85, metalness: 0 });
  const pushMesh = (mesh) => {
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.isWall = true;
    mesh.userData.segIdx = segIdx;
    SceneManager.scene.add(mesh);
    _meshes.push(mesh);
  };

  // ── Pared curva: serie de tramos rectos cortos a lo largo del arco ──
  if (seg && _isCurved(seg)) {
    const N = Math.max(10, Math.ceil(len / 0.25));
    const samples = _sampleCurve(seg, N);
    const ds = _normalizeDoors(doors);
    const inDoor = t => ds.some(d => t > d.t1 && t < d.t2);
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1];
      const tMid = (i + 0.5) / (samples.length - 1);
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      if (segLen < 0.001) continue;
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
      const overlap = 0.02; // solapamiento para evitar huecos entre tramos
      if (!inDoor(tMid)) {
        // Tramo a altura completa
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, _wallHeight, segLen + overlap), mat0());
        mesh.position.set(cx, _wallHeight / 2, cz);
        mesh.rotation.y = ang;
        pushMesh(mesh);
      } else if (_wallHeight > doorH + 0.02) {
        // Dintel sobre la puerta
        const h = _wallHeight - doorH;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, h, segLen + overlap), mat0());
        mesh.position.set(cx, doorH + h / 2, cz);
        mesh.rotation.y = ang;
        pushMesh(mesh);
      }
    }
    return;
  }

  // ── Pared recta ──
  const angle = Math.atan2(dx, dz);
  const addPiece = (ta, tb, yBottom, yTop) => {
    const pieceLen = (tb - ta) * len;
    if (pieceLen < 0.02 || yTop - yBottom < 0.02) return;
    const midt = (ta + tb) / 2;
    const cx = p1.x + dx * midt, cz = p1.z + dz * midt;
    const h  = yTop - yBottom;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, h, pieceLen), mat0());
    mesh.position.set(cx, yBottom + h / 2, cz);
    mesh.rotation.y = angle;
    pushMesh(mesh);
  };

  const ds = _normalizeDoors(doors);
  let cursor = 0;
  for (const d of ds) { addPiece(cursor, d.t1, 0, _wallHeight); cursor = d.t2; }
  addPiece(cursor, 1, 0, _wallHeight);
  if (_wallHeight > doorH + 0.02) for (const d of ds) addPiece(d.t1, d.t2, doorH, _wallHeight);
}

// Reconstruye las mallas 3D de un solo segmento (si ya están transformadas).
function _rebuildSegMeshes(idx) {
  if (idx < 0 || idx >= _segs.length) return;
  const had = _meshes.some(m => m.userData.segIdx === idx);
  if (!had) return;  // aún en 2D, las puertas se aplicarán al transformar
  for (let i = _meshes.length - 1; i >= 0; i--) {
    if (_meshes[i].userData.segIdx !== idx) continue;
    const m = _meshes[i];
    SceneManager.scene.remove(m); m.geometry.dispose(); m.material.dispose();
    _meshes.splice(i, 1);
  }
  const seg = _segs[idx];
  _buildWallMesh(seg.p1, seg.p2, seg.color, idx, seg.doors, seg);
}

/* ─── Menú contextual de segmento 2D (modo Selección) ───────────────────── */
const SEG_PICK_PX = 10; // píxeles de tolerancia para seleccionar segmento

function _distToScreenSeg(sx, sy, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx*dx + dy*dy;
  if (len2 < 0.01) return Math.hypot(sx - a.x, sy - a.y);
  const t = Math.max(0, Math.min(1, ((sx-a.x)*dx + (sy-a.y)*dy) / len2));
  return Math.hypot(sx - (a.x+t*dx), sy - (a.y+t*dy));
}

function _pickSegIdx(sx, sy) {
  let best = -1, bestDist = SEG_PICK_PX;
  for (let i = 0; i < _segs.length; i++) {
    const seg = _segs[i];
    let dist;
    if (_isCurved(seg)) {
      // Muestrear el arco y medir la mínima distancia a sus tramos en pantalla.
      const pts = _sampleCurve(seg, 16).map(p => _worldToScreen(p.x, p.z));
      dist = Infinity;
      for (let k = 0; k < pts.length - 1; k++) {
        dist = Math.min(dist, _distToScreenSeg(sx, sy, pts[k], pts[k+1]));
      }
    } else {
      const s1 = _worldToScreen(seg.p1.x, seg.p1.z);
      const s2 = _worldToScreen(seg.p2.x, seg.p2.z);
      dist = _distToScreenSeg(sx, sy, s1, s2);
    }
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

function _openSegMenu(idx, sx, sy) {
  _ctxSegIdx = idx;
  const menu = document.getElementById('wp-seg-menu');
  if (!menu) { _redrawCanvas(); return; }
  const seg = _segs[idx];
  const colorEl = document.getElementById('wp-seg-color');
  if (colorEl) colorEl.value = seg.color || '#1a1a2c';
  const toggleEl = document.getElementById('wp-seg-toggle-label');
  if (toggleEl) toggleEl.textContent = seg.labelHidden ? 'Mostrar medida' : 'Ocultar medida';
  const curveEl = document.getElementById('wp-seg-curve');
  if (curveEl) curveEl.textContent = _isCurved(seg) ? 'Quitar curva' : 'Convertir en curva';
  menu.style.display = 'block';
  const mw = 180, mh = 160;
  menu.style.left = `${Math.min(sx, window.innerWidth - mw)}px`;
  menu.style.top  = `${Math.min(sy, window.innerHeight - mh)}px`;
  _redrawCanvas();   // muestra el tirador del segmento seleccionado
}

// Oculta solo el menú DOM (conserva la selección y el tirador).
function _closeSegMenu() {
  const menu = document.getElementById('wp-seg-menu');
  if (menu) menu.style.display = 'none';
}

// Limpia la selección de segmento (oculta menú y tirador).
function _clearSegSelection() {
  _closeSegMenu();
  if (_ctxSegIdx !== -1) { _ctxSegIdx = -1; _redrawCanvas(); }
}

/* ─── Curvatura de pared ─────────────────────────────────────────────────────
   seg.curve = desviación perpendicular (m) del punto medio del arco respecto a la
   recta p1→p2. 0 = recta. Modelamos el arco con una Bézier cuadrática cuyo punto
   de control está a 2*curve, de modo que el medio del arco queda exactamente a
   `curve` de la recta. */
function _isCurved(seg) {
  return seg && typeof seg.curve === 'number' && Math.abs(seg.curve) > 0.01;
}

// Punto de control (mundo) de la Bézier cuadrática del segmento curvo.
function _curveControlPoint(seg) {
  const mx = (seg.p1.x + seg.p2.x) / 2, mz = (seg.p1.z + seg.p2.z) / 2;
  const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
  const len = Math.hypot(dx, dz) || 1;
  // Normal unitaria (perpendicular)
  const nx = -dz / len, nz = dx / len;
  return { x: mx + nx * 2 * (seg.curve || 0), z: mz + nz * 2 * (seg.curve || 0) };
}

// Punto medio del arco (mundo) — donde se dibuja el tirador.
function _curveMidPoint(seg) {
  const mx = (seg.p1.x + seg.p2.x) / 2, mz = (seg.p1.z + seg.p2.z) / 2;
  const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  return { x: mx + nx * (seg.curve || 0), z: mz + nz * (seg.curve || 0) };
}

// Muestra `n+1` puntos del arco cuadrático en coordenadas de mundo.
function _sampleCurve(seg, n = 24) {
  const c = _curveControlPoint(seg);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push({
      x: u*u*seg.p1.x + 2*u*t*c.x + t*t*seg.p2.x,
      z: u*u*seg.p1.z + 2*u*t*c.z + t*t*seg.p2.z
    });
  }
  return pts;
}

/* ─── Puertas (cortar pared en 2 puntos) ─────────────────────────────────── */
// Proyecta un punto del mundo sobre el segmento → fracción t en [0,1].
function _projectToSeg(seg, wx, wz) {
  const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
  const len2 = dx*dx + dz*dz;
  if (len2 < 1e-6) return 0;
  const t = ((wx - seg.p1.x)*dx + (wz - seg.p1.z)*dz) / len2;
  return Math.max(0, Math.min(1, t));
}

function _startDoorMode(idx) {
  if (idx < 0 || idx >= _segs.length) return;
  _closeSegMenu();
  _doorMode = { segIdx: idx, clicks: [] };
  if (_cvs) _cvs.style.cursor = 'crosshair';
  _showConfirmToast('Marca el inicio de la puerta');
}

function _cancelDoorMode() {
  _doorMode = null;
}

function _handleDoorClick(worldPos) {
  const seg = _segs[_doorMode.segIdx];
  if (!seg) { _cancelDoorMode(); return; }
  const t = _projectToSeg(seg, worldPos.x, worldPos.z);
  _doorMode.clicks.push(t);
  if (_doorMode.clicks.length < 2) {
    _showConfirmToast('Marca el fin de la puerta');
    return;
  }
  const [t1, t2] = _doorMode.clicks.sort((a, b) => a - b);
  const idx = _doorMode.segIdx;
  _cancelDoorMode();
  if (t2 - t1 < 0.01) { _showConfirmToast('Puerta demasiado pequeña'); return; }
  seg.doors = seg.doors || [];
  seg.doors.push({ t1, t2 });
  _rebuildSegMeshes(idx);
  _showConfirmToast(`Puerta de ${((t2 - t1) * seg.len).toFixed(2)} m`);
}

/* ─── Menú contextual (meshes transformados) ─────────────────────────────── */
function _pickSeg(sx, sy) {
  const cam = SceneManager.activeCam;
  if (!cam || !_meshes.length) return null;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(
    new THREE.Vector2((sx / window.innerWidth)*2-1, -(sy / window.innerHeight)*2+1),
    cam
  );
  const hits = raycaster.intersectObjects(_meshes);
  return hits.length ? hits[0].object : null;
}

function _ensureGlobalContextMenu() {
  if (_globalContextMenuBound) return;
  _globalContextMenuBound = true;
  const canvas = document.getElementById('scene-canvas');
  if (!canvas) return;

  canvas.addEventListener('pointerdown', e => {
    if (_active || e.button !== 0 || !_meshes.length) return;
    const hit = _pickSeg(e.clientX, e.clientY);
    if (!hit) { _globalDownSeg = null; _globalDownPos = null; return; }
    e.stopPropagation();
    _globalDownSeg = hit;
    _globalDownPos = { x: e.clientX, y: e.clientY };
  }, true);

  canvas.addEventListener('pointerup', e => {
    if (_active || e.button !== 0) return;
    const hit = _globalDownSeg, down = _globalDownPos;
    _globalDownSeg = null; _globalDownPos = null;
    if (!hit || !down) { _closeCtxMenu(); return; }
    if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 5) return;
    e.stopPropagation();
    _openCtxMenuForMesh(hit, e.clientX, e.clientY);
  }, true);

  document.addEventListener('pointerdown', e => {
    const menu = document.getElementById('wall-ctx-menu');
    if (menu && menu.style.display !== 'none' && !menu.contains(e.target)) _closeCtxMenu();
  });
}

function _openCtxMenuForMesh(mesh, sx, sy) {
  _ctxSeg = mesh;
  const menu = document.getElementById('wall-ctx-menu');
  if (!menu) return;
  const colorPicker = document.getElementById('wall-ctx-color');
  if (colorPicker) colorPicker.value = '#' + mesh.material.color.getHexString();
  const flattenBtn = document.getElementById('wall-ctx-flatten');
  if (flattenBtn) {
    const isFlat = (mesh.geometry.parameters?.height ?? 99) <= 0.11;
    flattenBtn.textContent = isFlat ? 'Pared 2D · ON' : 'Pared 2D · OFF';
  }
  menu.style.display = 'block';
  const menuW = 200, menuH = 160;
  menu.style.left = `${Math.min(sx, window.innerWidth - menuW)}px`;
  menu.style.top  = `${Math.min(sy, window.innerHeight - menuH)}px`;
}

function _closeCtxMenu() {
  const menu = document.getElementById('wall-ctx-menu');
  if (menu) menu.style.display = 'none';
  _ctxSeg = null;
}

// ¿El punto de pantalla cae sobre el tirador de curvatura del segmento seleccionado?
function _hitCurveHandle(sx, sy) {
  if (_tool !== 'select' || _ctxSegIdx < 0) return false;
  const seg = _segs[_ctxSegIdx];
  if (!seg) return false;
  const mid = _curveMidPoint(seg);
  const ms = _worldToScreen(mid.x, mid.z);
  return Math.hypot(sx - ms.x, sy - ms.y) <= CURVE_HANDLE_PX + 5;
}

// Recalcula seg.curve a partir de la posición del cursor (proyección sobre la normal).
function _updateCurveFromCursor(seg, wx, wz) {
  const mx = (seg.p1.x + seg.p2.x) / 2, mz = (seg.p1.z + seg.p2.z) / 2;
  const dx = seg.p2.x - seg.p1.x, dz = seg.p2.z - seg.p1.z;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len;
  let curve = (wx - mx) * nx + (wz - mz) * nz;   // proyección sobre la normal
  if (!_altDown) curve = Math.round(curve / 0.1) * 0.1;  // snap 10 cm (Alt = libre)
  seg.curve = curve;
}

/* ─── Canvas resize ──────────────────────────────────────────────────────── */
function _resizeCanvas() {
  if (!_cvs) return;
  _cvs.width  = window.innerWidth;
  _cvs.height = window.innerHeight;
}

/* ─── Input handlers ─────────────────────────────────────────────────────── */
function _onKeyDown(e) {
  if (!_active) return;
  if (e.key === 'Shift') { _shiftDown = true; return; }
  if (e.key === 'Alt')   { _altDown   = true; return; }
  if (e.key === 'Escape') {
    if (_doorMode) { _cancelDoorMode(); _showConfirmToast('Puerta cancelada'); return; }
    _cancelDrawing(); return;
  }
  if (e.key === 'l' || e.key === 'L') _setTool('line');
  if (e.key === 'r' || e.key === 'R') _setTool('rect');
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault(); _undoLast();
  }
}
function _onKeyUp(e) {
  if (e.key === 'Shift') _shiftDown = false;
  if (e.key === 'Alt')   _altDown   = false;
}

function _forwardToScene(e) {
  document.getElementById('scene-canvas')?.dispatchEvent(new PointerEvent(e.type, e));
}

function _onPointerDown(e) {
  if (!_active) return;
  if (e.button === 2) return;
  // Ignorar clicks en botones/inputs de la toolbar
  if (e.target !== _cvs) return;
  // Arrastre del tirador de curvatura (tiene prioridad sobre todo lo demás)
  if (_hitCurveHandle(e.clientX, e.clientY)) {
    _curveDrag = { segIdx: _ctxSegIdx };
    _closeSegMenu();
    e.preventDefault();
    return;
  }
  _downPos = { x: e.clientX, y: e.clientY };
  _isDragging = false;
  _forwardToScene(e);
}

function _onPointerUp(e) {
  if (!_active) return;
  if (e.button === 2) return;

  // Fin del arrastre del tirador de curvatura
  if (_curveDrag) {
    const idx = _curveDrag.segIdx;
    _curveDrag = null;
    _hideTooltip();
    _rebuildSegMeshes(idx);   // refleja la curva en 3D si ya está transformado
    _redrawCanvas();
    // Reabrir el menú del segmento para seguir editándolo
    if (idx >= 0) _ctxSegIdx = idx;
    return;
  }

  if (e.target !== _cvs) return;

  if (_isDragging) {
    _forwardToScene(e);
    _downPos = null; _isDragging = false;
    return;
  }

  if (!_downPos) return;
  const moved = Math.abs(e.clientX - _downPos.x) + Math.abs(e.clientY - _downPos.y);
  _downPos = null;
  if (moved > 5) return;

  if (_doorMode) {
    const wp = _screenToWorld(e.clientX, e.clientY);
    if (wp) _handleDoorClick(wp);
    return;
  }

  _closeCtxMenu();
  _closeSegMenu();

  const worldPos = _screenToWorld(e.clientX, e.clientY);
  if (!worldPos) return;

  // Modo selección: pick de segmento 2D
  if (_tool === 'select') {
    const idx = _pickSegIdx(e.clientX, e.clientY);
    if (idx >= 0) _openSegMenu(idx, e.clientX, e.clientY);
    else _clearSegSelection();
    return;
  }

  if (!_drawing) {
    const raw1 = { x: worldPos.x, z: worldPos.z };
    const p1w  = _tool === 'rect' ? raw1 : _applyEndpointSnap(raw1);
    _drawing  = true;
    _p1       = { wx: p1w.x, wz: p1w.z };
    _p1Screen = { x: e.clientX, y: e.clientY };
    if (_tool === 'line') _showDistInput(e.clientX, e.clientY);
  } else {
    const raw2     = { x: worldPos.x, z: worldPos.z };
    let p2w;
    if (_tool === 'rect') {
      const r = _snapRectCorner(_p1, raw2);
      const g = _applySmartGuide(r);
      p2w = { x: g.x, z: g.z };
    } else {
      p2w = _resolveLinePoint(raw2).point;
    }

    if (_tool === 'rect') {
      _addSeg({ x: _p1.wx, z: _p1.wz }, { x: p2w.x,  z: _p1.wz });
      _addSeg({ x: p2w.x,  z: _p1.wz }, { x: p2w.x,  z: p2w.z  });
      _addSeg({ x: p2w.x,  z: p2w.z  }, { x: _p1.wx, z: p2w.z  });
      _addSeg({ x: _p1.wx, z: p2w.z  }, { x: _p1.wx, z: _p1.wz });
      _cancelDrawing();
    } else {
      _hideDistInput();
      _addSeg({ x: _p1.wx, z: _p1.wz }, p2w);
      _p1       = { wx: p2w.x, wz: p2w.z };
      _p1Screen = { x: e.clientX, y: e.clientY };
      _guideState = null;
      if (_tool === 'line') _showDistInput(e.clientX, e.clientY);
    }
  }
}

function _onPointerMove(e) {
  if (!_active) return;
  _cursorScreen = { x: e.clientX, y: e.clientY };

  // Arrastrando el tirador de curvatura
  if (_curveDrag) {
    const wp = _screenToWorld(e.clientX, e.clientY);
    const seg = _segs[_curveDrag.segIdx];
    if (wp && seg) {
      _updateCurveFromCursor(seg, wp.x, wp.z);
      _redrawCanvas();
      _showTooltip(`Curva: ${(seg.curve || 0).toFixed(2)} m`, e.clientX, e.clientY);
    }
    if (_cvs) _cvs.style.cursor = 'grabbing';
    return;
  }

  if (_downPos) {
    const moved = Math.abs(e.clientX - _downPos.x) + Math.abs(e.clientY - _downPos.y);
    if (moved > 4) {
      _isDragging = true;
      _forwardToScene(e);
      return;
    }
  }

  if (_cvs) {
    if (_doorMode) {
      _cvs.style.cursor = 'crosshair';
    } else if (_hitCurveHandle(e.clientX, e.clientY)) {
      _cvs.style.cursor = 'grab';
    } else if (_tool === 'select') {
      const idx = _pickSegIdx(e.clientX, e.clientY);
      _cvs.style.cursor = idx >= 0 ? 'pointer' : 'default';
    } else {
      _cvs.style.cursor = 'crosshair';
    }
  }

  const worldPos = _screenToWorld(e.clientX, e.clientY);
  if (!worldPos) return;

  if (!_drawing || !_p1) { _hideTooltip(); return; }

  _p1Screen = _worldToScreen(_p1.wx, _p1.wz);

  const raw       = { x: worldPos.x, z: worldPos.z };
  let p2w, p2s, isSnapped, guides = [];
  if (_tool === 'rect') {
    const r = _snapRectCorner(_p1, raw);
    const g = _applySmartGuide(r);
    p2w = { x: g.x, z: g.z };
    guides = g.guides;
    isSnapped = !_altDown;
    p2s = _worldToScreen(p2w.x, p2w.z);
  } else {
    const resolved = _resolveLinePoint(raw);
    p2w = resolved.point;
    guides = resolved.guides;
    isSnapped = resolved.snapped;
    p2s = isSnapped ? _worldToScreen(p2w.x, p2w.z) : { x: e.clientX, y: e.clientY };
  }

  _guideState = {
    p1s: _p1Screen, p2s, isRect: _tool === 'rect',
    snapPt: isSnapped ? p2s : null,
    guides: _guidesToScreen(guides)
  };

  const dx = p2w.x - _p1.wx, dz = p2w.z - _p1.wz;
  if (_tool === 'line') {
    _showTooltip(`${Math.sqrt(dx*dx+dz*dz).toFixed(2)} m`, e.clientX, e.clientY);
  } else {
    _showTooltip(`Ancho: ${Math.abs(dx).toFixed(2)} m | Fondo: ${Math.abs(dz).toFixed(2)} m`, e.clientX, e.clientY);
  }
}

/* Resuelve el segundo punto de una línea: snap a extremo exacto > smart guide de
   alineación > snap angular+longitud. Devuelve { point, guides, snapped }. */
function _resolveLinePoint(raw) {
  // 1) Snap a extremo exacto (engancha al vértice). Tiene prioridad.
  const ep = !_altDown ? _applyEndpointSnap(raw) : raw;
  if (ep.x !== raw.x || ep.z !== raw.z) {
    return { point: ep, guides: [], snapped: true };
  }
  // 2) Smart guide de alineación con extremos (eje X / Z).
  const sg = _applySmartGuide(raw);
  if (sg.guides.length) {
    const hasX = sg.guides.some(g => g.axis === 'x');
    const hasZ = sg.guides.some(g => g.axis === 'z');
    // Eje alineado → coordenada del extremo. Eje libre → cursor con snap de longitud.
    const snapLen = v => (_altDown ? v : Math.round(v / LENGTH_SNAP_M) * LENGTH_SNAP_M);
    const point = {
      x: hasX ? sg.x : snapLen(raw.x),
      z: hasZ ? sg.z : snapLen(raw.z)
    };
    return { point, guides: sg.guides, snapped: true };
  }
  // 3) Snap angular + longitud clásico.
  return { point: _applyAngleSnap(_p1, raw), guides: [], snapped: false };
}

/* Convierte guías (mundo) a coordenadas de pantalla para dibujarlas. */
function _guidesToScreen(guides) {
  if (!guides || !guides.length) return [];
  return guides.map(g => ({
    axis: g.axis,
    anchorS: _worldToScreen(g.anchor.x, g.anchor.z)
  }));
}

function _onWheel(e) {
  if (!_active) return;
  document.getElementById('scene-canvas')?.dispatchEvent(new WheelEvent('wheel', e));
}

function _onContextMenu(e) {
  if (!_active) return;
  e.preventDefault(); e.stopPropagation();
  if (_drawing) { _cancelDrawing(); return; }
  if (_tool === 'line' || _tool === 'rect') _setTool('select');
}

/* ─── Input distancia directa ────────────────────────────────────────────── */
function _showDistInput(sx, sy) {
  const wrap = document.getElementById('wp-dist-input-wrap');
  const input = document.getElementById('wp-dist-input');
  if (!wrap || !input) return;
  wrap.style.display = 'flex';
  wrap.style.left = `${sx}px`;
  wrap.style.top  = `${sy}px`;
  input.value = '';
  setTimeout(() => input.focus(), 50);
}
function _hideDistInput() {
  const wrap = document.getElementById('wp-dist-input-wrap');
  if (wrap) wrap.style.display = 'none';
}
function _confirmDistInput() {
  const input = document.getElementById('wp-dist-input');
  const dist  = parseFloat(input?.value);
  _hideDistInput();
  if (!_drawing || !_p1 || isNaN(dist) || dist <= 0) return;
  const worldCursor = _screenToWorld(_cursorScreen.x, _cursorScreen.y);
  const dx = worldCursor ? worldCursor.x - _p1.wx : 1;
  const dz = worldCursor ? worldCursor.z - _p1.wz : 0;
  let angle = Math.atan2(dz, dx);
  if (!_shiftDown) angle = Math.round(angle / ANGLE_SNAP_RAD) * ANGLE_SNAP_RAD;
  const p2w = { x: _p1.wx + dist * Math.cos(angle), z: _p1.wz + dist * Math.sin(angle) };
  _addSeg({ x: _p1.wx, z: _p1.wz }, p2w);
  _p1 = { wx: p2w.x, wz: p2w.z };
  _p1Screen = _worldToScreen(p2w.x, p2w.z);
  _showDistInput(_p1Screen.x, _p1Screen.y);
}

/* ─── Utilidades ─────────────────────────────────────────────────────────── */
function _cancelDrawing() {
  _drawing  = false;
  _p1 = null; _p1Screen = null;
  _guideState = null;
  _cancelDoorMode();
  _hideTooltip(); _hideDistInput();
  _closeSegMenu();
}

function _undoLast() {
  if (_segs.length === 0) return;
  _segs.pop();
  const lbl = _labels.pop();
  lbl?.el.remove();
}

function _clearAll() {
  _segs = []; _labels.forEach(l => l.el.remove()); _labels = [];
  _meshes.forEach(m => { SceneManager.scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
  _meshes = [];
  _cancelDrawing();
}

function _setTool(tool) {
  _tool = tool;
  _cancelDrawing();
  _clearSegSelection();
  document.getElementById('wp-tool-select')?.classList.toggle('wp-tool-active', tool === 'select');
  document.getElementById('wp-tool-line')?.classList.toggle('wp-tool-active', tool === 'line');
  document.getElementById('wp-tool-rect')?.classList.toggle('wp-tool-active', tool === 'rect');
  _cvs && (_cvs.style.cursor = tool === 'select' ? 'default' : 'crosshair');
}

/* ─── Activar / desactivar ───────────────────────────────────────────────── */
let _listenersInit = false;

function _initListeners() {
  if (_listenersInit) return;
  _listenersInit = true;

  document.getElementById('wp-tool-select')?.addEventListener('click', () => _setTool('select'));
  document.getElementById('wp-tool-line')?.addEventListener('click', () => _setTool('line'));
  document.getElementById('wp-tool-rect')?.addEventListener('click', () => _setTool('rect'));
  document.getElementById('wp-undo')?.addEventListener('click', _undoLast);
  document.getElementById('wp-clear')?.addEventListener('click', _clearAll);
  document.getElementById('wp-transform')?.addEventListener('click', () => {
    _transform();
    _showConfirmToast('Plano generado en 3D');
    deactivate();
  });
  document.getElementById('wp-finish-2d')?.addEventListener('click', () => {
    const prev = _wallHeight;
    _wallHeight = 0.05;
    _transform();
    _wallHeight = prev;
    _showConfirmToast('Plano generado en 2D');
    deactivate();
  });
  document.getElementById('wp-cancel')?.addEventListener('click', () => deactivate());

  document.getElementById('wp-wall-height')?.addEventListener('input', e => {
    _wallHeight = parseFloat(e.target.value) || 2.5;
  });

  const colorInput   = document.getElementById('wp-wall-color');
  const colorPreview = document.getElementById('wp-color-preview');
  document.getElementById('wp-color-preview')?.addEventListener('click', () => colorInput?.click());
  colorInput?.addEventListener('input', e => {
    _wallColor = e.target.value;
    if (colorPreview) colorPreview.style.background = _wallColor;
  });

  document.getElementById('wp-toggle-cotas')?.addEventListener('click', () => {
    AppState.showCotas = !AppState.showCotas;
    SceneManager.redrawCotas();
    document.getElementById('wp-toggle-cotas')?.classList.toggle('wp-tool-active', AppState.showCotas);
  });

  document.getElementById('wp-dist-ok')?.addEventListener('click', _confirmDistInput);
  document.getElementById('wp-dist-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); _confirmDistInput(); }
    if (e.key === 'Escape') { _hideDistInput(); _cancelDrawing(); }
    e.stopPropagation();
  });

  // Menú segmento 2D
  document.getElementById('wp-seg-color')?.addEventListener('input', e => {
    if (_ctxSegIdx < 0) return;
    _segs[_ctxSegIdx].color = e.target.value;
    const mesh = _meshes.find(m => m.userData.segIdx === _ctxSegIdx);
    if (mesh) mesh.material.color.set(e.target.value);
  });
  document.getElementById('wp-seg-toggle-label')?.addEventListener('click', () => {
    if (_ctxSegIdx < 0) return;
    _segs[_ctxSegIdx].labelHidden = !_segs[_ctxSegIdx].labelHidden;
    _closeSegMenu();
  });
  document.getElementById('wp-seg-curve')?.addEventListener('click', () => {
    _showConfirmToast(`[debug] curva click · seg=${_ctxSegIdx}`);
    if (_ctxSegIdx < 0) return;
    const idx = _ctxSegIdx;
    const seg = _segs[idx];
    if (_isCurved(seg)) {
      seg.curve = 0;                 // volver a recta
      _showConfirmToast('Pared recta');
    } else {
      seg.curve = Math.max(0.4, seg.len * 0.25);  // curvatura inicial visible
      _showConfirmToast('Arrastra el tirador para ajustar la curva');
    }
    _rebuildSegMeshes(idx);
    _closeSegMenu();               // conserva la selección → el tirador queda visible
    _redrawCanvas();
  });
  document.getElementById('wp-seg-add-door')?.addEventListener('click', () => {
    if (_ctxSegIdx < 0) return;
    _startDoorMode(_ctxSegIdx);
  });
  document.getElementById('wp-seg-clear-doors')?.addEventListener('click', () => {
    if (_ctxSegIdx < 0) return;
    const idx = _ctxSegIdx;
    _segs[idx].doors = [];
    _rebuildSegMeshes(idx);
    _closeSegMenu();
  });
  document.getElementById('wp-seg-delete')?.addEventListener('click', () => {
    if (_ctxSegIdx < 0) return;
    const idx = _ctxSegIdx;
    for (let i = _meshes.length - 1; i >= 0; i--) {
      const m = _meshes[i];
      if (m.userData.segIdx !== idx) continue;
      SceneManager.scene.remove(m); m.geometry.dispose(); m.material.dispose();
      _meshes.splice(i, 1);
    }
    _meshes.forEach(m => { if (m.userData.segIdx > idx) m.userData.segIdx--; });
    _segs.splice(idx, 1);
    const lbl = _labels.splice(idx, 1)[0];
    lbl?.el.remove();
    _clearSegSelection();
    _redrawCanvas();
  });

  // Menú mesh 3D
  document.getElementById('wall-ctx-color')?.addEventListener('input', e => {
    if (!_ctxSeg) return;
    const segIdx = _ctxSeg.userData.segIdx;
    // Pintar todas las piezas del mismo segmento (puede tener puertas).
    _meshes.forEach(m => { if (m.userData.segIdx === segIdx) m.material.color.set(e.target.value); });
    if (segIdx >= 0 && segIdx < _segs.length) _segs[segIdx].color = e.target.value;
  });
  document.getElementById('wall-ctx-flatten')?.addEventListener('click', () => {
    if (!_ctxSeg) return;
    const FLAT_H = 0.10;
    const curH = _ctxSeg.geometry.parameters?.height ?? _wallHeight;
    const isFlat = curH <= FLAT_H + 0.001;

    // Largo del segmento (la pared puede estar rotada, usamos su largo real)
    const segIdx = _ctxSeg.userData.segIdx;
    const seg = segIdx >= 0 ? _segs[segIdx] : null;
    let len = seg ? seg.len : null;
    if (len == null) {
      const size = new THREE.Vector3();
      new THREE.Box3().setFromObject(_ctxSeg).getSize(size);
      len = Math.max(size.x, size.z);
    }

    // Toggle: si está aplanada vuelve a 3D (altura guardada), si no la aplana a 2D.
    const newH = isFlat ? (_ctxSeg.userData.origHeight || _wallHeight || 2.5) : FLAT_H;
    if (!isFlat) _ctxSeg.userData.origHeight = curH;

    _ctxSeg.geometry.dispose();
    _ctxSeg.geometry = new THREE.BoxGeometry(WALL_THICKNESS, newH, len);
    _ctxSeg.position.y = newH / 2;
    _closeCtxMenu();
  });
  document.getElementById('wall-ctx-toggle-label')?.addEventListener('click', () => _closeCtxMenu());
  document.getElementById('wall-ctx-delete')?.addEventListener('click', () => {
    if (!_ctxSeg) return;
    const segIdx = _ctxSeg.userData.segIdx;
    // Eliminar todas las piezas del segmento (puede tener varias por puertas).
    for (let i = _meshes.length - 1; i >= 0; i--) {
      const m = _meshes[i];
      if (m.userData.segIdx !== segIdx) continue;
      SceneManager.scene.remove(m); m.geometry.dispose(); m.material.dispose();
      _meshes.splice(i, 1);
    }
    if (segIdx >= 0 && segIdx < _segs.length) {
      _segs.splice(segIdx, 1);
      const lbl = _labels.splice(segIdx, 1)[0];
      lbl?.el.remove();
      _meshes.forEach(m => { if (m.userData.segIdx > segIdx) m.userData.segIdx--; });
    }
    _closeCtxMenu();
  });

  // Cerrar menús al clicar fuera
  document.addEventListener('pointerdown', e => {
    const sm = document.getElementById('wp-seg-menu');
    if (sm && sm.style.display !== 'none' && !sm.contains(e.target)) _closeSegMenu();
  });
}

function activate() {
  if (_active) return;
  _active = true;

  SceneManager.setCamera('top');
  document.getElementById('cam-top')?.classList.add('active');
  document.getElementById('cam-iso')?.classList.remove('active');
  document.getElementById('wall-painter-overlay')?.classList.remove('hidden');

  _cvs = document.getElementById('wall-painter-canvas');
  _ctx = _cvs?.getContext('2d');
  _resizeCanvas();

  _ensureLabelContainer();
  _startRafLoop();
  _ensureGlobalContextMenu();
  _initListeners();
  SceneManager.setControlsEnabled(true);

  // Sync estado cotas
  document.getElementById('wp-toggle-cotas')?.classList.toggle('wp-tool-active', Boolean(AppState.showCotas));

  _cvs?.addEventListener('pointerdown', _onPointerDown);
  _cvs?.addEventListener('pointerup',   _onPointerUp);
  _cvs?.addEventListener('pointermove', _onPointerMove);
  _cvs?.addEventListener('contextmenu', _onContextMenu);
  _cvs?.addEventListener('wheel',       _onWheel, { passive: false });
  document.addEventListener('keydown',  _onKeyDown);
  document.addEventListener('keyup',    _onKeyUp);
  window.addEventListener('resize',     _resizeCanvas);

  if (window.lucide) lucide.createIcons({ nodes: [document.getElementById('wall-painter-toolbar')] });
}

function deactivate() {
  if (!_active) return;
  _active = false;
  _cancelDrawing();
  _closeCtxMenu();
  document.getElementById('wall-painter-overlay')?.classList.add('hidden');
  SceneManager.setControlsEnabled(true);
  _cvs?.removeEventListener('pointerdown', _onPointerDown);
  _cvs?.removeEventListener('pointerup',   _onPointerUp);
  _cvs?.removeEventListener('pointermove', _onPointerMove);
  _cvs?.removeEventListener('contextmenu', _onContextMenu);
  _cvs?.removeEventListener('wheel',       _onWheel);
  document.removeEventListener('keydown',  _onKeyDown);
  document.removeEventListener('keyup',    _onKeyUp);
  window.removeEventListener('resize',     _resizeCanvas);
}

export const WallPainter = {
  activate,
  deactivate,
  get isActive() { return _active; },
  get segments() { return _segs; }
};

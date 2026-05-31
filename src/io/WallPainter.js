/**
 * WallPainter — Dibujo de plano 2D → transformación a paredes 3D
 */

import { SceneManager } from '../scene/SceneManager.js';
import { AppState }     from '../core/AppState.js';

/* ─── Constantes ─────────────────────────────────────────────────────────── */
const WALL_THICKNESS  = 0.10;
const ANGLE_SNAP_RAD  = Math.PI / 12;
const ENDPOINT_SNAP_M = 0.35;

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
    const cx = (seg.p1.x + seg.p2.x) / 2;
    const cz = (seg.p1.z + seg.p2.z) / 2;
    const v  = new THREE.Vector3(cx, 0.25, cz).project(cam);
    if (v.z > 1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = `${(v.x + 1) / 2 * W}px`;
    el.style.top  = `${(-v.y + 1) / 2 * H}px`;
  });
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
  const len = Math.sqrt(dx*dx + dz*dz);
  if (len < 0.01) return p2w;
  let angle = Math.atan2(dz, dx);
  if (!_shiftDown) angle = Math.round(angle / ANGLE_SNAP_RAD) * ANGLE_SNAP_RAD;
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

/* ─── Canvas 2D ──────────────────────────────────────────────────────────── */
function _redrawCanvas() {
  if (!_ctx || !_cvs) return;
  _ctx.clearRect(0, 0, _cvs.width, _cvs.height);

  for (let i = 0; i < _segs.length; i++) {
    const seg = _segs[i];
    const s1 = _worldToScreen(seg.p1.x, seg.p1.z);
    const s2 = _worldToScreen(seg.p2.x, seg.p2.z);
    const isSelected = _tool === 'select' && i === _ctxSegIdx;
    _drawSegLine(s1, s2, isSelected ? '#2563eb' : seg.color, isSelected ? 3.5 : 2.5);
    _drawDot(s1, seg.color);
    _drawDot(s2, seg.color);
  }

  if (_guideState) {
    const { p1s, p2s, isRect, snapPt } = _guideState;
    _drawGuide(p1s, p2s, isRect, snapPt);
  }
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

  const seg = { p1: {x: p1.x, z: p1.z}, p2: {x: p2.x, z: p2.z}, len, color: _wallColor };
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
    _buildWallMesh(_segs[i].p1, _segs[i].p2, _segs[i].color, i);
  }
}

function _buildWallMesh(p1, p2, color, segIdx = -1) {
  const dx = p2.x - p1.x, dz = p2.z - p1.z;
  const len = Math.sqrt(dx*dx + dz*dz);
  if (len < 0.05) return;
  const cx = (p1.x + p2.x) / 2, cz = (p1.z + p2.z) / 2;
  const angle = Math.atan2(dx, dz);
  const geo = new THREE.BoxGeometry(WALL_THICKNESS, _wallHeight, len);
  const mat = new THREE.MeshStandardMaterial({ color: color || _wallColor, roughness: 0.85, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, _wallHeight / 2, cz);
  mesh.rotation.y = angle;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.isWall = true;
  mesh.userData.segIdx = segIdx;
  SceneManager.scene.add(mesh);
  _meshes.push(mesh);
}

/* ─── Menú contextual de segmento 2D (modo Selección) ───────────────────── */
const SEG_PICK_PX = 10; // píxeles de tolerancia para seleccionar segmento

function _pickSegIdx(sx, sy) {
  let best = -1, bestDist = SEG_PICK_PX;
  for (let i = 0; i < _segs.length; i++) {
    const s1 = _worldToScreen(_segs[i].p1.x, _segs[i].p1.z);
    const s2 = _worldToScreen(_segs[i].p2.x, _segs[i].p2.z);
    // Distancia punto-segmento en pantalla
    const dx = s2.x - s1.x, dy = s2.y - s1.y;
    const len2 = dx*dx + dy*dy;
    if (len2 < 0.01) continue;
    const t = Math.max(0, Math.min(1, ((sx-s1.x)*dx + (sy-s1.y)*dy) / len2));
    const dist = Math.hypot(sx - (s1.x+t*dx), sy - (s1.y+t*dy));
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

function _openSegMenu(idx, sx, sy) {
  _ctxSegIdx = idx;
  const menu = document.getElementById('wp-seg-menu');
  if (!menu) return;
  const seg = _segs[idx];
  const colorEl = document.getElementById('wp-seg-color');
  if (colorEl) colorEl.value = seg.color || '#1a1a2c';
  const toggleEl = document.getElementById('wp-seg-toggle-label');
  if (toggleEl) toggleEl.textContent = seg.labelHidden ? 'Mostrar medida' : 'Ocultar medida';
  menu.style.display = 'block';
  const mw = 180, mh = 130;
  menu.style.left = `${Math.min(sx, window.innerWidth - mw)}px`;
  menu.style.top  = `${Math.min(sy, window.innerHeight - mh)}px`;
}

function _closeSegMenu() {
  const menu = document.getElementById('wp-seg-menu');
  if (menu) menu.style.display = 'none';
  _ctxSegIdx = -1;
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
  if (e.key === 'Escape') { _cancelDrawing(); return; }
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
  _downPos = { x: e.clientX, y: e.clientY };
  _isDragging = false;
  _forwardToScene(e);
}

function _onPointerUp(e) {
  if (!_active) return;
  if (e.button === 2) return;
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

  _closeCtxMenu();
  _closeSegMenu();

  const worldPos = _screenToWorld(e.clientX, e.clientY);
  if (!worldPos) return;

  // Modo selección: pick de segmento 2D
  if (_tool === 'select') {
    const idx = _pickSegIdx(e.clientX, e.clientY);
    if (idx >= 0) _openSegMenu(idx, e.clientX, e.clientY);
    return;
  }

  if (!_drawing) {
    const p1w = _applyEndpointSnap({ x: worldPos.x, z: worldPos.z });
    _drawing  = true;
    _p1       = { wx: p1w.x, wz: p1w.z };
    _p1Screen = { x: e.clientX, y: e.clientY };
    if (_tool === 'line') _showDistInput(e.clientX, e.clientY);
  } else {
    const raw2     = { x: worldPos.x, z: worldPos.z };
    const snapped2 = _applyEndpointSnap(raw2);
    const hasSnap2 = snapped2.x !== raw2.x || snapped2.z !== raw2.z;
    const p2w      = hasSnap2 ? snapped2 : _applyAngleSnap(_p1, raw2);

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

  if (_downPos) {
    const moved = Math.abs(e.clientX - _downPos.x) + Math.abs(e.clientY - _downPos.y);
    if (moved > 4) {
      _isDragging = true;
      _forwardToScene(e);
      return;
    }
  }

  if (_cvs) {
    if (_tool === 'select') {
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
  const snappedEp = !_altDown ? _applyEndpointSnap(raw) : raw;
  const isSnapped = snappedEp.x !== raw.x || snappedEp.z !== raw.z;
  const p2w       = isSnapped ? snappedEp : _applyAngleSnap(_p1, snappedEp);
  const p2s       = isSnapped ? _worldToScreen(p2w.x, p2w.z) : { x: e.clientX, y: e.clientY };

  _guideState = { p1s: _p1Screen, p2s, isRect: _tool === 'rect', snapPt: isSnapped ? p2s : null };

  const dx = p2w.x - _p1.wx, dz = p2w.z - _p1.wz;
  if (_tool === 'line') {
    _showTooltip(`${Math.sqrt(dx*dx+dz*dz).toFixed(2)} m`, e.clientX, e.clientY);
  } else {
    _showTooltip(`Ancho: ${Math.abs(dx).toFixed(2)} m | Fondo: ${Math.abs(dz).toFixed(2)} m`, e.clientX, e.clientY);
  }
}

function _onWheel(e) {
  if (!_active) return;
  document.getElementById('scene-canvas')?.dispatchEvent(new WheelEvent('wheel', e));
}

function _onContextMenu(e) {
  if (!_active) return;
  e.preventDefault(); e.stopPropagation();
  if (_drawing) _cancelDrawing();
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
  _closeSegMenu();
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
  document.getElementById('wp-transform')?.addEventListener('click', () => { _transform(); deactivate(); });
  document.getElementById('wp-finish-2d')?.addEventListener('click', () => {
    const prev = _wallHeight;
    _wallHeight = 0.05;
    _transform();
    _wallHeight = prev;
    deactivate();
  });
  document.getElementById('wp-cancel')?.addEventListener('click', () => { _clearAll(); deactivate(); });

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
  document.getElementById('wp-seg-delete')?.addEventListener('click', () => {
    if (_ctxSegIdx < 0) return;
    const idx = _ctxSegIdx;
    const meshIdx = _meshes.findIndex(m => m.userData.segIdx === idx);
    if (meshIdx >= 0) {
      const m = _meshes[meshIdx];
      SceneManager.scene.remove(m); m.geometry.dispose(); m.material.dispose();
      _meshes.splice(meshIdx, 1);
      _meshes.forEach(m => { if (m.userData.segIdx > idx) m.userData.segIdx--; });
    }
    _segs.splice(idx, 1);
    const lbl = _labels.splice(idx, 1)[0];
    lbl?.el.remove();
    _closeSegMenu();
  });

  // Menú mesh 3D
  document.getElementById('wall-ctx-color')?.addEventListener('input', e => {
    if (!_ctxSeg) return;
    _ctxSeg.material.color.set(e.target.value);
  });
  document.getElementById('wall-ctx-toggle-label')?.addEventListener('click', () => _closeCtxMenu());
  document.getElementById('wall-ctx-delete')?.addEventListener('click', () => {
    if (!_ctxSeg) return;
    const meshIdx = _meshes.indexOf(_ctxSeg);
    const segIdx  = _ctxSeg.userData.segIdx;
    if (meshIdx >= 0) {
      SceneManager.scene.remove(_ctxSeg);
      _ctxSeg.geometry.dispose(); _ctxSeg.material.dispose();
      _meshes.splice(meshIdx, 1);
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

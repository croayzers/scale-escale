/**
 * WallPainter — Herramienta de dibujo de paredes 2D → 3D
 *
 * Flujo:
 *   1. Se activa sobre la vista TOP (cenital).
 *   2. El usuario dibuja líneas / rectángulos sobre un <canvas> overlay.
 *   3. Cada segmento se convierte instantáneamente en una pared 3D (BoxGeometry).
 *   4. Las paredes muestran su longitud como label 3D (CSS2DObject).
 *   5. Menú contextual (botón derecho) sobre cada pared: ocultar medida · eliminar.
 */

import { SceneManager } from '../scene/SceneManager.js';
import { AppState }      from '../core/AppState.js';

/* ─── Constantes ──────────────────────────────────────────────────────────── */
const WALL_THICKNESS  = 0.10;
const WALL_COLOR      = 0x1a1a2c;
const ANGLE_SNAP_RAD  = Math.PI / 12;  // 15° — Shift lo deshabilita
const ENDPOINT_SNAP_M = 0.35;          // metros — radio de snap de extremos de pared

/* ─── Estado interno ──────────────────────────────────────────────────────── */
let _active    = false;
let _tool      = 'line';       // 'line' | 'rect'
let _wallHeight = 2.5;

// Canvas 2D overlay
let _cvs, _ctx;

// Dibujo en curso
let _drawing   = false;
let _p1        = null;         // {wx, wz} — mundo THREE
let _p1Screen  = null;         // {x, y}   — pantalla
let _walls     = [];           // [{mesh3d, labelEl, p1, p2, labelVisible}]
let _ctxWall   = null;         // pared con menú abierto

/* ─── Contenedor de etiquetas HTML ──────────────────────────────────────── */
let _labelContainer = null;
let _rafId = null;

function _ensureLabelContainer() {
  if (_labelContainer) return;
  _labelContainer = document.createElement('div');
  _labelContainer.style.cssText =
    'position:absolute;inset:0;pointer-events:none;z-index:62;overflow:hidden';
  document.getElementById('wall-painter-overlay')?.appendChild(_labelContainer);
}

// Actualiza la posición 2D de todas las etiquetas proyectando desde 3D
function _updateLabels() {
  if (!_active) return;
  const cam = SceneManager.activeCam;
  if (cam && _labelContainer) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    _walls.forEach(wall => {
      if (!wall.labelEl || !wall.labelVisible) return;
      const cx = (wall.p1.x + wall.p2.x) / 2;
      const cz = (wall.p1.z + wall.p2.z) / 2;
      const v = new THREE.Vector3(cx, _wallHeight + 0.2, cz).project(cam);
      const sx = (v.x + 1) / 2 * w;
      const sy = (-v.y + 1) / 2 * h;
      // Ocultar si está detrás de la cámara
      if (v.z > 1) { wall.labelEl.style.display = 'none'; return; }
      wall.labelEl.style.display = '';
      wall.labelEl.style.left = `${sx}px`;
      wall.labelEl.style.top  = `${sy}px`;
    });
  }
  _rafId = requestAnimationFrame(_updateLabels);
}

/* ─── Conversión coordenadas ─────────────────────────────────────────────── */

/**
 * Convierte posición de pantalla {x,y} → coordenadas del mundo THREE {x,z}
 * usando el raycaster sobre el plano Y=0.
 */
function _screenToWorld(sx, sy) {
  return SceneManager.screenToGround(sx, sy) ?? null;
}

/**
 * Convierte {wx, wz} del mundo THREE → posición de pantalla {x, y}
 * proyectando con la cámara activa.
 */
function _worldToScreen(wx, wz) {
  const cam = SceneManager.activeCam;
  if (!cam) return { x: 0, y: 0 };
  const v = new THREE.Vector3(wx, 0, wz).project(cam);
  return {
    x: (v.x + 1) / 2 * _cvs.width,
    y: (-v.y + 1) / 2 * _cvs.height
  };
}

/* ─── Snap angular 15° (Shift = libre) ──────────────────────────────────── */
function _applyAngleSnap(p1w, p2w) {
  const dx  = p2w.x - p1w.wx;
  const dz  = p2w.z - p1w.wz;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.01) return p2w;
  // Sin Shift → snap a múltiplos de 15°; con Shift → libre
  let angle = Math.atan2(dz, dx);
  if (!_shiftDown) angle = Math.round(angle / ANGLE_SNAP_RAD) * ANGLE_SNAP_RAD;
  return { x: p1w.wx + len * Math.cos(angle), z: p1w.wz + len * Math.sin(angle) };
}

/* ─── Snap de extremos de pared (Alt lo deshabilita) ────────────────────── */
function _applyEndpointSnap(p2w) {
  if (_altDown) return p2w;
  let best = null, bestDist = ENDPOINT_SNAP_M;
  for (const wall of _walls) {
    for (const ep of [wall.p1, wall.p2]) {
      const d = Math.hypot(p2w.x - ep.x, p2w.z - ep.z);
      if (d < bestDist) { bestDist = d; best = ep; }
    }
  }
  return best ? { x: best.x, z: best.z } : p2w;
}

/* ─── Canvas 2D overlay ──────────────────────────────────────────────────── */
function _resizeCanvas() {
  if (!_cvs) return;
  _cvs.width  = window.innerWidth;
  _cvs.height = window.innerHeight;
}

function _clearGuide() {
  if (!_ctx) return;
  _ctx.clearRect(0, 0, _cvs.width, _cvs.height);
}

function _drawGuide(p1s, p2s, isRect) {
  _clearGuide();
  _ctx.save();
  _ctx.strokeStyle = '#2563eb';
  _ctx.lineWidth   = 1.5;
  _ctx.setLineDash([6, 4]);
  _ctx.lineCap = 'round';

  if (isRect) {
    const x = Math.min(p1s.x, p2s.x);
    const y = Math.min(p1s.y, p2s.y);
    const w = Math.abs(p2s.x - p1s.x);
    const h = Math.abs(p2s.y - p1s.y);
    _ctx.strokeRect(x, y, w, h);
  } else {
    _ctx.beginPath();
    _ctx.moveTo(p1s.x, p1s.y);
    _ctx.lineTo(p2s.x, p2s.y);
    _ctx.stroke();
  }
  _ctx.restore();

  // Punto de origen
  _ctx.save();
  _ctx.fillStyle = '#2563eb';
  _ctx.beginPath();
  _ctx.arc(p1s.x, p1s.y, 5, 0, Math.PI * 2);
  _ctx.fill();
  _ctx.restore();
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

/* ─── Crear pared 3D ─────────────────────────────────────────────────────── */
function _buildWall(p1w, p2w) {
  const dx  = p2w.x - p1w.wx;
  const dz  = p2w.z - p1w.wz;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.05) return null;

  const cx = (p1w.wx + p2w.x) / 2;
  const cz = (p1w.wz + p2w.z) / 2;
  const angle = Math.atan2(dx, dz); // rotación en Y

  const geo = new THREE.BoxGeometry(WALL_THICKNESS, _wallHeight, len);
  const mat = new THREE.MeshStandardMaterial({
    color:     WALL_COLOR,
    roughness: 0.85,
    metalness: 0.0
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, _wallHeight / 2, cz);
  mesh.rotation.y = angle;
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  mesh.userData.isWall = true;

  SceneManager.scene.add(mesh);

  // ─── Etiqueta HTML posicionada en 2D ────────────────────────────────────
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

  const wallData = {
    mesh, labelEl,
    p1: { x: p1w.wx, z: p1w.wz },
    p2: { x: p2w.x,  z: p2w.z  },
    len, labelVisible: true
  };
  _walls.push(wallData);
  return wallData;
}

/* ─── Rectángulo → 4 paredes ─────────────────────────────────────────────── */
function _buildRect(p1w, p2w) {
  const corners = [
    { wx: p1w.wx, wz: p1w.wz },
    { wx: p2w.x,  wz: p1w.wz },
    { wx: p2w.x,  wz: p2w.z  },
    { wx: p1w.wx, wz: p2w.z  }
  ];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    _buildWall(a, { x: b.wx, z: b.wz });
  }
}

/* ─── Menú contextual ────────────────────────────────────────────────────── */
function _openCtxMenu(wallData, sx, sy) {
  _ctxWall = wallData;
  const menu = document.getElementById('wall-ctx-menu');
  if (!menu) return;

  const toggleBtn = document.getElementById('wall-ctx-toggle-label');
  if (toggleBtn) toggleBtn.textContent = wallData.labelVisible ? 'Ocultar medida' : 'Mostrar medida';

  // Sincronizar el color picker con el color actual de la pared
  const colorPicker = document.getElementById('wall-ctx-color');
  if (colorPicker) {
    const hex = '#' + wallData.mesh.material.color.getHexString();
    colorPicker.value = hex;
  }

  // Posicionar sin salirse de la pantalla
  menu.style.display = 'block';
  const menuW = 180, menuH = 130;
  menu.style.left = `${Math.min(sx, window.innerWidth  - menuW)}px`;
  menu.style.top  = `${Math.min(sy, window.innerHeight - menuH)}px`;
}
function _closeCtxMenu() {
  const menu = document.getElementById('wall-ctx-menu');
  if (menu) menu.style.display = 'none';
  _ctxWall = null;
}

/* ─── Raycasting sobre paredes (clic derecho) ────────────────────────────── */
function _pickWall(sx, sy) {
  const cam = SceneManager.activeCam;
  if (!cam) return null;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(
    (sx / window.innerWidth)  *  2 - 1,
    (sy / window.innerHeight) * -2 + 1
  );
  raycaster.setFromCamera(ndc, cam);
  const meshes = _walls.map(w => w.mesh);
  const hits   = raycaster.intersectObjects(meshes);
  if (!hits.length) return null;
  return _walls.find(w => w.mesh === hits[0].object) ?? null;
}

/* ─── Handlers de input ──────────────────────────────────────────────────── */
let _shiftDown = false;
let _altDown   = false;

function _onKeyDown(e) {
  if (!_active) return;
  if (e.key === 'Shift') { _shiftDown = true; return; }
  if (e.key === 'Alt')   { _altDown   = true; return; }
  if (e.key === 'Escape') { _cancelDrawing(); return; }
  if (e.key === 'l' || e.key === 'L') _setTool('line');
  if (e.key === 'r' || e.key === 'R') _setTool('rect');
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    _undoLast();
  }
}
function _onKeyUp(e) {
  if (e.key === 'Shift') _shiftDown = false;
  if (e.key === 'Alt')   _altDown   = false;
}

// Guardamos posición del pointerdown para distinguir click de drag
let _downPos = null;

function _onPointerDown(e) {
  if (!_active) return;
  e.stopPropagation();
  if (e.button === 2) return; // el contextmenu lo maneja _onContextMenu
  _downPos = { x: e.clientX, y: e.clientY };
}

function _onPointerUp(e) {
  if (!_active) return;
  e.stopPropagation();
  if (e.button === 2) return; // el contextmenu lo maneja _onContextMenu

  // Ignorar si fue un drag (movió más de 5px)
  if (!_downPos) return;
  const moved = Math.abs(e.clientX - _downPos.x) + Math.abs(e.clientY - _downPos.y);
  _downPos = null;
  if (moved > 5) return;

  _closeCtxMenu();

  const worldPos = _screenToWorld(e.clientX, e.clientY);
  if (!worldPos) return;

  if (!_drawing) {
    // Primer clic: fijar origen (con snap de extremo)
    let p1w = _applyEndpointSnap({ x: worldPos.x, z: worldPos.z });
    _drawing  = true;
    _p1       = { wx: p1w.x, wz: p1w.z };
    _p1Screen = { x: e.clientX, y: e.clientY };
  } else {
    // Segundo clic: aplicar snaps y confirmar
    let p2w = _applyAngleSnap(_p1, { x: worldPos.x, z: worldPos.z });
    p2w = _applyEndpointSnap(p2w);

    if (_tool === 'rect') {
      _buildRect(_p1, p2w);
      _cancelDrawing();
    } else {
      _buildWall(_p1, p2w);
      // Encadenar: el punto final es el nuevo origen
      _p1       = { wx: p2w.x, wz: p2w.z };
      _p1Screen = { x: e.clientX, y: e.clientY };
      _clearGuide();
    }
  }
}

function _onDblClick(e) {
  if (!_active || !_drawing) return;
  e.stopPropagation();
  // El dblclick dispara 2x pointerup antes — la última pared ya fue creada,
  // solo cancelamos el modo encadenado
  _cancelDrawing();
}

function _onPointerMove(e) {
  if (!_active) return;
  // Cursor siempre muestra el snap de extremo aunque no estemos dibujando
  const worldPos = _screenToWorld(e.clientX, e.clientY);
  if (!worldPos) return;

  const raw = { x: worldPos.x, z: worldPos.z };
  const snappedEp = !_altDown ? _applyEndpointSnap(raw) : raw;
  const isSnapped = snappedEp !== raw && (snappedEp.x !== raw.x || snappedEp.z !== raw.z);

  // Cambiar cursor para indicar snap de extremo
  if (_cvs) _cvs.style.cursor = isSnapped ? 'cell' : 'crosshair';

  if (!_drawing || !_p1) { _hideTooltip(); return; }

  // Aplicar snaps al p2 del preview
  let p2w = _applyAngleSnap(_p1, snappedEp);

  // Calcular posición en pantalla del p2 snapeado (proyección inversa)
  const p2s = isSnapped
    ? _worldToScreen(p2w.x, p2w.z)
    : { x: e.clientX, y: e.clientY };

  _drawGuide(_p1Screen, p2s, _tool === 'rect');

  // Tooltip con medidas
  const dx = p2w.x - _p1.wx;
  const dz = p2w.z - _p1.wz;
  if (_tool === 'line') {
    const len = Math.sqrt(dx * dx + dz * dz);
    const snapHint = isSnapped ? ' · 🔗' : '';
    _showTooltip(`${len.toFixed(2)} m${snapHint}`, e.clientX, e.clientY);
  } else {
    _showTooltip(`Ancho: ${Math.abs(dx).toFixed(2)} m | Fondo: ${Math.abs(dz).toFixed(2)} m`, e.clientX, e.clientY);
  }
}

function _onContextMenu(e) {
  if (!_active) return;
  e.preventDefault();
  e.stopPropagation();

  // Si estamos dibujando, clic derecho cancela el segmento en curso
  if (_drawing) {
    _cancelDrawing();
    return;
  }

  // Si no dibujamos, abrir menú contextual de pared
  const wall = _pickWall(e.clientX, e.clientY);
  if (wall) _openCtxMenu(wall, e.clientX, e.clientY);
  else      _closeCtxMenu();
}

/* ─── Utilidades ─────────────────────────────────────────────────────────── */
function _cancelDrawing() {
  _drawing  = false;
  _p1       = null;
  _p1Screen = null;
  _clearGuide();
  _hideTooltip();
}

function _removeWall(wall) {
  SceneManager.scene.remove(wall.mesh);
  wall.mesh.geometry.dispose();
  wall.mesh.material.dispose();
  wall.labelEl?.remove();
}

function _undoLast() {
  const last = _walls.pop();
  if (!last) return;
  _removeWall(last);
}

function _clearAll() {
  if (!confirm('¿Borrar todas las paredes dibujadas?')) return;
  [..._walls].forEach(_removeWall);
  _walls = [];
  _cancelDrawing();
}

function _setTool(tool) {
  _tool = tool;
  document.getElementById('wp-tool-line')?.classList.toggle('wp-tool-active', tool === 'line');
  document.getElementById('wp-tool-rect')?.classList.toggle('wp-tool-active', tool === 'rect');
  _cancelDrawing();
}

/* ─── Activar / desactivar ───────────────────────────────────────────────── */
function activate() {
  if (_active) return;
  _active = true;

  // Cambiar a vista TOP para dibujar
  SceneManager.setCamera('top');
  document.getElementById('cam-top')?.classList.add('active');
  document.getElementById('cam-iso')?.classList.remove('active');

  // Mostrar overlay
  const overlay = document.getElementById('wall-painter-overlay');
  overlay?.classList.remove('hidden');

  // Configurar canvas
  _cvs = document.getElementById('wall-painter-canvas');
  _ctx = _cvs?.getContext('2d');
  _resizeCanvas();

  // Contenedor de etiquetas HTML y loop de actualización
  _ensureLabelContainer();
  _updateLabels();

  // Desactivar OrbitControls para que no compitan con el dibujo
  SceneManager.setControlsEnabled(false);

  // Listeners
  _cvs?.addEventListener('pointerdown', _onPointerDown);
  _cvs?.addEventListener('pointerup',   _onPointerUp);
  _cvs?.addEventListener('pointermove', _onPointerMove);
  _cvs?.addEventListener('dblclick',    _onDblClick);
  _cvs?.addEventListener('contextmenu', _onContextMenu);
  document.addEventListener('keydown',  _onKeyDown);
  document.addEventListener('keyup',    _onKeyUp);
  window.addEventListener('resize',     _resizeCanvas);

  // Toolbar
  document.getElementById('wp-tool-line')?.addEventListener('click', () => _setTool('line'));
  document.getElementById('wp-tool-rect')?.addEventListener('click', () => _setTool('rect'));
  document.getElementById('wp-undo')?.addEventListener('click', _undoLast);
  document.getElementById('wp-clear')?.addEventListener('click', _clearAll);
  document.getElementById('wp-finish')?.addEventListener('click', deactivate);
  document.getElementById('wp-cancel')?.addEventListener('click', () => { _clearAll(); deactivate(); });
  document.getElementById('wp-wall-height')?.addEventListener('input', e => {
    _wallHeight = parseFloat(e.target.value) || 2.5;
  });

  // Menú contextual
  document.getElementById('wall-ctx-color')?.addEventListener('input', e => {
    if (!_ctxWall) return;
    _ctxWall.mesh.material.color.set(e.target.value);
  });

  document.getElementById('wall-ctx-toggle-label')?.addEventListener('click', () => {
    if (!_ctxWall) return;
    _ctxWall.labelVisible = !_ctxWall.labelVisible;
    if (_ctxWall.labelObj) _ctxWall.labelObj.visible = _ctxWall.labelVisible;
    else _ctxWall.labelEl.style.display = _ctxWall.labelVisible ? '' : 'none';
    _closeCtxMenu();
  });
  document.getElementById('wall-ctx-delete')?.addEventListener('click', () => {
    if (!_ctxWall) return;
    _removeWall(_ctxWall);
    _walls = _walls.filter(w => w !== _ctxWall);
    _closeCtxMenu();
  });

  // Cerrar menú con clic fuera
  document.addEventListener('pointerdown', _onDocPointerDown);

  if (window.lucide) lucide.createIcons({ nodes: [document.getElementById('wall-painter-toolbar')] });
}

function deactivate() {
  if (!_active) return;
  _active = false;
  _cancelDrawing();
  _closeCtxMenu();

  document.getElementById('wall-painter-overlay')?.classList.add('hidden');

  // Parar el RAF de etiquetas
  if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }

  // Reactivar OrbitControls
  SceneManager.setControlsEnabled(true);

  _cvs?.removeEventListener('pointerdown', _onPointerDown);
  _cvs?.removeEventListener('pointerup',   _onPointerUp);
  _cvs?.removeEventListener('pointermove', _onPointerMove);
  _cvs?.removeEventListener('dblclick',    _onDblClick);
  _cvs?.removeEventListener('contextmenu', _onContextMenu);
  document.removeEventListener('keydown',  _onKeyDown);
  document.removeEventListener('keyup',    _onKeyUp);
  window.removeEventListener('resize',     _resizeCanvas);
  document.removeEventListener('pointerdown', _onDocPointerDown);
}

function _onDocPointerDown(e) {
  const menu = document.getElementById('wall-ctx-menu');
  if (menu && !menu.contains(e.target)) _closeCtxMenu();
}

/* ─── Parchear render loop de SceneManager para incluir CSS2DRenderer ────── */
let _origRender = null;
function _patchRenderLoop(on) {
  if (on && !_origRender && _labelRenderer) {
    _origRender = SceneManager.renderer?.render?.bind(SceneManager.renderer);
    if (SceneManager.renderer) {
      const orig = SceneManager.renderer.render.bind(SceneManager.renderer);
      SceneManager.renderer.render = (scene, cam) => {
        orig(scene, cam);
        if (_active && _labelRenderer) _labelRenderer.render(scene, cam);
      };
    }
  } else if (!on && _origRender && SceneManager.renderer) {
    SceneManager.renderer.render = _origRender;
    _origRender = null;
  }
}

/* ─── API pública ────────────────────────────────────────────────────────── */
export const WallPainter = {
  activate,
  deactivate,
  get isActive() { return _active; },
  get walls() { return _walls; }
};

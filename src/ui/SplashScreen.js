/* ─────────────────────────────────────────────────────────
   SPLASH SCREEN — Partículas que convergen en cuadrícula
   Los puntos explotan desde el centro y se ordenan en grid,
   luego hacen fade revelando la cuadrícula de la escena.
   ───────────────────────────────────────────────────────── */

const HOLD_MS    = 400;   // espera antes de arrancar
const EXPLODE_MS = 600;   // duración explosión inicial
const SETTLE_MS  = 900;   // duración convergencia al grid
const LINES_MS   = 700;   // duración crecimiento de líneas
const HOLD2_MS   = 400;   // pausa final con grid completo
const FADE_MS    = 700;   // fade out al revelar la escena

/* ════════════════════════════════════════════════════════
   DOCK / HEADER — colapsar al inicio → expandir tras anim
   ════════════════════════════════════════════════════════ */
export function collapseHeader() {
  const inner = document.getElementById('header-inner');
  if (!inner) return;
  Array.from(inner.children).forEach(el => {
    if (el.id !== 'header-brand') { el.style.opacity = '0'; el.style.pointerEvents = 'none'; }
  });
}

function _expandHeader() {
  const inner = document.getElementById('header-inner');
  if (!inner) return;
  const children = Array.from(inner.children).filter(el => el.id !== 'header-brand');
  children.forEach(el => { el.style.opacity = '0'; el.style.transition = 'none'; el.style.pointerEvents = ''; });
  children.forEach((el, i) => {
    setTimeout(() => { el.style.transition = 'opacity 0.5s'; el.style.opacity = '1'; }, i * 60);
  });
}

export function collapseDock() {
  const dock  = document.getElementById('dock');
  const items = document.getElementById('dock-items');
  const logo  = document.getElementById('dock-brand-logo');
  if (!dock) return;
  dock._expandW = dock.scrollWidth + 'px';
  dock._expandH = dock.scrollHeight + 'px';
  items && (items.style.display = 'none');
  logo  && (logo.style.display  = 'flex');
  dock.classList.add('dock-collapsed');
  dock.style.cssText += `;width:52px;height:52px;border-radius:50%;padding:6px;
    overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:default;`;
}

function _expandDock() {
  const dock  = document.getElementById('dock');
  const items = document.getElementById('dock-items');
  if (!dock || items?.style.display !== 'none') return;

  const gsap = window.gsap;
  const logo  = document.getElementById('dock-brand-logo');

  if (!gsap) {
    logo && (logo.style.display = 'none');
    items && (items.style.display = '');
    dock.style.cssText = '';
    return;
  }

  gsap.to(logo, { opacity: 0, duration: 0.2, onComplete() {
    logo && (logo.style.display = 'none');
    items && (items.style.display = '');
    const allChildren = Array.from(items.children);
    allChildren.forEach(el => { el.style.opacity = '0'; el.style.transition = 'none'; });
    dock.style.width = ''; dock.style.height = '';
    dock.style.borderRadius = ''; dock.style.padding = '';
    dock.style.overflow = ''; dock.style.cursor = '';
    dock.classList.remove('dock-collapsed');

    const catButtons = allChildren.filter(el => el.dataset?.dockKind === 'category');
    const rest        = allChildren.filter(el => el.dataset?.dockKind !== 'category');
    const centerIdx   = catButtons.findIndex(b => b.dataset.cat === 'scenography');
    const pivotLeft   = centerIdx >= 0 ? centerIdx : Math.floor(catButtons.length / 2) - 1;
    const pivotRight  = pivotLeft + 1;
    const pairs = [];
    let l = pivotLeft, r = pivotRight;
    while (l >= 0 || r < catButtons.length) {
      const pair = [];
      if (l >= 0) pair.push(catButtons[l--]);
      if (r < catButtons.length) pair.push(catButtons[r++]);
      pairs.push(pair);
    }
    if (rest.length) pairs.push(rest);
    pairs.forEach((pair, i) => {
      setTimeout(() => {
        pair.forEach(el => { el.style.transition = 'opacity 0.6s'; el.style.opacity = '1'; });
      }, i * 200);
    });
  }});
}

/* ════════════════════════════════════════════════════════
   PARTÍCULAS — canvas 2D puro, sin dependencias
   ════════════════════════════════════════════════════════ */
function _runParticleAnim(canvas, onComplete) {
  const W = canvas.width  = window.innerWidth;
  const H = canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  const DOT_COLOR  = '#1a1a1c';
  const LINE_COLOR = '#1a1a1c';
  const DOT_RADIUS = 1.8;

  // Doble de puntos → celda la mitad
  const CELL = 26;
  const cols = Math.ceil(W / CELL) + 2;
  const rows = Math.ceil(H / CELL) + 2;
  const offsetX = (W % CELL) / 2;
  const offsetY = (H % CELL) / 2;

  // Grid de posiciones destino (índice por [r][c] para vecinos)
  const grid = [];   // grid[r][c] = { tx, ty }
  const targets = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      const pt = { tx: offsetX + c * CELL, ty: offsetY + r * CELL, r, c };
      grid[r][c] = pt;
      targets.push(pt);
    }
  }

  const N = targets.length;
  const cx = W / 2, cy = H / 2;

  // Partículas: explosión desde el centro
  const particles = targets.map(pt => {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 60 + Math.random() * Math.max(W, H) * 0.55;
    return {
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      tx: pt.tx, ty: pt.ty,
      r: pt.r,   c: pt.c,
      opacity: 0.05 + Math.random() * 0.2,
    };
  });

  // Índice rápido: [r][c] → partícula
  const pGrid = [];
  for (let r = 0; r < rows; r++) pGrid[r] = [];
  particles.forEach(p => { pGrid[p.r][p.c] = p; });

  const t0 = performance.now();
  const T_SETTLE_END = EXPLODE_MS + SETTLE_MS;
  const T_LINES_END  = T_SETTLE_END + LINES_MS;
  const T_HOLD_END   = T_LINES_END + HOLD2_MS;
  let raf;

  function easeOutExpo(t)    { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
  function easeOutCubic(t)   { return 1 - Math.pow(1 - t, 3); }

  function tick() {
    raf = requestAnimationFrame(tick);
    const elapsed = performance.now() - t0;
    ctx.clearRect(0, 0, W, H);

    let settleP = 0, globalOp = 1, linesP = 0;

    if (elapsed < EXPLODE_MS) {
      settleP  = 0;
      globalOp = easeOutExpo(elapsed / EXPLODE_MS);
      linesP   = 0;
    } else if (elapsed < T_SETTLE_END) {
      settleP  = easeInOutCubic((elapsed - EXPLODE_MS) / SETTLE_MS);
      globalOp = 1;
      linesP   = 0;
    } else if (elapsed < T_LINES_END) {
      settleP  = 1;
      globalOp = 1;
      linesP   = easeOutCubic((elapsed - T_SETTLE_END) / LINES_MS);
    } else if (elapsed < T_HOLD_END) {
      settleP  = 1;
      globalOp = 1;
      linesP   = 1;
    } else {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, W, H);
      onComplete?.();
      return;
    }

    // ── Líneas (se dibujan antes para quedar debajo de los puntos) ──
    if (linesP > 0) {
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth   = 0.5;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p = pGrid[r][c];
          if (!p) continue;
          const px = p.tx, py = p.ty;

          // Derecha
          if (c + 1 < cols) {
            const q = pGrid[r][c + 1];
            if (q) {
              const qx = q.tx;
              ctx.globalAlpha = 0.18 * linesP;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px + (qx - px) * linesP, py);
              ctx.stroke();
            }
          }
          // Abajo
          if (r + 1 < rows) {
            const q = pGrid[r + 1][c];
            if (q) {
              const qy = q.ty;
              ctx.globalAlpha = 0.18 * linesP;
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px, py + (qy - py) * linesP);
              ctx.stroke();
            }
          }
        }
      }
    }

    // ── Puntos ──
    ctx.fillStyle = DOT_COLOR;
    for (let i = 0; i < N; i++) {
      const p = particles[i];
      const x = p.x + (p.tx - p.x) * settleP;
      const y = p.y + (p.ty - p.y) * settleP;
      const dotOp = (p.opacity + settleP * (1 - p.opacity)) * globalOp;
      ctx.globalAlpha = dotOp;
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  tick();
}

/* ════════════════════════════════════════════════════════
   BORDE BRILLANTE EN EL DOCK — luz de colores circulando
   ════════════════════════════════════════════════════════ */
let _dockGlowRaf = null;
let _dockGlowStyle = null;

function _startDockGlow() {
  const dock = document.getElementById('dock');
  if (!dock) return;

  // Inyectar el estilo del keyframe una sola vez
  if (!_dockGlowStyle) {
    _dockGlowStyle = document.createElement('style');
    _dockGlowStyle.id = 'dock-glow-style';
    _dockGlowStyle.textContent = `
      @keyframes dockGlowRotate {
        0%   { background-position: 0% 50%; }
        100% { background-position: 200% 50%; }
      }
      #dock.dock-glow::before {
        content: '';
        position: absolute;
        inset: -2px;
        border-radius: inherit;
        background: linear-gradient(90deg,
          #ff6b6b, #ffd93d, #6bcb77, #4d96ff, #c77dff, #ff6b6b, #ffd93d);
        background-size: 200% 100%;
        animation: dockGlowRotate 2s linear infinite;
        z-index: -1;
        border-radius: inherit;
      }
      #dock.dock-glow {
        position: relative;
        isolation: isolate;
      }
    `;
    document.head.appendChild(_dockGlowStyle);
  }
  dock.classList.add('dock-glow');
}

function _stopDockGlow() {
  document.getElementById('dock')?.classList.remove('dock-glow');
}

/* ════════════════════════════════════════════════════════
   PANEL DE INICIO — aparece tras la animación
   ════════════════════════════════════════════════════════ */
function _showStartPanel(onDone) {
  const panel = document.getElementById('start-panel');
  if (!panel) { onDone?.(); return; }

  // Mostrar con fade
  panel.style.display = 'flex';
  panel.style.opacity = '0';
  panel.style.transition = 'opacity 0.4s';
  requestAnimationFrame(() => { panel.style.opacity = '1'; });

  // Borde brillante en el dock para "diseño libre"
  _startDockGlow();
  if (window.lucide) lucide.createIcons({ nodes: [panel] });

  function dismiss(action) {
    _stopDockGlow();
    panel.style.opacity = '0';
    setTimeout(() => {
      panel.style.display = 'none';
      action?.();
      onDone?.();
    }, 350);
  }

  document.getElementById('start-load-plan')?.addEventListener('click', () => {
    dismiss(() => document.getElementById('btn-upload-plan')?.click());
  }, { once: true });

  document.getElementById('start-free')?.addEventListener('click', () => {
    dismiss();
  }, { once: true });
}

/* ════════════════════════════════════════════════════════
   START — punto de entrada
   ════════════════════════════════════════════════════════ */
export function start(onDone) {
  const canvas = document.createElement('canvas');
  canvas.id = 'splash-canvas';
  canvas.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:185',
    'pointer-events:none',
    'background:transparent',
  ].join(';');
  document.body.appendChild(canvas);

  setTimeout(() => {
    _runParticleAnim(canvas, () => {
      const gsap = window.gsap;
      const afterFade = () => {
        canvas.remove();
        _expandDock();
        _expandHeader();
        // Panel de inicio siempre, excepto si hay un callback externo
        // (flujo welcome/collab que ya gestiona su propio modal)
        if (onDone) {
          onDone();
        } else {
          _showStartPanel();
        }
      };

      if (gsap) {
        gsap.to(canvas, { opacity: 0, duration: FADE_MS / 1000, ease: 'power2.inOut', onComplete: afterFade });
      } else {
        canvas.style.transition = `opacity ${FADE_MS}ms`;
        canvas.style.opacity = '0';
        setTimeout(afterFade, FADE_MS);
      }
    });
  }, HOLD_MS);
}

// Grid_onda exportado para compatibilidad con cualquier uso externo
export function Grid_onda(canvas, onComplete) {
  _runParticleAnim(canvas, onComplete);
}

export const SplashScreen = { start, Grid_onda };

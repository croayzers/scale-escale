/* ─────────────────────────────────────────────────────────
   SPLASH SCREEN — Partículas que convergen en cuadrícula
   Los puntos explotan desde el centro y se ordenan en grid,
   luego hacen fade revelando la cuadrícula de la escena.
   ───────────────────────────────────────────────────────── */

const HOLD_MS   = 400;   // espera antes de arrancar
const EXPLODE_MS = 600;  // duración explosión inicial
const SETTLE_MS  = 900;  // duración convergencia al grid
const HOLD2_MS   = 500;  // pausa mostrando grid formado
const FADE_MS    = 700;  // fade out al revelar la escena

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

  // Color de puntos: blanco sobre fondo transparente
  // (el fondo de la escena se ve detrás del canvas)
  const DOT_COLOR  = '#1a1a1c';
  const DOT_RADIUS = 1.8;

  // Cuadrícula objetivo (igual que la rejilla de la escena)
  const CELL = 52;  // px entre puntos (aprox. escala escena a pantalla)
  const cols = Math.ceil(W / CELL) + 2;
  const rows = Math.ceil(H / CELL) + 2;
  const offsetX = ((W % CELL) / 2);
  const offsetY = ((H % CELL) / 2);

  // Generar posiciones destino
  const targets = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      targets.push({
        tx: offsetX + c * CELL,
        ty: offsetY + r * CELL,
      });
    }
  }

  const N = targets.length;

  // Cada partícula: posición actual + velocidad inicial aleatoria
  const cx = W / 2, cy = H / 2;
  const particles = targets.map(({ tx, ty }) => {
    // Posición inicial: explosión desde el centro con ángulo aleatorio
    const angle = Math.random() * Math.PI * 2;
    const dist  = 60 + Math.random() * Math.max(W, H) * 0.55;
    return {
      x:  cx + Math.cos(angle) * dist,
      y:  cy + Math.sin(angle) * dist,
      tx, ty,
      // opacidad inicial baja, sube al converger
      opacity: 0.05 + Math.random() * 0.2,
    };
  });

  const t0 = performance.now();
  const totalAnim = EXPLODE_MS + SETTLE_MS + HOLD2_MS; // ms hasta fade
  let raf;

  // Easing suave
  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }

  function tick() {
    raf = requestAnimationFrame(tick);
    const elapsed = performance.now() - t0;

    ctx.clearRect(0, 0, W, H);

    // Fase 1: explosión (0 → EXPLODE_MS) — partículas ya están dispersas, solo ajustamos opacidad
    // Fase 2: convergencia (EXPLODE_MS → EXPLODE_MS+SETTLE_MS)
    // Fase 3: hold (grid completo visible)

    let settleProgress = 0;
    let globalOpacity  = 1;

    if (elapsed < EXPLODE_MS) {
      // Fase explosión: puntos aparecen en sus posiciones dispersas
      settleProgress = 0;
      globalOpacity  = easeOutExpo(elapsed / EXPLODE_MS);
    } else if (elapsed < EXPLODE_MS + SETTLE_MS) {
      // Fase convergencia: mueven hacia target
      settleProgress = easeInOutCubic((elapsed - EXPLODE_MS) / SETTLE_MS);
      globalOpacity  = 1;
    } else if (elapsed < totalAnim) {
      // Hold: grid completo
      settleProgress = 1;
      globalOpacity  = 1;
    } else {
      // Terminado
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, W, H);
      onComplete?.();
      return;
    }

    ctx.fillStyle = DOT_COLOR;

    for (let i = 0; i < N; i++) {
      const p = particles[i];
      const x = p.x + (p.tx - p.x) * settleProgress;
      const y = p.y + (p.ty - p.y) * settleProgress;

      // Opacidad: combina la global con la individual, más alta al converger
      const dotOpacity = (p.opacity + settleProgress * (1 - p.opacity)) * globalOpacity;

      ctx.globalAlpha = dotOpacity;
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  tick();
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
      // Fade out del canvas para revelar la escena
      const gsap = window.gsap;
      const afterFade = () => {
        canvas.remove();
        onDone?.();
        _expandDock();
        _expandHeader();
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

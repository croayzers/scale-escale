/* ─────────────────────────────────────────────────────────
   SPLASH SCREEN + GRID_ONDA
   Pantalla de carga cinemática (logo SVG + barra GSAP)
   seguida de onda física 3D (Three.js). Una sola ejecución.
   ───────────────────────────────────────────────────────── */

const PROGRESS_MS = 2400;   // duración barra de carga
const RIPPLE_MS   = 5200;   // duración animación de onda

/* ════════════════════════════════════════════════════════
   FÍSICA DEL RIPPLE — Gaussiana + decaimiento exponencial
   Emula la disipación real de una gota de agua en 2D.
   ════════════════════════════════════════════════════════ */
function _rippleY(x, z, t) {
  if (t < 0.04) return 0;
  const r     = Math.max(0.01, Math.sqrt(x * x + z * z));
  const speed = 5.2;                      // m/s propagación
  const ringR = speed * t;               // posición del frente de onda
  const sigma = 0.42 + t * 0.36;        // anchura del anillo (crece con t)
  const amp   = 1.35 * Math.exp(-0.7 * t);          // decaimiento temporal
  const sDec  = ringR > 0.5 ? 1 / Math.sqrt(ringR / 2.8 + 1) : 1; // 2D energía
  const env   = Math.exp(-((r - ringR) ** 2) / (2 * sigma * sigma)); // envolvente
  const wave  = Math.cos(2.1 * (r - ringR));         // oscilación
  return amp * env * sDec * wave;
}

/* ════════════════════════════════════════════════════════
   GRID_ONDA — rejilla 3D con ripple físico
   Exportada para usarse externamente si se desea.
   ════════════════════════════════════════════════════════ */
export function Grid_onda(canvas, onComplete, mode = 'perspective') {
  const W = canvas.width  = window.innerWidth;
  const H = canvas.height = window.innerHeight;

  /* ── Escena Three.js ── */
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  const camera = new THREE.PerspectiveCamera(mode === 'zenith' ? 52 : 46, W / H, 0.1, 200);
  if (mode === 'zenith') {
    camera.position.set(0, 24, 0.001); // casi cenital (0.001 evita gimbal)
    camera.lookAt(0, 0, 0);
    camera.up.set(0, 0, -1);
    scene.fog = new THREE.FogExp2(0xffffff, 0.012); // niebla más suave desde arriba
  } else {
    camera.position.set(0, 12, 17);
    camera.lookAt(0, 0, 0);
    scene.fog = new THREE.FogExp2(0xffffff, 0.03);
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  /* ── Geometría buffer manual: XZ plano, Y = ripple ── */
  const SEGS = 72, SIZE = 26;
  const vArr = [], uvArr = [], iArr = [];
  for (let iz = 0; iz <= SEGS; iz++) {
    for (let ix = 0; ix <= SEGS; ix++) {
      vArr.push((ix / SEGS - 0.5) * SIZE, 0, (iz / SEGS - 0.5) * SIZE);
      uvArr.push(ix / SEGS, iz / SEGS);
    }
  }
  for (let iz = 0; iz < SEGS; iz++) {
    for (let ix = 0; ix < SEGS; ix++) {
      const a = iz * (SEGS + 1) + ix;
      iArr.push(a, a + 1, a + SEGS + 2, a, a + SEGS + 2, a + SEGS + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.Float32BufferAttribute(vArr, 3);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  geo.setIndex(iArr);
  geo.computeVertexNormals();

  /* ── Superficie sólida oscura y reflectante ── */
  const solidMat = new THREE.MeshStandardMaterial({
    color: 0xedeae4, roughness: 0.35, metalness: 0.0,
  });
  scene.add(new THREE.Mesh(geo, solidMat));

  /* ── Malla de alambre gris oscuro (misma geometría) ── */
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0xbbbbbb, wireframe: true, transparent: true, opacity: 0.45,
  });
  const wire = new THREE.Mesh(geo, wireMat);
  wire.position.y = 0.005;
  scene.add(wire);

  /* ── Luces monocromas ── */
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(5, 14, 8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcccccc, 0.4);
  fill.position.set(-7, 5, -10);
  scene.add(fill);

  /* ── Loop de animación ── */
  const t0 = performance.now();
  const totalSec = RIPPLE_MS / 1000;
  let raf;

  function tick() {
    raf = requestAnimationFrame(tick);
    const t = (performance.now() - t0) / 1000;

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, _rippleY(pos.getX(i), pos.getZ(i), t));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    renderer.render(scene, camera);

    if (t >= totalSec) {
      cancelAnimationFrame(raf);
      renderer.dispose();
      geo.dispose();
      solidMat.dispose();
      wireMat.dispose();
      onComplete?.();
    }
  }
  tick();
}

/* ════════════════════════════════════════════════════════
   SVG LOGO geométrico futurista
   ════════════════════════════════════════════════════════ */
const _LOGO = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
     width="130" height="130" style="overflow:visible">
  <!-- Anillo exterior punteado -->
  <circle cx="50" cy="50" r="44" fill="none"
          stroke="rgba(26,26,28,0.12)" stroke-width="0.6" stroke-dasharray="2.5 6"/>
  <!-- Anillo interior -->
  <circle cx="50" cy="50" r="36" fill="none"
          stroke="rgba(26,26,28,0.28)" stroke-width="0.9"/>
  <!-- E letterform -->
  <g id="logo-e" stroke="#1a1a1c" stroke-width="4" stroke-linecap="round"
     stroke-linejoin="round" fill="none">
    <line x1="32" y1="28" x2="32" y2="72"/>
    <line x1="32" y1="28" x2="68" y2="28"/>
    <line x1="32" y1="50" x2="60" y2="50"/>
    <line x1="32" y1="72" x2="68" y2="72"/>
  </g>
  <!-- Acento -->
  <circle cx="74" cy="27" r="3.2" fill="#1a1a1c" opacity="0.7"/>
  <!-- Marcadores de esquina -->
  <line x1="8"  y1="16" x2="19" y2="16" stroke="rgba(26,26,28,0.3)" stroke-width="1.1"/>
  <line x1="15" y1="9"  x2="15" y2="20" stroke="rgba(26,26,28,0.3)" stroke-width="1.1"/>
  <line x1="81" y1="16" x2="92" y2="16" stroke="rgba(26,26,28,0.3)" stroke-width="1.1"/>
  <line x1="85" y1="9"  x2="85" y2="20" stroke="rgba(26,26,28,0.3)" stroke-width="1.1"/>
  <line x1="8"  y1="84" x2="19" y2="84" stroke="rgba(26,26,28,0.3)" stroke-width="1.1"/>
  <line x1="15" y1="80" x2="15" y2="91" stroke="rgba(26,26,28,0.3)" stroke-width="1.1"/>
  <line x1="81" y1="84" x2="92" y2="84" stroke="rgba(26,26,28,0.3)" stroke-width="1.1"/>
  <line x1="85" y1="80" x2="85" y2="91" stroke="rgba(26,26,28,0.3)" stroke-width="1.1"/>
</svg>`;

/* ════════════════════════════════════════════════════════
   DOM helpers
   ════════════════════════════════════════════════════════ */
function _buildSplash() {
  const el = document.createElement('div');
  el.id = 'splash-overlay';
  el.innerHTML = `
    <div id="splash-inner">
      <div id="splash-logo">${_LOGO}</div>
      <div id="splash-wordmark">E·SCALE</div>
      <div id="splash-sub">3D Event Planning</div>
      <div id="splash-bar-wrap"><div id="splash-bar"></div></div>
    </div>`;
  document.body.appendChild(el);
  return el;
}

function _buildCanvas() {
  const c = document.createElement('canvas');
  c.id = 'splash-canvas';
  c.style.cssText = 'position:fixed;inset:0;z-index:185;opacity:0;pointer-events:none';
  document.body.appendChild(c);
  return c;
}

/* ════════════════════════════════════════════════════════
   DOCK: colapsar al inicio → expandir tras el wave
   ════════════════════════════════════════════════════════ */
export function collapseHeader() {
  const header = document.getElementById('header-mac');
  const inner  = document.getElementById('header-inner');
  if (!header || !inner) return;
  // Ocultar todo excepto el brand
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
    setTimeout(() => {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '1';
    }, i * 60);
  });
}

export function collapseDock() {
  const dock  = document.getElementById('dock');
  const items = document.getElementById('dock-items');
  const logo  = document.getElementById('dock-brand-logo');
  if (!dock) return;
  // Guardar dimensiones reales para la expansión
  dock._expandW = dock.scrollWidth + 'px';
  dock._expandH = dock.scrollHeight + 'px';
  // Colapsar
  items && (items.style.display = 'none');
  logo  && (logo.style.display  = 'flex');
  dock.classList.add('dock-collapsed');
  dock.style.cssText += `;width:52px;height:52px;border-radius:50%;padding:6px;
    overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:default;`;
}

function _expandDock() {
  const dock  = document.getElementById('dock');
  const items = document.getElementById('dock-items');
  if (!dock || items?.style.display !== 'none') return; // ya expandido

  const gsap = window.gsap;
  const targetW = dock._expandW || '';
  const targetH = dock._expandH || '';

  if (!gsap) {
    document.getElementById('dock-brand-logo').style.display = 'none';
    items && (items.style.display = '');
    dock.style.cssText = '';
    return;
  }

  const logo = document.getElementById('dock-brand-logo');

  // Fade out logo e iniciar expansión del dock
  gsap.to(logo, { opacity: 0, duration: 0.2, onComplete() {
      logo && (logo.style.display = 'none');

      // Mostrar el dock expandido de golpe (sin animación de tamaño), botones invisibles
      items && (items.style.display = '');
      const allChildren = Array.from(items.children);
      allChildren.forEach(el => { el.style.opacity = '0'; el.style.transition = 'none'; });

      dock.style.width = ''; dock.style.height = '';
      dock.style.borderRadius = ''; dock.style.padding = '';
      dock.style.overflow = ''; dock.style.cursor = '';
      dock.classList.remove('dock-collapsed');

      // Fase 2: revelar botones de 2 en 2 desde el centro
      const catButtons = allChildren.filter(el => el.dataset?.dockKind === 'category');
      const rest        = allChildren.filter(el => el.dataset?.dockKind !== 'category');

      const centerIdx  = catButtons.findIndex(b => b.dataset.cat === 'scenography');
      const pivotLeft  = centerIdx >= 0 ? centerIdx : Math.floor(catButtons.length / 2) - 1;
      const pivotRight = pivotLeft + 1;

      const pairs = [];
      let l = pivotLeft, r = pivotRight;
      while (l >= 0 || r < catButtons.length) {
        const pair = [];
        if (l >= 0)                pair.push(catButtons[l--]);
        if (r < catButtons.length) pair.push(catButtons[r++]);
        pairs.push(pair);
      }
      if (rest.length) pairs.push(rest);

      pairs.forEach((pair, i) => {
        setTimeout(() => {
          pair.forEach(el => {
            el.style.transition = 'opacity 0.6s';
            el.style.opacity = '1';
          });
        }, i * 200);
      });
    }});
}

/* ════════════════════════════════════════════════════════
   START — solo el wave, sin overlay de logo
   ════════════════════════════════════════════════════════ */
const LOGO_HOLD_MS = 2000; // tiempo que el logo del dock es visible antes del wave

export function start(onDone) {
  if (typeof THREE === 'undefined') { onDone?.(); return; }

  const canvas = _buildCanvas();

  // Esperar LOGO_HOLD_MS para que el logo del dock sea visible, luego iniciar el wave
  setTimeout(() => {
    canvas.style.opacity = '0.9';
    canvas.style.transition = 'opacity 0.9s ease';

    Grid_onda(canvas, () => {
      window.SceneManager?.startGridFade?.();
      const gsap = window.gsap;

      const afterFade = () => {
        canvas.remove();
        onDone?.();
        _expandDock();
        _expandHeader();
      };

      if (gsap) {
        gsap.to(canvas, {
          opacity: 0, duration: 0.9, ease: 'power2.inOut',
          onComplete: afterFade,
        });
      } else {
        canvas.remove();
        afterFade();
      }
    }, 'zenith');
  }, LOGO_HOLD_MS);
}

export const SplashScreen = { start, Grid_onda };

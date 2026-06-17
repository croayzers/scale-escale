import { AppState }    from '../core/AppState.js';
import { SceneManager } from '../scene/SceneManager.js';

const SKY_PRESETS = {
  day:   { hex: '#f5f3ee', fog: '#f5f3ee', label: 'Blanco día'  },
  blue:  { hex: '#bfdbfe', fog: '#bfdbfe', label: 'Azul claro'  },
  dusk:  { hex: '#1e3a5f', fog: '#1e3a5f', label: 'Azul oscuro' },
  night: { hex: '#0a0a0b', fog: '#0a0a0b', label: 'Negro noche' },
};

let _nightMode = false;
let _currentSky = 'blue';
let _currentUi  = 'light';
let _lightDeg   = 45;

function _applyUiTheme(theme) {
  _currentUi = theme;
  document.body.classList.toggle('ui-dark', theme === 'dark');
  document.querySelectorAll('.smp-ui-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.ui === theme)
  );
}

function _applySky(key) {
  _currentSky = key;
  const preset = SKY_PRESETS[key];
  if (preset) SceneManager.setSkyColor(preset.hex);
  document.querySelectorAll('.smp-swatch').forEach(b =>
    b.classList.toggle('active', b.dataset.sky === key)
  );
}

function _applyNightMode(night) {
  _nightMode = night;
  const btn = document.getElementById('btn-scene-mode');
  if (btn) {
    btn.classList.toggle('active', night);
    btn.innerHTML = night
      ? '<i data-lucide="sun" class="w-4 h-4"></i>'
      : '<i data-lucide="moon" class="w-4 h-4"></i>';
    if (window.lucide) lucide.createIcons({ nodes: [btn] });
  }
  if (night) {
    _applySky('night');
    _applyUiTheme('dark');
    _applyLightAngle(200);
    _setShadows(true);
  } else {
    _applySky('day');
    _applyUiTheme('light');
    _applyLightAngle(45);
    _setShadows(AppState.shadows ?? true);
  }
}

function _applyLightAngle(deg) {
  _lightDeg = deg;
  SceneManager.setLightAngle(deg);
  const range = document.getElementById('smp-light-range');
  const val   = document.getElementById('smp-light-deg');
  if (range) range.value = String(deg);
  if (val)   val.textContent = `${deg}°`;
}

function _setShadows(enabled) {
  AppState.shadows = enabled;
  SceneManager.applyShadowState();
  const chk = document.getElementById('smp-shadows');
  if (chk) chk.checked = enabled;
}

function _openPanel() {
  const panel = document.getElementById('scene-mode-panel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'flex';
  document.getElementById('btn-scene-mode')?.classList.toggle('active', !isOpen && _nightMode);
  if (!isOpen) {
    // Sync estado actual en los controles
    document.querySelectorAll('.smp-swatch').forEach(b =>
      b.classList.toggle('active', b.dataset.sky === _currentSky)
    );
    document.querySelectorAll('.smp-ui-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.ui === _currentUi)
    );
    const range = document.getElementById('smp-light-range');
    const val   = document.getElementById('smp-light-deg');
    if (range) range.value = String(_lightDeg);
    if (val)   val.textContent = `${_lightDeg}°`;
    const chkS = document.getElementById('smp-shadows');
    if (chkS)  chkS.checked = AppState.shadows ?? true;
    if (window.lucide) lucide.createIcons({ nodes: [panel] });
  }
}

export const SceneModeManager = {
  init() {
    const btn   = document.getElementById('btn-scene-mode');
    const panel = document.getElementById('scene-mode-panel');
    if (!btn || !panel) return;

    // Botón Luna: toggle noche / día completo
    btn.addEventListener('click', e => {
      e.stopPropagation();
      // Si el panel está cerrado, abrirlo; si está abierto y pulsamos de nuevo, toggle noche
      if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'flex';
        if (window.lucide) lucide.createIcons({ nodes: [panel] });
        // Sync
        document.querySelectorAll('.smp-swatch').forEach(b =>
          b.classList.toggle('active', b.dataset.sky === _currentSky)
        );
        document.querySelectorAll('.smp-ui-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.ui === _currentUi)
        );
        const range = document.getElementById('smp-light-range');
        const val   = document.getElementById('smp-light-deg');
        if (range) range.value = String(_lightDeg);
        if (val)   val.textContent = `${_lightDeg}°`;
        const chkS = document.getElementById('smp-shadows');
        if (chkS) chkS.checked = AppState.shadows ?? true;
      } else {
        _applyNightMode(!_nightMode);
      }
    });

    document.getElementById('smp-close')?.addEventListener('click', () => {
      panel.style.display = 'none';
    });

    // Cielo
    panel.querySelectorAll('.smp-swatch').forEach(b => {
      b.addEventListener('click', () => _applySky(b.dataset.sky));
    });

    // Interfaz
    panel.querySelectorAll('.smp-ui-btn').forEach(b => {
      b.addEventListener('click', () => _applyUiTheme(b.dataset.ui));
    });

    // Dirección luz
    document.getElementById('smp-light-range')?.addEventListener('input', e => {
      _applyLightAngle(parseInt(e.target.value));
    });

    // Sombras
    document.getElementById('smp-shadows')?.addEventListener('change', e => {
      _setShadows(e.target.checked);
    });

    // Cerrar al clicar fuera
    document.addEventListener('pointerdown', e => {
      if (!panel.contains(e.target) && e.target !== btn) {
        panel.style.display = 'none';
      }
    });

    // Cotas plano y medidas
    document.getElementById('smp-cotas-plan')?.addEventListener('change', e => {
      AppState.showPlanCotas = e.target.checked;
      document.dispatchEvent(new CustomEvent('escale:plan-cotas-changed', { detail: { visible: e.target.checked } }));
    });

    _initLabelsPanel();

    // Estado inicial
    _applyLightAngle(45);
    _applySky('blue');
  }
};

// ── Panel Etiquetas (Rótulos / Cotas) — botón propio bajo btn-scene-mode ──
function _initLabelsPanel() {
  const btn   = document.getElementById('btn-labels-mode');
  const panel = document.getElementById('labels-mode-panel');
  if (!btn || !panel) return;

  const chkR = document.getElementById('lmp-rotulos');
  const chkC = document.getElementById('lmp-cotas');

  const sync = () => {
    if (chkR) chkR.checked = AppState.showRotulos ?? true;
    if (chkC) chkC.checked = AppState.showCotas ?? false;
    btn.classList.toggle('active', !!(AppState.showRotulos || AppState.showCotas));
  };

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = panel.style.display !== 'none' && panel.style.display !== '';
    panel.style.display = open ? 'none' : 'flex';
    if (!open) { sync(); if (window.lucide) lucide.createIcons({ nodes: [panel] }); }
  });

  document.getElementById('lmp-close')?.addEventListener('click', () => {
    panel.style.display = 'none';
  });

  chkR?.addEventListener('change', e => {
    AppState.showRotulos = e.target.checked;
    SceneManager.redrawCotas();
    sync();
  });
  chkC?.addEventListener('change', e => {
    AppState.showCotas = e.target.checked;
    SceneManager.redrawCotas();
    sync();
  });

  document.addEventListener('pointerdown', e => {
    if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      panel.style.display = 'none';
    }
  });

  sync();
}

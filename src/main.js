/* ═══════════════════════════════════════════════════════════
   E-SCALE · Bootstrap principal — UI macOS
   ═══════════════════════════════════════════════════════════ */

import { AppState }           from './core/AppState.js';
import { ElementLibrary }     from './core/ElementLibrary.js';
import { SceneManager }       from './scene/SceneManager.js';
import { InteractionManager } from './scene/InteractionManager.js';
import { SnapManager }        from './scene/SnapManager.js';
import { UIManager }          from './ui/UIManager.js';
import { PlanManager }        from './io/PlanManager.js';
import { CompanyManager }     from './io/CompanyManager.js';
import { ExportManager }      from './io/ExportManager.js';
import { Dock }               from './ui/Dock.js';
import { CatalogModal }       from './ui/CatalogModal.js';
import { InventoryPanel } from './ui/InventoryPanel.js';

async function bootstrap() {
  if (typeof THREE === 'undefined') {
    document.body.innerHTML = '<pre style="padding:24px;color:#b91c1c">Error: Three.js no se cargó.</pre>';
    return;
  }

  await UIManager.init();
  await SceneManager.init();

  InteractionManager.init();
  SnapManager.init();
  PlanManager.init();
  CompanyManager.init();
  ExportManager.init();
  CatalogModal.init();
Dock.init();
  await ElementLibrary.load();

  // ── Cámara (header segmented) ──
  const camIso = document.getElementById('cam-iso');
  const camTop = document.getElementById('cam-top');
  camIso?.addEventListener('click', () => {
    SceneManager.setCamera('iso');
    camIso.classList.add('active');
    camTop.classList.remove('active');
  });
  camTop?.addEventListener('click', () => {
    SceneManager.setCamera('top');
    camTop.classList.add('active');
    camIso.classList.remove('active');
  });

// ── Cenital al subir plano o calibrar ──
  const switchToTop = () => {
    SceneManager.setCamera('top');
    document.getElementById('cam-top')?.classList.add('active');
    document.getElementById('cam-iso')?.classList.remove('active');
  };

  document.getElementById('btn-upload-plan')?.addEventListener('click', switchToTop);
  document.getElementById('btn-calibrate')?.addEventListener('click', switchToTop);

  // ── Zoom slider ──
  const zoomRange = document.getElementById('zoom-range');
  const zoomPct   = document.getElementById('zoom-pct');
  zoomRange?.addEventListener('input', () => {
    const pct = parseInt(zoomRange.value, 10);
    if (zoomPct) zoomPct.textContent = pct + '%';
    SceneManager.setZoomPercent?.(pct);
  });

  // ── Stats en header ──
  const refreshHeaderStats = () => {
    const pax = AppState.items.reduce((s, i) => s + (i.chairs || 0), 0);
    const area = AppState.items
      .filter(i => i.type === 'carpa' || i.type === 'room')
      .reduce((s, i) => s + (i.dims.length || 0) * (i.dims.width || 0), 0);
    const elPax  = document.getElementById('hdr-pax');
    const elArea = document.getElementById('hdr-area');
    if (elPax)  elPax.textContent  = pax;
    if (elArea) elArea.textContent = area.toFixed(0);

    // Mostrar/ocultar empty-hint
    document.body.classList.toggle('has-items', AppState.items.length > 0);
  };
  // Hook al refresh global
  const _origRefresh = UIManager.refresh;
  UIManager.refresh = function() {
    _origRefresh.call(UIManager);
    refreshHeaderStats();
  };
  refreshHeaderStats();

  // ── Ajustes modal (⚙) ──
  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('btn-settings')?.addEventListener('click', () => settingsModal.classList.add('visible'));
  document.getElementById('settings-close')?.addEventListener('click', () => settingsModal.classList.remove('visible'));
  document.getElementById('settings-done')?.addEventListener('click', () => settingsModal.classList.remove('visible'));

  // Toggles dentro de ajustes
  const snapToggle = document.getElementById('snap-toggle');
  snapToggle.checked = AppState.snap.enabled;
  snapToggle.addEventListener('change', () => {
    AppState.snap.enabled = snapToggle.checked;
    document.getElementById('status-snap').textContent = snapToggle.checked
      ? `SNAP ${AppState.snap.spacing}m` : 'SNAP OFF';
  });

  const cotasToggle = document.getElementById('cotas-toggle');
  cotasToggle.checked = AppState.showCotas;
  cotasToggle.addEventListener('change', () => {
    AppState.showCotas = cotasToggle.checked;
    SceneManager.drawCotas();
  });

  // ── Canvas tamaño ──
  const canvasW = document.getElementById('canvas-w');
  const canvasL = document.getElementById('canvas-l');
  const applyCanvasSize = () => {
    const w = Math.max(5, parseFloat(canvasW?.value) || 30);
    const l = Math.max(5, parseFloat(canvasL?.value) || 30);
    SceneManager.setCanvasSize(w, l);
  };
  canvasW?.addEventListener('change', applyCanvasSize);
  canvasL?.addEventListener('change', applyCanvasSize);
  applyCanvasSize();

  // ── Mover / bloquear plano ──
  const btnMovePlan = document.getElementById('btn-move-plan');
  const btnLockPlan = document.getElementById('btn-lock-plan');

  btnMovePlan?.addEventListener('click', () => {
    if (!AppState.plan.mesh) { alert('Carga un plano primero.'); return; }
    if (SceneManager.isPlanLocked()) { alert('El plano está bloqueado. Desbloquéalo primero.'); return; }
    const active = !SceneManager.isPlanMoving();
    SceneManager.setPlanMoving(active);
    btnMovePlan.classList.toggle('active', active);
    document.getElementById('scene-canvas').style.cursor = active ? 'grab' : '';
    document.getElementById('plan-move-banner').style.display = active ? 'flex' : 'none';
    if (active) {
      SceneManager.setCamera('top');
      document.getElementById('cam-top')?.classList.add('active');
      document.getElementById('cam-iso')?.classList.remove('active');
      SceneManager.setControlsEnabled(false);
    } else {
      SceneManager.setControlsEnabled(true);
    }
  });

  document.getElementById('plan-move-done')?.addEventListener('click', () => {
    SceneManager.setPlanMoving(false);
    btnMovePlan?.classList.remove('active');
    document.getElementById('scene-canvas').style.cursor = '';
    document.getElementById('plan-move-banner').style.display = 'none';
    SceneManager.setControlsEnabled(true);
  });

btnLockPlan?.addEventListener('click', () => {
    const locked = !SceneManager.isPlanLocked();
    SceneManager.setPlanLocked(locked);
    btnLockPlan.classList.toggle('active', locked);
    const icon = btnLockPlan.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', locked ? 'lock' : 'unlock');
      if (window.lucide) lucide.createIcons();
    }
    if (locked) btnMovePlan.classList.remove('active');
  });

  const shadowsToggle = document.getElementById('shadows-toggle');
  shadowsToggle.checked = AppState.shadows;
  shadowsToggle.addEventListener('change', () => {
    AppState.shadows = shadowsToggle.checked;
    SceneManager.applyShadowState();
  });

// ── Guía de pasos (plano) ──
  const steps = {
    planLoaded: false,
    calibrated: false,
    areaDefined: false,
    planMoved: false,
  };

  function updateStepDots() {
    // Punto 1: medir plano → se activa cuando se carga el plano
    const d1 = document.getElementById('step-dot-1');
    const d2 = document.getElementById('step-dot-2');
    const d3 = document.getElementById('step-dot-3');
    if (d1) d1.style.display = steps.planLoaded && !steps.calibrated ? 'block' : 'none';
    if (d2) d2.style.display = steps.calibrated && !steps.areaDefined ? 'block' : 'none';
    if (d3) d3.style.display = steps.areaDefined && !steps.planMoved ? 'block' : 'none';
  }

  // Hook: plano cargado
  const _origSetPlanTexture = SceneManager.setPlanTexture.bind(SceneManager);
  SceneManager.setPlanTexture = function(tex) {
    _origSetPlanTexture(tex);
    steps.planLoaded = true;
    updateStepDots();
  };

  // Hook: calibración completada
  const _origCancelCal = window.PlanManager?.cancelCalibration;
  document.getElementById('modal-confirm')?.addEventListener('click', () => {
    steps.calibrated = true;
    updateStepDots();
  });

  // Hook: área definida (cualquier cambio en los inputs)
  canvasW?.addEventListener('change', () => { steps.areaDefined = true; updateStepDots(); });
  canvasL?.addEventListener('change', () => { steps.areaDefined = true; updateStepDots(); });

  // Hook: plano movido
  document.getElementById('btn-move-plan')?.addEventListener('click', () => {
    if (SceneManager.isPlanMoving()) {
      steps.planMoved = true;
      updateStepDots();
    }
  });

  // Acciones masivas
  document.getElementById('lock-all-struct')?.addEventListener('click', () => {
    const STRUCT = ['room', 'arbusto', 'arbol'];
    AppState.items.filter(i => STRUCT.includes(i.type) && !i.locked).forEach(i => AppState.toggleLock(i.id));
  });
  document.getElementById('lock-all-light')?.addEventListener('click', () => {
    AppState.items.filter(i => i.type === 'cableLuces' && !i.locked).forEach(i => AppState.toggleLock(i.id));
  });
  document.getElementById('unlock-all')?.addEventListener('click', () => {
    AppState.items.filter(i => i.locked).forEach(i => AppState.toggleLock(i.id));
  });
  document.getElementById('btn-clear')?.addEventListener('click', () => {
    if (AppState.items.length === 0) return;
    if (confirm('¿Vaciar toda la escena?')) AppState.clear();
  });

  // Imprimir
  document.getElementById('btn-print')?.addEventListener('click', () => window.print());

  if (window.lucide) lucide.createIcons();

// ── Bienvenida ──
  const welcomeModal = document.getElementById('welcome-modal');

  document.getElementById('welcome-plano')?.addEventListener('click', () => {
    welcomeModal.style.display = 'none';
    // Cambiar a cenital y abrir selector de plano
    SceneManager.setCamera('top');
    document.getElementById('cam-top')?.classList.add('active');
    document.getElementById('cam-iso')?.classList.remove('active');
    document.getElementById('btn-upload-plan')?.click();
  });

  document.getElementById('welcome-plantilla')?.addEventListener('click', () => {
    welcomeModal.style.display = 'none';
    // Abrir selector de plantilla (E4c pendiente — por ahora avisa)
    alert('Próximamente: carga de plantillas guardadas.');
  });

  document.getElementById('welcome-libre')?.addEventListener('click', () => {
    welcomeModal.style.display = 'none';
  });

  if (window.lucide) lucide.createIcons();

// ── Inventario ──
  const invPanel = document.getElementById('inventory-panel');
  const btnInv   = document.getElementById('btn-inventory');
  btnInv?.addEventListener('click', () => {
    const open = invPanel.style.display !== 'none';
    invPanel.style.display = open ? 'none' : 'block';
    btnInv.classList.toggle('active', !open);
    if (!open) InventoryPanel.refresh();
  });
  document.getElementById('inventory-close')?.addEventListener('click', () => {
    invPanel.style.display = 'none';
    btnInv?.classList.remove('active');
  });
  document.getElementById('inv-export-btn')?.addEventListener('click', () => {
    document.getElementById('btn-export')?.click();
  });
  const _origRefreshInv = UIManager.refresh;
  UIManager.refresh = function() {
    _origRefreshInv.call(UIManager);
    if (invPanel?.style.display !== 'none') InventoryPanel.refresh();
  };

  console.info('[E-scale] arranque OK · UI macOS');

  console.info('[E-scale] arranque OK · UI macOS');
}

window.addEventListener('load', bootstrap);
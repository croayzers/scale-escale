import { AppState } from './core/AppState.js';
import { ElementLibrary } from './core/ElementLibrary.js';
import { SceneManager } from './scene/SceneManager.js';
import { InteractionManager } from './scene/InteractionManager.js';
import { SnapManager } from './scene/SnapManager.js';
import { UIManager } from './ui/UIManager.js';
import { InventoryPanel } from './ui/InventoryPanel.js';
import { PlanManager } from './io/PlanManager.js';
import { CompanyManager } from './io/CompanyManager.js';
import { ExportManager } from './io/ExportManager.js';
import { ShareManager } from './io/ShareManager.js';
import { Dock } from './ui/Dock.js';
import { CatalogModal } from './ui/CatalogModal.js';
import { TemplateManager } from './io/TemplateManager.js';
import { ServiceConfig } from './services/ServiceConfig.js';
import { AuthManager } from './services/AuthManager.js';
import { SubscriptionManager } from './services/SubscriptionManager.js';
import { AnalyticsManager } from './services/AnalyticsManager.js';
import { SupportManager } from './services/SupportManager.js';

async function safeInit(label, fn) {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[E-scale] ${label} no se pudo inicializar:`, error);
    return null;
  }
}

async function bootstrap() {
  if (typeof THREE === 'undefined') {
    document.body.innerHTML = '<pre style="padding:24px;color:#b91c1c">Error: Three.js no se cargo.</pre>';
    return;
  }

  await safeInit('ServiceConfig', () => ServiceConfig.init());
  await safeInit('AuthManager', () => AuthManager.init());
  await safeInit('SubscriptionManager', () => SubscriptionManager.init());
  await safeInit('AnalyticsManager', () => AnalyticsManager.init());
  await safeInit('SupportManager', () => SupportManager.init());

  await UIManager.init();
  await SceneManager.init();
  await ElementLibrary.load();

  InteractionManager.init();
  SnapManager.init();
  PlanManager.init();
  CompanyManager.init();
  ExportManager.init();
  ShareManager.init();
  CatalogModal.init();
  Dock.init();
  TemplateManager.init();
  InventoryPanel.init();

  const welcomeModal = document.getElementById('welcome-modal');
  const inventoryPanel = document.getElementById('inventory-panel');
  const zoomRange = document.getElementById('zoom-range');
  const zoomPct = document.getElementById('zoom-pct');
  const camIso = document.getElementById('cam-iso');
  const camTop = document.getElementById('cam-top');
  const canvasW = document.getElementById('canvas-w');
  const canvasL = document.getElementById('canvas-l');
  const settingsModal = document.getElementById('settings-modal');
  const btnMovePlan = document.getElementById('btn-move-plan');
  const btnLockPlan = document.getElementById('btn-lock-plan');

  const state = {
    inventoryOpen: false,
    planGuideDismissed: false,
    steps: {
      planLoaded: false,
      calibrated: false,
      areaDefined: false,
      planMoved: false
    }
  };

  const setTopCamera = () => {
    SceneManager.setCamera('top');
    camTop?.classList.add('active');
    camIso?.classList.remove('active');
  };

  const setIsoCamera = () => {
    SceneManager.setCamera('iso');
    camIso?.classList.add('active');
    camTop?.classList.remove('active');
  };

  const syncZoomUi = percent => {
    if (zoomRange) zoomRange.value = String(percent);
    if (zoomPct) zoomPct.textContent = `${percent}%`;
  };

  const refreshHeaderStats = () => {
    const pax = AppState.items.reduce((sum, item) => sum + (item.chairs || 0), 0);
    const area = AppState.items
      .filter(item => item.type === 'carpa' || item.type === 'room')
      .reduce((sum, item) => sum + (item.dims.length || 0) * (item.dims.width || 0), 0);

    document.getElementById('hdr-pax').textContent = String(pax);
    document.getElementById('hdr-area').textContent = area.toFixed(0);
    document.body.classList.toggle('has-items', AppState.items.length > 0);
  };

  const baseRefresh = UIManager.refresh.bind(UIManager);
  UIManager.refresh = function refreshUi() {
    baseRefresh();
    refreshHeaderStats();
    InventoryPanel.refresh();
  };

  const setInventoryOpen = open => {
    state.inventoryOpen = open;
    if (inventoryPanel) inventoryPanel.style.display = open ? 'block' : 'none';
    Dock.setInventoryActive(open);
    AppState.inventoryCollapsed = !open;
    if (open) InventoryPanel.refresh();
  };

  const markPlanMovedComplete = () => {
    if (!state.steps.planLoaded || !state.steps.calibrated) return;
    state.steps.areaDefined = true;
    state.steps.planMoved = true;
    updatePlanGuide();
  };

  const setGuideStepState = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.dataset.state = value;
  };

  const pulseGuideTarget = (...targets) => {
    targets.filter(Boolean).forEach(target => {
      target.classList.remove('guide-pulse');
      void target.offsetWidth;
      target.classList.add('guide-pulse');
      setTimeout(() => target.classList.remove('guide-pulse'), 1800);
    });
  };

  const updatePlanGuide = () => {
    const guide = document.getElementById('plan-guide');
    if (!guide) return;

    guide.classList.toggle('hidden', !state.steps.planLoaded || state.planGuideDismissed);
    setGuideStepState('guide-step-calibrate', state.steps.calibrated ? 'done' : 'active');
    setGuideStepState(
      'guide-step-area',
      state.steps.areaDefined ? 'done' : state.steps.calibrated ? 'active' : 'waiting'
    );
    setGuideStepState(
      'guide-step-move',
      state.steps.planMoved ? 'done' : state.steps.areaDefined ? 'active' : 'waiting'
    );
    setGuideStepState('guide-step-catalog', state.steps.planMoved ? 'active' : 'waiting');

    const nextText = document.getElementById('plan-guide-next-text');
    if (nextText) {
      nextText.textContent = !state.steps.calibrated
        ? 'Pulsa la regla, marca dos puntos del plano y escribe la medida real.'
        : !state.steps.areaDefined
          ? 'Define el area que ocupara el evento.'
          : !state.steps.planMoved
            ? 'Mueve el area sobre el plano y confirma con Listo.'
            : 'Ya puedes colocar objetos desde la barra inferior.';
    }

    const guideArea = document.getElementById('guide-area-btn');
    const guideMove = document.getElementById('guide-move-btn');
    const guideCatalog = document.getElementById('guide-catalog-btn');
    if (guideArea) guideArea.disabled = !state.steps.calibrated;
    if (guideMove) guideMove.disabled = !state.steps.calibrated;
    if (guideCatalog) guideCatalog.disabled = !state.steps.planMoved;

    const dot1 = document.getElementById('step-dot-1');
    const dot2 = document.getElementById('step-dot-2');
    const dot3 = document.getElementById('step-dot-3');
    if (dot1) dot1.style.display = state.steps.planLoaded && !state.steps.calibrated ? 'block' : 'none';
    if (dot2) dot2.style.display = state.steps.calibrated && !state.steps.areaDefined ? 'block' : 'none';
    if (dot3) dot3.style.display = state.steps.areaDefined && !state.steps.planMoved ? 'block' : 'none';
  };

  const originalSetPlanTexture = SceneManager.setPlanTexture.bind(SceneManager);
  SceneManager.setPlanTexture = texture => {
    originalSetPlanTexture(texture);
    state.steps.planLoaded = true;
    state.steps.calibrated = false;
    state.steps.areaDefined = false;
    state.steps.planMoved = false;
    state.planGuideDismissed = false;
    updatePlanGuide();
  };

  document.addEventListener('escale:zoom-changed', event => {
    syncZoomUi(event.detail.percent);
  });
  document.addEventListener('escale:toggle-inventory', () => {
    setInventoryOpen(!state.inventoryOpen);
  });
  document.addEventListener('escale:inventory-close', () => {
    if (state.inventoryOpen) setInventoryOpen(false);
  });
  document.addEventListener('escale:plan-calibrated', () => {
    state.steps.calibrated = true;
    updatePlanGuide();
  });

  camIso?.addEventListener('click', setIsoCamera);
  camTop?.addEventListener('click', setTopCamera);
  document.getElementById('btn-upload-plan')?.addEventListener('click', setTopCamera);
  document.getElementById('btn-calibrate')?.addEventListener('click', setTopCamera);

  zoomRange?.addEventListener('input', () => {
    SceneManager.setZoomPercent(parseInt(zoomRange.value, 10));
  });
  syncZoomUi(100);

  document.getElementById('inventory-close')?.addEventListener('click', () => setInventoryOpen(false));
  document.getElementById('inv-export-btn')?.addEventListener('click', () => {
    document.getElementById('btn-export')?.click();
  });

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    settingsModal?.classList.add('visible');
  });
  document.getElementById('settings-close')?.addEventListener('click', () => {
    settingsModal?.classList.remove('visible');
  });
  document.getElementById('settings-done')?.addEventListener('click', () => {
    settingsModal?.classList.remove('visible');
  });

  const snapToggle = document.getElementById('snap-toggle');
  if (snapToggle) {
    snapToggle.checked = AppState.snap.enabled;
    snapToggle.addEventListener('change', () => {
      AppState.snap.enabled = snapToggle.checked;
      document.getElementById('status-snap').textContent = snapToggle.checked
        ? `SNAP ${AppState.snap.spacing}m`
        : 'SNAP OFF';
    });
  }

  const cotasToggle = document.getElementById('cotas-toggle');
  if (cotasToggle) {
    cotasToggle.checked = AppState.showCotas;
    cotasToggle.addEventListener('change', () => {
      AppState.showCotas = cotasToggle.checked;
      SceneManager.drawCotas();
    });
  }

  const shadowsToggle = document.getElementById('shadows-toggle');
  if (shadowsToggle) {
    shadowsToggle.checked = AppState.shadows;
    shadowsToggle.addEventListener('change', () => {
      AppState.shadows = shadowsToggle.checked;
      SceneManager.applyShadowState();
    });
  }

  const applyCanvasSize = () => {
    const width = Math.max(5, parseFloat(canvasW?.value) || 30);
    const length = Math.max(5, parseFloat(canvasL?.value) || 30);
    SceneManager.setCanvasSize(width, length);
    state.steps.areaDefined = true;
    updatePlanGuide();
  };

  canvasW?.addEventListener('change', applyCanvasSize);
  canvasL?.addEventListener('change', applyCanvasSize);
  applyCanvasSize();

  btnMovePlan?.addEventListener('click', () => {
    if (!AppState.plan.mesh) {
      alert('Carga un plano primero.');
      return;
    }
    if (SceneManager.isPlanLocked()) {
      alert('El plano esta bloqueado. Desbloquealo primero.');
      return;
    }

    const active = !SceneManager.isPlanMoving();
    SceneManager.setPlanMoving(active);
    btnMovePlan.classList.toggle('active', active);
    document.getElementById('scene-canvas').style.cursor = active ? 'grab' : '';
    document.getElementById('plan-move-banner').style.display = active ? 'flex' : 'none';

    if (active) {
      setTopCamera();
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
    markPlanMovedComplete();
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
    if (locked) btnMovePlan?.classList.remove('active');
  });

  document.getElementById('plan-guide-close')?.addEventListener('click', () => {
    state.planGuideDismissed = true;
    updatePlanGuide();
  });
  document.getElementById('guide-calibrate-btn')?.addEventListener('click', () => {
    document.getElementById('btn-calibrate')?.click();
  });
  document.getElementById('guide-area-btn')?.addEventListener('click', () => {
    state.steps.areaDefined = true;
    updatePlanGuide();
    pulseGuideTarget(canvasW, canvasL);
    canvasW?.focus();
  });
  document.getElementById('guide-move-btn')?.addEventListener('click', () => {
    state.steps.areaDefined = true;
    updatePlanGuide();
    btnMovePlan?.click();
  });
  document.getElementById('guide-catalog-btn')?.addEventListener('click', () => {
    pulseGuideTarget(document.getElementById('dock'));
    document.querySelector('#dock-items button[data-dock-kind="category"]')?.click();
  });

  document.getElementById('lock-all-struct')?.addEventListener('click', () => {
    const structureTypes = ['room', 'arbusto', 'arbol'];
    AppState.items
      .filter(item => structureTypes.includes(item.type) && !item.locked)
      .forEach(item => AppState.toggleLock(item.id));
  });
  document.getElementById('lock-all-light')?.addEventListener('click', () => {
    AppState.items
      .filter(item => item.type === 'cableLuces' && !item.locked)
      .forEach(item => AppState.toggleLock(item.id));
  });
  document.getElementById('unlock-all')?.addEventListener('click', () => {
    AppState.items
      .filter(item => item.locked)
      .forEach(item => AppState.toggleLock(item.id));
  });
  document.getElementById('btn-clear')?.addEventListener('click', () => {
    if (AppState.items.length === 0) return;
    if (confirm('¿Vaciar toda la escena?')) AppState.clear();
  });

  document.getElementById('btn-print')?.addEventListener('click', () => window.print());

  const openAfterWelcome = () => {
    setInventoryOpen(true);
    CompanyManager.requestAfterWelcome();
  };

  document.getElementById('welcome-plano')?.addEventListener('click', () => {
    if (welcomeModal) welcomeModal.style.display = 'none';
    setTopCamera();
    document.getElementById('btn-upload-plan')?.click();
    void AnalyticsManager.track('welcome_choice', { mode: 'plano_2d' });
    openAfterWelcome();
  });
  document.getElementById('welcome-libre')?.addEventListener('click', () => {
    if (welcomeModal) welcomeModal.style.display = 'none';
    void AnalyticsManager.track('welcome_choice', { mode: 'diseno_libre' });
    openAfterWelcome();
  });
  document.getElementById('welcome-plantilla')?.addEventListener('click', () => {
    if (welcomeModal) welcomeModal.style.display = 'none';
    void AnalyticsManager.track('welcome_choice', { mode: 'plantilla' });
    openAfterWelcome();
  });

  refreshHeaderStats();
  InventoryPanel.refresh();
  updatePlanGuide();
  if (window.lucide) lucide.createIcons();

  console.info('[E-scale] arranque OK');
}

window.addEventListener('load', bootstrap);

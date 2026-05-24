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
import { HeaderActionMenus } from './ui/HeaderActionMenus.js';
import { ZoneManager } from './ui/ZoneManager.js';
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

  await safeInit('InteractionManager', () => InteractionManager.init());
  await safeInit('SnapManager', () => SnapManager.init());
  await safeInit('PlanManager', () => PlanManager.init());
  await safeInit('CompanyManager', () => CompanyManager.init());
  await safeInit('ExportManager', () => ExportManager.init());
  await safeInit('ShareManager', () => ShareManager.init());
  await safeInit('CatalogModal', () => CatalogModal.init());
  await safeInit('Dock', () => Dock.init());
  await safeInit('TemplateManager', () => TemplateManager.init());
  await safeInit('HeaderActionMenus', () => HeaderActionMenus.init());
  await safeInit('ZoneManager', () => ZoneManager.init());
  await safeInit('InventoryPanel', () => InventoryPanel.init());

  const welcomeModal = document.getElementById('welcome-modal');
  const inventoryPanel = document.getElementById('inventory-panel');
  const inventoryEventName = document.getElementById('inventory-event-name');
  const zoomRange = document.getElementById('zoom-range');
  const zoomPct = document.getElementById('zoom-pct');
  const camIso = document.getElementById('cam-iso');
  const camTop = document.getElementById('cam-top');
  const settingsModal = document.getElementById('settings-modal');
  const btnMovePlan = document.getElementById('btn-move-plan');
  const btnLockPlan = document.getElementById('btn-lock-plan');
  let welcomeUnlocked = false;

  const state = {
    inventoryOpen: false,
    planGuideDismissed: false,
    steps: {
      planLoaded: false,
      calibrated: false,
      gridAdjusted: false
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
    Dock.setInventoryReady(AppState.items.length > 0);
  };

  const baseRefresh = UIManager.refresh.bind(UIManager);
  UIManager.refresh = function refreshUi() {
    baseRefresh();
    refreshHeaderStats();
    InventoryPanel.refresh();
  };

  const setInventoryOpen = (open, { announce = true } = {}) => {
    if (open && announce) {
      document.dispatchEvent(new CustomEvent('escale:scene-overlay-open', {
        detail: { kind: 'inventory', key: 'inventory' }
      }));
    }
    state.inventoryOpen = open;
    if (inventoryPanel) inventoryPanel.style.display = open ? 'block' : 'none';
    Dock.setInventoryActive(open);
    AppState.inventoryCollapsed = !open;
    if (open) InventoryPanel.refresh();
  };

  const getZoneCount = () => AppState.items.filter(item => item.type === 'zone').length;

  const markGridAdjustedComplete = () => {
    if (!state.steps.planLoaded || !state.steps.calibrated) return;
    state.steps.gridAdjusted = true;
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

    const zoneCount = getZoneCount();
    const zonesReady = zoneCount > 0;

    guide.classList.toggle('hidden', !state.steps.planLoaded || state.planGuideDismissed);
    setGuideStepState('guide-step-calibrate', state.steps.calibrated ? 'done' : 'active');
    setGuideStepState(
      'guide-step-zones',
      zonesReady ? 'done' : state.steps.calibrated ? 'active' : 'waiting'
    );
    setGuideStepState(
      'guide-step-grid',
      state.steps.gridAdjusted ? 'done' : zonesReady ? 'active' : 'waiting'
    );
    setGuideStepState('guide-step-catalog', state.steps.gridAdjusted ? 'active' : 'waiting');

    const nextText = document.getElementById('plan-guide-next-text');
    if (nextText) {
      if (AppState.calibration.active) {
        nextText.textContent = AppState.calibration.p1
          ? 'Segundo punto: marca el otro extremo de la referencia. Al segundo click se pedira la medida real.'
          : 'Primer punto: marca el inicio de la referencia que quieras usar para calibrar.';
      } else {
        nextText.textContent = !state.steps.calibrated
          ? 'Pulsa Medir plano y calibra con una referencia real del plano.'
          : !zonesReady
            ? 'Abre Zonas y dibuja una o varias zonas operativas sobre el plano.'
            : !state.steps.gridAdjusted
              ? 'Abre Grid y mueve la rejilla hasta hacerla coincidir con el plano.'
              : 'Ya puedes colocar objetos desde la barra inferior.';
      }
    }

    const guideZones = document.getElementById('guide-zones-btn');
    const guideGrid = document.getElementById('guide-grid-btn');
    const guideCatalog = document.getElementById('guide-catalog-btn');
    if (guideZones) guideZones.disabled = !state.steps.calibrated;
    if (guideGrid) guideGrid.disabled = !state.steps.calibrated || !zonesReady;
    if (guideCatalog) guideCatalog.disabled = !state.steps.gridAdjusted;

    const dot1 = document.getElementById('step-dot-1');
    const dot2 = document.getElementById('step-dot-2');
    const dot3 = document.getElementById('step-dot-3');
    if (dot1) dot1.style.display = state.steps.planLoaded && !state.steps.calibrated ? 'block' : 'none';
    if (dot2) dot2.style.display = state.steps.calibrated && !zonesReady ? 'block' : 'none';
    if (dot3) dot3.style.display = zonesReady && !state.steps.gridAdjusted ? 'block' : 'none';
  };

  const originalSetPlanTexture = SceneManager.setPlanTexture.bind(SceneManager);
  SceneManager.setPlanTexture = texture => {
    originalSetPlanTexture(texture);
    state.steps.planLoaded = true;
    state.steps.calibrated = false;
    state.steps.gridAdjusted = false;
    state.planGuideDismissed = false;
    document.getElementById('guide-calibration-point-1').textContent = 'Pendiente';
    document.getElementById('guide-calibration-point-2').textContent = 'Pendiente';
    document.getElementById('guide-calibration-result').textContent = 'Sin calibrar';
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
  document.addEventListener('escale:scene-insights-changed', () => {
    updatePlanGuide();
  });
  document.addEventListener('escale:plan-calibrated', () => {
    state.steps.calibrated = true;
    updatePlanGuide();
  });
  document.addEventListener('escale:plan-calibration-progress', event => {
    const point1 = document.getElementById('guide-calibration-point-1');
    const point2 = document.getElementById('guide-calibration-point-2');
    const result = document.getElementById('guide-calibration-result');
    if (point1 && event.detail?.point1) point1.textContent = event.detail.point1;
    if (point2 && event.detail?.point2) point2.textContent = event.detail.point2;
    if (result && event.detail?.result) result.textContent = event.detail.result;
    updatePlanGuide();
  });

  camIso?.addEventListener('click', setIsoCamera);
  camTop?.addEventListener('click', setTopCamera);
  document.getElementById('btn-upload-plan')?.addEventListener('click', setTopCamera);
  document.getElementById('btn-calibrate')?.addEventListener('click', () => {
    state.planGuideDismissed = false;
    setTopCamera();
    updatePlanGuide();
  });

  zoomRange?.addEventListener('input', () => {
    SceneManager.setZoomPercent(parseInt(zoomRange.value, 10));
  });
  syncZoomUi(100);

  document.getElementById('inventory-close')?.addEventListener('click', () => setInventoryOpen(false));
  document.getElementById('inv-export-btn')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('escale:open-print-menu'));
  });
  inventoryEventName?.addEventListener('input', () => {
    AppState.emitSceneInsights('event-name');
    const templateMeta = TemplateManager.getCurrentTemplateMeta();
    if (templateMeta.source === 'scene') {
      TemplateManager.setCurrentTemplateMeta({
        name: inventoryEventName.value.trim() || 'Escena actual'
      });
    }
  });

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('escale:scene-overlay-open', {
      detail: { kind: 'settings', key: 'settings' }
    }));
    settingsModal?.classList.add('visible');
  });
  document.getElementById('settings-close')?.addEventListener('click', () => {
    settingsModal?.classList.remove('visible');
  });
  document.getElementById('settings-done')?.addEventListener('click', () => {
    settingsModal?.classList.remove('visible');
  });

  document.addEventListener('escale:scene-overlay-open', event => {
    const kind = event.detail?.kind || '';
    if (kind !== 'inventory' && state.inventoryOpen) setInventoryOpen(false, { announce: false });
    if (kind !== 'settings') settingsModal?.classList.remove('visible');
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

  btnMovePlan?.addEventListener('click', () => {
    if (!AppState.plan.mesh) {
      alert('Carga un plano primero.');
      return;
    }
    if (SceneManager.isPlanLocked()) {
      alert('La rejilla esta bloqueada. Desbloqueala primero.');
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
    ZoneManager.refreshGridMenu();
  });

  document.getElementById('plan-move-done')?.addEventListener('click', () => {
    SceneManager.setPlanMoving(false);
    btnMovePlan?.classList.remove('active');
    document.getElementById('scene-canvas').style.cursor = '';
    document.getElementById('plan-move-banner').style.display = 'none';
    SceneManager.setControlsEnabled(true);
    markGridAdjustedComplete();
    AppState.emitSceneInsights('grid-move');
    ZoneManager.refreshGridMenu();
  });

  btnLockPlan?.addEventListener('click', () => {
    const locked = !SceneManager.isPlanLocked();
    SceneManager.setPlanLocked(locked);
    btnLockPlan.classList.toggle('active', locked);
    if (locked) {
      btnMovePlan?.classList.remove('active');
      document.getElementById('scene-canvas').style.cursor = '';
      document.getElementById('plan-move-banner').style.display = 'none';
      SceneManager.setControlsEnabled(true);
    }
    ZoneManager.refreshGridMenu();
  });

  document.getElementById('plan-guide-close')?.addEventListener('click', () => {
    state.planGuideDismissed = true;
    updatePlanGuide();
  });
  document.getElementById('guide-calibrate-btn')?.addEventListener('click', () => {
    document.getElementById('btn-calibrate')?.click();
  });
  document.getElementById('guide-zones-btn')?.addEventListener('click', () => {
    HeaderActionMenus.openMenu('zones');
    pulseGuideTarget(document.getElementById('btn-zones-menu'));
  });
  document.getElementById('guide-grid-btn')?.addEventListener('click', () => {
    HeaderActionMenus.openMenu('grid');
    pulseGuideTarget(document.getElementById('btn-grid-menu'), btnMovePlan);
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

  const openAfterWelcome = () => {
    setInventoryOpen(true);
  };

  document.addEventListener('escale:onboarding-company-complete', () => {
    welcomeUnlocked = true;
    if (welcomeModal) welcomeModal.style.display = 'flex';
  });

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
  AppState.emitSceneInsights('bootstrap');
  if (!welcomeUnlocked && welcomeModal) welcomeModal.style.display = 'none';
  if (window.lucide) lucide.createIcons();

  console.info('[E-scale] arranque OK');
}

window.addEventListener('load', bootstrap);

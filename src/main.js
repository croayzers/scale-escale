import { AppState } from './core/AppState.js';
import { ElementLibrary } from './core/ElementLibrary.js';
import { LayerManager } from './core/LayerManager.js';
import { SceneManager } from './scene/SceneManager.js';
import { InteractionManager } from './scene/InteractionManager.js';
import { SelectionManager } from './scene/SelectionManager.js';
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
import { PlansModal } from './ui/PlansModal.js';
import { TextSanitizer } from './ui/TextSanitizer.js';
import { TemplateManager } from './io/TemplateManager.js';
import { ServiceConfig } from './services/ServiceConfig.js';
import { AuthManager } from './services/AuthManager.js';
import { BrandConfig } from './services/BrandConfig.js';
import { SubscriptionManager } from './services/SubscriptionManager.js';
import { AnalyticsManager } from './services/AnalyticsManager.js';
import { SupportManager } from './services/SupportManager.js';
import { MessageManager } from './services/MessageManager.js';
import { FeedbackModal } from './ui/FeedbackModal.js';
import { AppBridge } from './core/AppBridge.js';
import { CollabManager }       from './services/CollabManager.js';
import { CollabInviteModal }   from './ui/CollabInviteModal.js';
import { CollabJoinModal }     from './ui/CollabJoinModal.js';
import { CollabIsland }        from './ui/CollabIsland.js';
import { CollabInteractions }  from './services/CollabInteractions.js';
import { SavedGroupLibrary }   from './core/SavedGroupLibrary.js';
import { SavedGroupPanel }     from './ui/SavedGroupPanel.js';
import { OrgContentManager }  from './services/OrgContentManager.js';
import { MeasureManager }     from './ui/MeasureManager.js';
import { PlanSaveModal }      from './ui/PlanSaveModal.js';
import { PredictiveArray }    from './ui/PredictiveArray.js';
import { SplashScreen, collapseDock } from './ui/SplashScreen.js';
import { ContextSpawnMenu }  from './ui/ContextSpawnMenu.js';

function showStartupError(label, error) {
  console.error(`[E-scale] ${label} falló:`, error);
  const msg = `[${label}] ${error?.stack || error?.message || String(error)}`;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#b91c1c;color:#fff;padding:16px 20px;z-index:99999;font:13px/1.5 monospace;white-space:pre-wrap;word-break:break-all;max-height:50vh;overflow:auto';
  d.textContent = msg;
  document.body?.prepend(d);
}

async function safeInit(label, fn) {
  try {
    return await fn();
  } catch (error) {
    showStartupError(label, error);
    return null;
  }
}

async function bootstrap() {
  const isCollabInvite = Boolean(new URLSearchParams(window.location.search).get('collab'));

  if (typeof THREE === 'undefined') {
    document.body.innerHTML = '<pre style="padding:24px;color:#b91c1c">Error: Three.js no se cargo.</pre>';
    return;
  }

  await safeInit('BrandConfig', () => BrandConfig.load());
  await safeInit('ServiceConfig', () => ServiceConfig.init());
  await safeInit('AuthManager', () => AuthManager.init());
  await safeInit('SubscriptionManager', () => SubscriptionManager.init());
  await safeInit('AnalyticsManager', () => AnalyticsManager.init());
  await safeInit('SupportManager', () => SupportManager.init());
  await safeInit('TextSanitizer', () => TextSanitizer.init());

  await safeInit('UIManager', () => UIManager.init());
  await safeInit('SceneManager', () => SceneManager.init());
  await safeInit('ElementLibrary', () => ElementLibrary.load());

  await safeInit('InteractionManager', () => InteractionManager.init());
  await safeInit('LayerManager', () => LayerManager.init());
  await safeInit('SnapManager', () => SnapManager.init());
  await safeInit('PlanManager', () => PlanManager.init());
  await safeInit('CompanyManager', () => CompanyManager.init());
  await safeInit('ExportManager', () => ExportManager.init());
  await safeInit('ShareManager', () => ShareManager.init());
  await safeInit('CatalogModal', () => CatalogModal.init());
  await safeInit('Dock', () => Dock.init());
  collapseDock();
  await safeInit('TemplateManager', () => TemplateManager.init());
  await safeInit('HeaderActionMenus', () => HeaderActionMenus.init());
  await safeInit('PlansModal', () => PlansModal.init());
  await safeInit('ZoneManager', () => ZoneManager.init());
  await safeInit('InventoryPanel', () => InventoryPanel.init());
  safeInit('SavedGroupLibrary', () => SavedGroupLibrary.load());
  safeInit('SavedGroupPanel', () => SavedGroupPanel.init());
  safeInit('MessageManager', () => MessageManager.init());
  safeInit('FeedbackModal',  () => FeedbackModal.init());
  safeInit('PlanSaveModal',  () => PlanSaveModal.init());
  AppBridge.init();
  // AICopilot disabled
  safeInit('ContextSpawnMenu', () => ContextSpawnMenu.init());
  safeInit('CollabJoinModal',    () => CollabJoinModal.init());
  safeInit('CollabInviteModal',  () => CollabInviteModal.init());
  safeInit('CollabIsland',       () => CollabIsland.init());
  safeInit('CollabInteractions', () => CollabInteractions.init());
  await safeInit('CollabManager', () => CollabManager.init());

  // Exponer al window para acceso desde consola y botones inline
  window.InteractionManager = InteractionManager;
  window.SelectionManager   = SelectionManager;
  window.SceneManager       = SceneManager;

  document.addEventListener('escale:collab-joined', e => {
    CollabIsland.show();
    // Ensure app is in a usable state for the guest
    if (!AppState.workMode) AppState.workMode = 'base';
    if (welcomeModal) welcomeModal.style.display = 'none';
    const wm = document.getElementById('work-mode-modal');
    if (wm) wm.style.display = 'none';
  });
  const _openCollab = (e) => {
    const btn = e?.currentTarget;
    if (btn && !btn.classList.contains('collab-spinning')) {
      btn.classList.add('collab-spinning');
      setTimeout(() => btn.classList.remove('collab-spinning'), 10000);
    }
    CollabInviteModal.open();
  };
  document.getElementById('btn-collab')?.addEventListener('click', _openCollab);
  document.getElementById('print-menu-collab-btn')?.addEventListener('click', _openCollab);

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
      calibrated: false
    }
  };

  // Expose reactive state for AppBridge
  window.__ESCALE_STATE__ = state.steps;

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
      .filter(item => item.type === 'zone')
      .reduce((sum, item) => sum + (item.dims?.length || 0) * (item.dims?.width || 0), 0);

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

  const setGuideStepState = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.dataset.state = value;
  };

  // ── Onboarding ring pulse manager ──────────────────────────────────────────
  const onboardPulse = (() => {
    const timers = {};
    const start = (id, ms = 15000) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('onboard-pulse');
      void el.offsetWidth;
      el.classList.add('onboard-pulse');
      clearTimeout(timers[id]);
      timers[id] = setTimeout(() => el.classList.remove('onboard-pulse'), ms);
    };
    const stop = id => {
      clearTimeout(timers[id]);
      document.getElementById(id)?.classList.remove('onboard-pulse');
    };
    return { start, stop };
  })();

  // Pulse the upload button immediately on load for 15 s
  onboardPulse.start('btn-upload-plan', 15000);

  // ── Calibration hint banner ─────────────────────────────────────────────────
  const CAL_BANNER_MSGS = {
    start:   `<span class="cal-banner-icon">📐</span><span class="cal-banner-text">No te preocupes por la escala del plano. Haz clic en el primer punto de una referencia conocida (una pared, una mesa, un pasillo…)</span>`,
    point1:  `<span class="cal-banner-icon">📍</span><span class="cal-banner-text">¡Ey!! Adivinanza: ¿cuánto mide lo que acabas de marcar? Haz clic en el segundo extremo de esa referencia.</span>`,
    point2:  `<span class="cal-banner-icon">📏</span><span class="cal-banner-text">Introduce el número — la distancia real en metros de esa referencia — y pulsa <span class="cal-arrow">↵ Aceptar</span>.</span>`,
    success: `<span class="cal-banner-icon">✅</span><span class="cal-banner-text">¡Listo! Ya tienes el plano a medida real. Te recomendamos que coloques una <strong>Zona</strong> para delimitar el espacio operativo.</span>`,
  };

  let calBannerTimer = null;
  const showCalBanner = (html, autoHideMs = 0) => {
    const el = document.getElementById('cal-banner');
    if (!el) return;
    clearTimeout(calBannerTimer);
    el.innerHTML = `<div class="cal-banner-body">${html}<button class="cal-banner-close" aria-label="Cerrar">✕</button></div>`;
    el.classList.remove('hidden');
    if (autoHideMs > 0) calBannerTimer = setTimeout(() => el.classList.add('hidden'), autoHideMs);
  };
  const hideCalBanner = () => {
    clearTimeout(calBannerTimer);
    document.getElementById('cal-banner')?.classList.add('hidden');
  };

  document.addEventListener('click', e => {
    if (e.target.closest('.cal-banner-close')) hideCalBanner();
  });

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
    setGuideStepState('guide-step-catalog', zonesReady ? 'active' : 'waiting');

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
            : 'Ya puedes colocar objetos desde la barra inferior.';
      }
    }

    const guideZones = document.getElementById('guide-zones-btn');
    const guideCatalog = document.getElementById('guide-catalog-btn');
    if (guideZones) guideZones.disabled = !state.steps.calibrated;
    if (guideCatalog) guideCatalog.disabled = !zonesReady;

    // Pulse the border of whichever step card is currently active
    ['guide-step-calibrate', 'guide-step-zones', 'guide-step-catalog'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('step-onboard-pulse', el.dataset.state === 'active');
    });

    const dot1 = document.getElementById('step-dot-1');
    const dot2 = document.getElementById('step-dot-2');
    if (dot1) dot1.style.display = state.steps.planLoaded && !state.steps.calibrated ? 'block' : 'none';
    if (dot2) dot2.style.display = state.steps.calibrated && !zonesReady ? 'block' : 'none';
  };

  const originalSetPlanTexture = SceneManager.setPlanTexture.bind(SceneManager);
  SceneManager.setPlanTexture = texture => {
    originalSetPlanTexture(texture);
    onboardPulse.stop('btn-upload-plan');
    state.steps.planLoaded = true;
    state.planGuideDismissed = false;

    if (window._skipCalibrationDemo) {
      // Plano desde búsqueda: ya viene calibrado, saltar directamente a Zonas
      window._skipCalibrationDemo = false;
      state.steps.calibrated = true;
      updatePlanGuide();
    } else {
      // Plano local: pedir calibración
      state.steps.calibrated = false;
      onboardPulse.start('btn-calibrate', 15000);
      document.getElementById('guide-calibration-point-1').textContent = 'Pendiente';
      document.getElementById('guide-calibration-point-2').textContent = 'Pendiente';
      document.getElementById('guide-calibration-result').textContent = 'Sin calibrar';
      updatePlanGuide();
      setTimeout(() => openCalibrationDemo(), 500);
    }
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
  document.addEventListener('escale:scene-insights-changed', e => {
    updatePlanGuide();
    const reason = e.detail?.reason;
    // Trackear último tipo añadido para el menú de spawn rápido
    if (reason === 'add') {
      const last = AppState.items[AppState.items.length - 1];
      if (last?.type) ContextSpawnMenu.pushToHistory(last.type);
    }
    if (['select', 'select-many', 'deselect', 'add', 'remove', 'undo'].includes(reason)) {
      PredictiveArray.onSelectionChanged();
    }
  });
  document.addEventListener('escale:plan-calibrated', () => {
    onboardPulse.stop('btn-calibrate');
    state.steps.calibrated = true;
    showCalBanner(CAL_BANNER_MSGS.success, 5000);
    onboardPulse.start('btn-zones-menu', 10000);
    updatePlanGuide();
    // Abrir modal de guardado tras calibrar
    setTimeout(() => PlanSaveModal.open(), 900);
  });

  // Flujo "Buscar plano": plano org cargado → calibración ya hecha → abrir Zonas
  document.addEventListener('escale:org-plan-loaded', () => {
    // Marcar calibración como completada (el plano ya viene con dimensiones)
    state.steps.calibrated = true;
    updatePlanGuide();
    setTimeout(() => {
      HeaderActionMenus.openMenu('zones');
    }, 400);
  });

  // Glow del botón inventario tras guardar plano
  document.addEventListener('escale:open-inventory-glow', () => {
    setInventoryOpen(true);
    const btn = document.getElementById('dock-inventory-btn');
    if (btn) {
      btn.classList.add('inventory-glow');
      setTimeout(() => btn.classList.remove('inventory-glow'), 5000);
    }
  });
  document.addEventListener('escale:plan-calibration-progress', event => {
    const point1 = document.getElementById('guide-calibration-point-1');
    const point2 = document.getElementById('guide-calibration-point-2');
    const result = document.getElementById('guide-calibration-result');
    if (point1 && event.detail?.point1) point1.textContent = event.detail.point1;
    if (point2 && event.detail?.point2) point2.textContent = event.detail.point2;
    if (result && event.detail?.result) result.textContent = event.detail.result;
    const r = event.detail?.result;
    if (r === 'Esperando referencia') showCalBanner(CAL_BANNER_MSGS.start);
    else if (r === 'Marca el segundo punto') showCalBanner(CAL_BANNER_MSGS.point1);
    else if (r === 'Introduce la distancia real') showCalBanner(CAL_BANNER_MSGS.point2);
    else if (r === 'Sin calibrar') hideCalBanner();
    updatePlanGuide();
  });

  camIso?.addEventListener('click', setIsoCamera);
  camTop?.addEventListener('click', setTopCamera);
  document.getElementById('btn-upload-plan')?.addEventListener('click', setTopCamera);

  // Arrancar en vista 2D (top)
  setTopCamera();
  // btn-calibrate ahora abre el measure-menu (gestionado por HeaderActionMenus).
  // Las acciones del dropdown se manejan aquí para acceder a openCalibrationDemo/setTopCamera.
  document.querySelectorAll('[data-measure-action]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      HeaderActionMenus.closeMenus();
      const action = btn.dataset.measureAction;
      if (action === 'rescale') {
        onboardPulse.stop('btn-calibrate');
        openCalibrationDemo();
      } else if (action === 'take') {
        setTopCamera();
        MeasureManager.start();
      }
    });
  });

  document.getElementById('measure-banner-cancel')?.addEventListener('click', () => {
    MeasureManager.cancel();
  });

  function openCalibrationDemo() {
    if (!AppState.plan.texture) {
      alert('Carga un plano base primero (botón superior).');
      return;
    }
    const overlay = document.getElementById('cal-demo');
    if (!overlay) return;
    overlay.classList.add('visible');
    // Lanzar animación SVG
    const svg = document.getElementById('cal-demo-svg');
    if (svg) {
      svg.parentElement.classList.remove('cal-demo-run');
      void svg.parentElement.offsetWidth;
      svg.parentElement.classList.add('cal-demo-run');
    }
  }

  function closeCalibrationDemo() {
    document.getElementById('cal-demo')?.classList.remove('visible');
  }

  document.getElementById('cal-demo-cancel')?.addEventListener('click', closeCalibrationDemo);

  document.getElementById('cal-demo-start')?.addEventListener('click', () => {
    closeCalibrationDemo();
    showCalBanner(CAL_BANNER_MSGS.start);
    state.planGuideDismissed = false;
    setTopCamera();
    updatePlanGuide();
  });

  function openZonesDemo() {
    if (!AppState.showDemos) {
      HeaderActionMenus.openMenu('zones');
      return;
    }
    const overlay = document.getElementById('zones-demo');
    if (!overlay) return;
    overlay.classList.add('visible');
    const stage = document.getElementById('zones-demo-stage');
    if (stage) {
      stage.classList.remove('zones-demo-run');
      void stage.offsetWidth;
      stage.classList.add('zones-demo-run');
    }
  }

  function closeZonesDemo() {
    document.getElementById('zones-demo')?.classList.remove('visible');
  }

  document.getElementById('zones-demo-cancel')?.addEventListener('click', closeZonesDemo);

  document.getElementById('zones-demo-start')?.addEventListener('click', e => {
    e.stopPropagation();
    closeZonesDemo();
    HeaderActionMenus.openMenu('zones');
    pulseGuideTarget(document.getElementById('btn-zones-menu'));
  });

  zoomRange?.addEventListener('input', () => {
    SceneManager.setZoomPercent(parseInt(zoomRange.value, 10));
  });
  syncZoomUi(100);

  document.getElementById('inventory-close')?.addEventListener('click', () => setInventoryOpen(false));
  document.getElementById('inv-export-btn')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('escale:inventory-close'));
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
  document.getElementById('btn-open-feedback')?.addEventListener('click', () => {
    settingsModal?.classList.remove('visible');
    FeedbackModal.open();
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

  const demosToggle = document.getElementById('demos-toggle');
  if (demosToggle) {
    demosToggle.checked = AppState.showDemos;
    demosToggle.addEventListener('change', () => {
      AppState.showDemos = demosToggle.checked;
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
    onboardPulse.stop('btn-calibrate');
    openCalibrationDemo();
  });
  document.getElementById('guide-zones-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    openZonesDemo();
  });
  document.getElementById('guide-catalog-btn')?.addEventListener('click', () => {
    document.getElementById('plan-guide')?.classList.add('hidden');
    CatalogModal.open('tables');
  });

  document.getElementById('grid-extent-x')?.addEventListener('change', e => {
    AppState.grid.extentX = Math.max(10, parseFloat(e.target.value) || 60);
    SceneManager.rebuildGrids();
  });
  document.getElementById('grid-extent-z')?.addEventListener('change', e => {
    AppState.grid.extentZ = Math.max(10, parseFloat(e.target.value) || 60);
    SceneManager.rebuildGrids();
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
    if (isCollabInvite) return;
    welcomeUnlocked = true;
    if (welcomeModal) welcomeModal.style.display = 'flex';
  });

  const workModeModal = document.getElementById('work-mode-modal');
  let _pendingWelcomeAction = null;

  function showWorkModeModal(welcomeMode, action) {
    if (welcomeModal) welcomeModal.style.display = 'none';
    _pendingWelcomeAction = action;
    void AnalyticsManager.track('welcome_choice', { mode: welcomeMode });
    if (workModeModal) workModeModal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
  }

  function commitWorkMode(mode) {
    AppState.workMode = mode;
    if (workModeModal) workModeModal.style.display = 'none';
    void AnalyticsManager.track('work_mode_choice', { mode });
    const action = _pendingWelcomeAction;
    _pendingWelcomeAction = null;
    // Pantalla de carga cinemática → Grid_onda → app
    SplashScreen.start(() => action?.());
  }

  document.getElementById('work-mode-base')?.addEventListener('click', () => commitWorkMode('base'));
  document.getElementById('work-mode-planning')?.addEventListener('click', () => commitWorkMode('planning'));

  document.getElementById('welcome-plano')?.addEventListener('click', () => {
    showWorkModeModal('plano_2d', () => {
      setTopCamera();
      document.getElementById('btn-upload-plan')?.click();
      openAfterWelcome();
    });
  });
  document.getElementById('welcome-libre')?.addEventListener('click', () => {
    showWorkModeModal('diseno_libre', () => openAfterWelcome());
  });
  document.getElementById('welcome-plantilla')?.addEventListener('click', () => {
    showWorkModeModal('plantilla', () => {
      TemplateManager.load();
      openAfterWelcome();
    });
  });

  refreshHeaderStats();
  InventoryPanel.refresh();
  updatePlanGuide();
  AppState.emitSceneInsights('bootstrap');
  if (!welcomeUnlocked && welcomeModal) welcomeModal.style.display = 'none';
  if (window.lucide) lucide.createIcons();

  // Auto-login: esperar 2s (loader visible), cerrar loader y lanzar splash
  const hasSession = AuthManager.isAuthenticated?.() ||
    ['authenticated', 'authenticated_local'].includes(AppState.company?.authStatus);
  if (!welcomeUnlocked && !isCollabInvite && hasSession) {
    setTimeout(() => {
      const loaderEl = document.getElementById('app-loader');
      if (loaderEl) {
        loaderEl.classList.add('al-fade');
        setTimeout(() => { loaderEl.remove(); SplashScreen.start(); }, 500);
      } else {
        SplashScreen.start();
      }
    }, 2000);
  }

  console.info('[E-scale] arranque OK');
}

window.addEventListener('load', bootstrap);

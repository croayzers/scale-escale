import { ExportManager } from '../io/ExportManager.js';
import { TemplateManager } from '../io/TemplateManager.js';
import { SubscriptionManager } from '../services/SubscriptionManager.js';
import { ProButtonManager } from './ProButtonManager.js';
import { PlansModal } from './PlansModal.js';

const MENU_CONFIG = {
  measure: {
    buttonId: 'btn-calibrate',
    menuId: 'measure-menu'
  },
  zones: {
    buttonId: 'btn-zones-menu',
    menuId: 'zones-menu'
  },
  pro: {
    buttonId: 'btn-pro-menu',
    menuId: 'pro-menu'
  },
  template: {
    buttonId: 'btn-template-menu',
    menuId: 'template-menu'
  },
  print: {
    buttonId: 'btn-print-menu',
    menuId: 'print-menu'
  }
};

let activeMenuKey = '';

function getMenuElements(menuKey) {
  const config = MENU_CONFIG[menuKey];
  if (!config) return {};
  return {
    button: document.getElementById(config.buttonId),
    menu: document.getElementById(config.menuId)
  };
}

function positionMenu(menu, button) {
  if (!menu || !button) return;
  const rect = button.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 320;
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - menuWidth - 12);
  menu.style.left = `${left}px`;
  menu.style.top = `${rect.bottom + 10}px`;
}

function setMenuOpenState(menuKey, open) {
  const { button, menu } = getMenuElements(menuKey);
  if (!button || !menu) return;
  button.classList.toggle('active', open);
  menu.classList.toggle('hidden', !open);
  menu.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function closeMenus() {
  Object.keys(MENU_CONFIG).forEach(key => setMenuOpenState(key, false));
  activeMenuKey = '';
}

function refreshTemplateMenu() {
  const meta = TemplateManager.getCurrentTemplateMeta();

  // Pills: nombre base y planning
  const baseNameEl     = document.getElementById('tpl-base-name');
  const planningNameEl = document.getElementById('tpl-planning-name');
  const folderPathEl   = document.getElementById('template-folder-path');

  if (baseNameEl)     baseNameEl.textContent     = meta.baseName     || 'Sin plantilla base';
  if (planningNameEl) planningNameEl.textContent  = meta.planningName || 'Sin planning';

  // Compatibilidad legado (por si existen en algún otro lugar)
  const currentName = document.getElementById('template-current-name');
  const source      = document.getElementById('template-current-source');
  if (currentName) currentName.textContent = meta.name || 'Escena actual';
  if (source) {
    source.textContent = meta.source === 'loaded'
      ? 'Plantilla cargada'
      : meta.source === 'saved'
        ? 'Última plantilla guardada'
        : 'Escena en curso';
  }
}

function refreshPrintMenu() {
  const note = document.getElementById('print-menu-note');
  const insights = window.getEscaleSceneInsights?.('print-menu') || null;
  const hasPro = SubscriptionManager.currentPlanCode() === 'pro' || SubscriptionManager.currentPlanCode() === 'premium';

  if (!note) return;

  if (hasPro) {
    note.textContent = insights?.hasSceneItems
      ? 'PDF, CSV y planning listos para exportar.'
      : 'Imprime PNG cuando quieras. PDF, CSV y planning se activan al preparar la escena.';
    note.classList.remove('is-upsell');
    return;
  }

  note.textContent = insights?.hasSceneItems
    ? 'Imprimir PNG esta disponible. PRO desbloquea PDF con vista previa, CSV y planning compartible.'
    : 'Imprimir PNG esta disponible para Lite. PDF, CSV y planning son PRO.';
  note.classList.add('is-upsell');
}

function refreshProMenu() {
  const planCode = SubscriptionManager.currentPlanCode();
  const plan = SubscriptionManager.currentPlan();
  const title = document.getElementById('pro-menu-plan');
  const note = document.getElementById('pro-menu-note');
  const btnPro = document.querySelector('[data-plan-upgrade="pro"]');
  const btnPremium = document.querySelector('[data-plan-upgrade="premium"]');
  const btnProTitle = btnPro?.querySelector('strong');
  const btnProCopy = btnPro?.querySelector('small');
  const btnPremiumTitle = btnPremium?.querySelector('strong');
  const btnPremiumCopy = btnPremium?.querySelector('small');

  if (title) title.textContent = `Plan actual: ${plan.name}`;
  if (note) {
    note.textContent = planCode === 'premium'
      ? 'Tienes todas las funciones activas. Desde aquí puedes gestionar la suscripción.'
      : planCode === 'pro'
        ? 'Ya tienes PDF, inventario y branding. Premium añade cliente, CRM, ERP y SharePoint.'
        : 'PRO desbloquea exportación profesional, reporting y compartición del planning.';
    note.classList.toggle('is-upsell', planCode === 'free_lite');
  }

  if (btnProTitle && btnProCopy) {
    btnProTitle.textContent = planCode === 'pro' || planCode === 'premium' ? 'Gestionar PRO' : 'Pasar a PRO';
    btnProCopy.textContent = planCode === 'pro' || planCode === 'premium'
      ? 'Abrir comparativa y portal de suscripción'
      : 'Abrir planes y checkout de Stripe';
  }

  if (btnPremiumTitle && btnPremiumCopy) {
    btnPremiumTitle.textContent = planCode === 'premium' ? 'Gestionar Premium' : 'Ver Premium';
    btnPremiumCopy.textContent = planCode === 'premium'
      ? 'Abrir comparativa y portal de suscripción'
      : 'Integraciones, CRM y SharePoint';
  }
}

function refreshMenus() {
  refreshTemplateMenu();
  refreshPrintMenu();
  refreshProMenu();
  document.dispatchEvent(new CustomEvent('escale:header-menus-refresh', {
    detail: { activeMenuKey }
  }));
  ProButtonManager.markButtons(document);
  if (window.lucide) lucide.createIcons();
}

function openMenu(menuKey) {
  const { button, menu } = getMenuElements(menuKey);
  if (!button || !menu) return;

  // Al abrir el template-menu, limpiar panels de pills
  if (menuKey === 'template') TemplateManager.closePillPanels?.();

  refreshMenus();
  document.dispatchEvent(new CustomEvent('escale:scene-overlay-open', {
    detail: { kind: 'header', key: menuKey }
  }));
  closeMenus();
  setMenuOpenState(menuKey, true);
  positionMenu(menu, button);
  activeMenuKey = menuKey;
  document.dispatchEvent(new CustomEvent('escale:header-menu-opened', {
    detail: { menuKey }
  }));
}

function toggleMenu(menuKey) {
  if (activeMenuKey === menuKey) {
    closeMenus();
    return;
  }
  openMenu(menuKey);
}

function handleTemplateAction(action) {
  // Los panels de pills se gestionan dentro de TemplateManager;
  // no cerramos el menú en acciones de carpeta/pill para que el usuario
  // siga interactuando con la lista.
  const keepMenuOpen = ['pick-folder'].includes(action);
  if (!keepMenuOpen) closeMenus();

  switch (action) {
    case 'load':         TemplateManager.load();          break;
    case 'save':         TemplateManager.save();          break;
    case 'save-base':    void TemplateManager.saveAsBase();    break;
    case 'save-planning': void TemplateManager.savePlanning(); break;
    case 'pick-folder':  void TemplateManager.pickFolder();   break;
    default: break;
  }
}

function handlePrintAction(action, button) {
  const featureKey = button?.dataset?.proFeature || '';
  closeMenus();

  if (action === 'print-png') {
    document.dispatchEvent(new CustomEvent('escale:inventory-close'));
    ExportManager.printPng({ view: button?.dataset?.printView || '2d' });
    return;
  }

  if (featureKey && !SubscriptionManager.hasFeature(featureKey)) {
    SubscriptionManager.ensureFeature(featureKey);
    return;
  }

  if (action === 'pdf-data') {
    ExportManager.openDataModal();
    return;
  }

  if (action === 'pdf') {
    ExportManager.openModal({ kind: 'pdf' });
    return;
  }

  if (action === 'inventory') {
    ExportManager.openModal({ kind: 'inventory' });
    return;
  }

  if (action === 'csv') {
    ExportManager.downloadInventoryCsv();
    return;
  }

  if (action === 'share') {
    document.dispatchEvent(new CustomEvent('escale:share-planning'));
  }
}

function handlePlanUpgrade(planCode) {
  closeMenus();
  PlansModal.open(planCode);
}

function onDocumentPointerDown(event) {
  const pressedInsideMenu = Object.keys(MENU_CONFIG).some(key => {
    const { button, menu } = getMenuElements(key);
    return button?.contains(event.target) || menu?.contains(event.target);
  });

  // Paneles laterales asociados a un menú (p.ej. ajustes de zona) cuentan como "dentro":
  // no deben cerrar el menú al editar sus campos.
  const sidePanel = event.target.closest?.('.zone-side-panel');

  if (!pressedInsideMenu && !sidePanel) closeMenus();
}

function init() {
  ProButtonManager.init();

  Object.entries(MENU_CONFIG).forEach(([menuKey, config]) => {
    document.getElementById(config.buttonId)?.addEventListener('click', event => {
      event.stopPropagation();
      toggleMenu(menuKey);
    });
  });

  document.querySelectorAll('[data-template-action]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      handleTemplateAction(button.dataset.templateAction);
    });
  });

  document.querySelectorAll('[data-print-action]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      handlePrintAction(button.dataset.printAction, button);
    });
  });

  document.querySelectorAll('[data-plan-upgrade]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      handlePlanUpgrade(button.dataset.planUpgrade);
    });
  });

  // pointerdown (no click): cerrar solo si la pulsación empieza fuera del menú,
  // para no cerrarlo al arrastrar dentro de un input numérico y soltar fuera.
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('escale:scene-overlay-open', event => {
    if (event.detail?.kind !== 'header') closeMenus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenus();
  });
  window.addEventListener('resize', closeMenus);
  window.addEventListener('scroll', closeMenus, true);
  document.addEventListener('escale:template-meta-changed', refreshTemplateMenu);
  document.addEventListener('escale:plan-changed', refreshPrintMenu);
  document.addEventListener('escale:scene-insights-changed', refreshPrintMenu);
  document.addEventListener('escale:open-print-menu', () => openMenu('print'));

  refreshMenus();
}

export const HeaderActionMenus = {
  init,
  openMenu,
  closeMenus
};

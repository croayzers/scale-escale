import { ExportManager } from '../io/ExportManager.js';
import { TemplateManager } from '../io/TemplateManager.js';
import { SubscriptionManager } from '../services/SubscriptionManager.js';
import { ProButtonManager } from './ProButtonManager.js';

const MENU_CONFIG = {
  zones: {
    buttonId: 'btn-zones-menu',
    menuId: 'zones-menu'
  },
  grid: {
    buttonId: 'btn-grid-menu',
    menuId: 'grid-menu'
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
  const left = Math.min(
    Math.max(12, rect.left),
    window.innerWidth - menuWidth - 12
  );

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
  const currentName = document.getElementById('template-current-name');
  const source = document.getElementById('template-current-source');

  if (currentName) currentName.textContent = meta.name || 'Escena actual';
  if (source) {
    source.textContent = meta.source === 'loaded'
      ? 'Plantilla cargada'
      : meta.source === 'saved'
        ? 'Ultima plantilla guardada'
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
      ? 'PDF, inventario y planning listos para exportar.'
      : 'Disponible para cuando empieces a colocar elementos.';
    note.classList.remove('is-upsell');
    return;
  }

  note.textContent = insights?.hasSceneItems
    ? 'Disponible en PRO: PDF con vista previa, inventario CSV y planning compartible.'
    : 'Estas acciones se desbloquean en PRO cuando prepares el planning.';
  note.classList.add('is-upsell');
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

function refreshProMenu() {
  const planCode = SubscriptionManager.currentPlanCode();
  const plan = SubscriptionManager.currentPlan();
  const title = document.getElementById('pro-menu-plan');
  const note = document.getElementById('pro-menu-note');
  const btnPro = document.querySelector('[data-plan-upgrade="pro"]');
  const btnPremium = document.querySelector('[data-plan-upgrade="premium"]');

  if (title) title.textContent = `Plan actual: ${plan.name}`;
  if (note) {
    note.textContent = planCode === 'premium'
      ? 'Tienes todas las funciones activas. Desde aquí puedes gestionar la suscripción.'
      : planCode === 'pro'
        ? 'Ya tienes PDF, inventario y branding. Premium añade cliente, CRM, ERP y SharePoint.'
        : 'PRO desbloquea exportación profesional, reporting y compartición del planning.';
  }

  if (btnPro) {
    btnPro.textContent = planCode === 'pro' || planCode === 'premium' ? 'Gestionar PRO' : 'Pasar a PRO';
  }
  if (btnPremium) {
    btnPremium.textContent = planCode === 'premium' ? 'Gestionar Premium' : 'Ver Premium';
  }
}

function openMenu(menuKey) {
  const { button, menu } = getMenuElements(menuKey);
  if (!button || !menu) return;

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
  closeMenus();
  if (action === 'load') {
    TemplateManager.load();
    return;
  }
  if (action === 'save') TemplateManager.save();
}

function handlePrintAction(action, button) {
  const featureKey = button?.dataset?.proFeature || '';
  closeMenus();

  if (featureKey && !SubscriptionManager.hasFeature(featureKey)) {
    SubscriptionManager.ensureFeature(featureKey);
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

  if (action === 'share') {
    document.dispatchEvent(new CustomEvent('escale:share-planning'));
  }
}

function handlePlanUpgrade(planCode) {
  closeMenus();
  const current = SubscriptionManager.currentPlanCode();
  if (current === planCode || (current === 'premium' && planCode === 'pro')) {
    void SubscriptionManager.openCustomerPortal();
    return;
  }
  void SubscriptionManager.openCheckout(planCode);
}

function onDocumentClick(event) {
  const clickedInsideMenu = Object.keys(MENU_CONFIG).some(key => {
    const { button, menu } = getMenuElements(key);
    return button?.contains(event.target) || menu?.contains(event.target);
  });

  if (!clickedInsideMenu) closeMenus();
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

  document.addEventListener('click', onDocumentClick);
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

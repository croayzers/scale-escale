// ToolHub.js — Capa previa al editor 3D: rejilla de tarjetas para elegir herramienta.
// Es un overlay a pantalla completa (z-index muy alto) que vive POR ENCIMA del editor
// montado en el DOM. No toca el editor ni SplashScreen; solo decide CUÁNDO arrancarlos.
import { toolsRegistry } from '../tools/toolsRegistry.js';

const HUB_ID = 'tool-hub-overlay';
const HOME_ID = 'tool-hub-home-btn';

function refreshIcons(root) {
  if (window.lucide) {
    try { lucide.createIcons(root ? { nodes: [root] } : undefined); } catch (_) { /* noop */ }
  }
}

function buildCard(tool) {
  const soon = tool.status === 'soon';
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'th-card' + (soon ? ' th-card--soon' : '');
  card.dataset.toolId = tool.id;
  card.style.setProperty('--th-color', tool.color || 'var(--brand-primary)');
  if (soon) card.disabled = true;

  card.innerHTML = `
    <span class="th-card-bar" aria-hidden="true"></span>
    <span class="th-card-icon"><i data-lucide="${tool.icon}"></i></span>
    <span class="th-card-body">
      <span class="th-card-name">${tool.name}</span>
      <span class="th-card-desc">${tool.description}</span>
    </span>
    ${soon ? '<span class="th-card-badge">Próximamente</span>' : ''}
  `;
  return card;
}

export const ToolHub = {
  _handlers: null,

  show(handlers = {}) {
    this._handlers = handlers;
    this.hide(); // limpia cualquier instancia previa

    const overlay = document.createElement('div');
    overlay.id = HUB_ID;
    overlay.className = 'th-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Herramientas');

    const grid = document.createElement('div');
    grid.className = 'th-grid';
    toolsRegistry.forEach((tool) => {
      const card = buildCard(tool);
      if (tool.status !== 'soon') {
        card.addEventListener('click', () => {
          const fn = (this._handlers || {})[tool.id];
          this.hide();
          if (typeof fn === 'function') fn();
        });
      }
      grid.appendChild(card);
    });

    overlay.innerHTML = `
      <div class="th-inner">
        <header class="th-head">
          <img class="th-logo" src="brand/Logo_horizontal.png" alt="E-scale"
               onerror="this.style.display='none'"/>
          <h1 class="th-title">Herramientas</h1>
          <p class="th-subtitle">Elige una herramienta para empezar</p>
        </header>
      </div>
    `;
    overlay.querySelector('.th-inner').appendChild(grid);

    document.body.appendChild(overlay);
    refreshIcons(overlay);
    return overlay;
  },

  hide() {
    document.getElementById(HUB_ID)?.remove();
  },

  // Botón flotante "Inicio" (esquina superior izquierda). Lo usan las herramientas
  // que no tienen su propio AppLauncher (p.ej. QR) para volver al hub.
  mountHomeButton(onHome) {
    this.unmountHomeButton();
    const btn = document.createElement('button');
    btn.id = HOME_ID;
    btn.type = 'button';
    btn.className = 'th-home-btn';
    btn.title = 'Volver al inicio';
    btn.innerHTML = '<i data-lucide="home"></i><span>Inicio</span>';
    btn.addEventListener('click', () => {
      if (typeof onHome === 'function') onHome();
    });
    document.body.appendChild(btn);
    refreshIcons(btn);
    return btn;
  },

  unmountHomeButton() {
    document.getElementById(HOME_ID)?.remove();
  },
};

export default ToolHub;

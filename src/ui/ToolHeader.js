// ToolHeader.js — Header ESTÁNDAR y REUTILIZABLE para las herramientas del hub
// de E-scale (Generador de QR hoy; otras mañana).
//
// NO es el header del editor 3D (ese vive escrito a mano en index.html, acoplado
// a Three.js y a los chips del editor). Este es un header limpio, autocontenido y
// reutilizable que cualquier herramienta puede montar dentro de su propio overlay.
//
// Estructura que inyecta dentro de `container`:
//   <div class="tool-header">
//     <div class="tool-header-brand"> logo + título de la herramienta </div>
//     <div id="header-inner">           ← AppLauncher se AUTOINYECTA aquí (9 puntos)
//        <div class="hdr-sep"></div>     (ancla para el AppLauncher)
//        <button id="btn-tool-chat">     ← Chat / soporte (mapeable por MessageManager)
//        <button id="btn-tool-ai">       ← IA (placeholder; lo cablea scale-ai-actions)
//        <button id="btn-account">       ← Cuenta (lo cablea CompanyManager)
//     </div>
//     <button class="tool-header-home">  ← Inicio (vuelve al hub vía onHome)
//   </div>
//
// Reutiliza piezas YA EXISTENTES (no las duplica):
//   - src/ui/AppLauncher.js      → AppLauncher.init() busca #header-inner y se autoinyecta.
//   - src/services/MessageManager.js → init() (idempotente) + bind de triggers por id.
//   - src/io/CompanyManager.js   → init() (idempotente) cablea #btn-account.
//   - Clases .hdr-chip / .hdr-sep / .header-brand* (styles/dock.css).
//   - Iconos lucide (window.lucide.createIcons()).

import { AppLauncher } from './AppLauncher.js';
import { MessageManager } from '../services/MessageManager.js';
import { CompanyManager } from '../io/CompanyManager.js';

const ROOT_ID = 'tool-header-root';

// IDs públicos de los botones (para que UI y el copiloto IA los reutilicen).
const BTN = {
  chat: 'btn-tool-chat',
  ai: 'btn-tool-ai',
  account: 'btn-account',   // mismo id que el editor → lo cablea CompanyManager
  home: 'btn-tool-home',
  // launcher: 'btn-app-launcher' (lo crea AppLauncher.init() dentro de #header-inner)
};

function refreshIcons(root) {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try { lucide.createIcons(root ? { nodes: [root] } : undefined); }
    catch (_) { /* noop */ }
  }
}

// Asegura el contenedor de overlays del chat que usa MessageManager (#msg-overlays).
// En la vista del editor ya existe en index.html, pero una herramienta servida en
// solitario podría no tenerlo: lo creamos si falta.
function ensureMsgOverlays() {
  if (!document.getElementById('msg-overlays')) {
    const div = document.createElement('div');
    div.id = 'msg-overlays';
    document.body.appendChild(div);
  }
}

// Abre el chat de soporte. Si Crisp está cargado (SupportManager) usa su API;
// si no, dispara un evento para que quien sepa lo gestione, con aviso de fallback.
function openSupportChat() {
  if (window.$crisp && Array.isArray(window.$crisp)) {
    try {
      window.$crisp.push(['do', 'chat:open']);
      return;
    } catch (_) { /* cae al evento */ }
  }
  const handled = !document.dispatchEvent(
    new CustomEvent('escale:tool-chat-open', { cancelable: true })
  );
  if (!handled) {
    // Nadie lo gestionó: aviso simple no intrusivo.
    console.info('[ToolHeader] Chat no disponible todavía en esta herramienta.');
  }
}

function buildHeaderHTML({ toolName, logoSrc, buttons }) {
  const b = buttons || {};
  const chatBtn = b.chat === false ? '' : `
        <button id="${BTN.chat}" class="hdr-chip tool-header-action" type="button" title="Chat y soporte" aria-label="Chat y soporte">
          <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
          <span class="tool-header-action-label">Chat</span>
        </button>`;
  const aiBtn = b.ai === false ? '' : `
        <button id="${BTN.ai}" class="hdr-chip tool-header-action tool-header-ai" type="button" title="Asistente IA" aria-label="Asistente IA">
          <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
          <span class="tool-header-action-label">IA</span>
        </button>`;
  const accountBtn = b.account === false ? '' : `
        <button id="${BTN.account}" class="hdr-chip hdr-account tool-header-account" type="button" title="Cuenta" aria-label="Cuenta">
          <i data-lucide="badge-check" class="w-3.5 h-3.5"></i>
          <span id="account-chip-label" class="mono tool-header-account-label">Acceder</span>
          <span class="hdr-dot"></span>
          <span id="account-chip-meta" class="mono tool-header-account-meta">Licencia</span>
        </button>`;

  return `
    <div class="tool-header" role="banner">
      <div class="tool-header-brand">
        <span class="header-brand-mark" aria-hidden="true">
          <img class="header-brand-logo tool-header-logo" src="${logoSrc}" alt=""
               onerror="this.classList.add('is-missing');this.style.display='none'"/>
          <span class="header-brand-fallback">ES</span>
        </span>
        ${toolName ? `<span class="tool-header-title">${escHtml(toolName)}</span>` : ''}
      </div>

      <!-- AppLauncher (9 puntos) se autoinyecta aquí, antes del primer .hdr-sep -->
      <div id="header-inner" class="tool-header-inner">
        <div class="hdr-sep"></div>
        ${chatBtn}
        ${aiBtn}
        ${accountBtn}
      </div>

      <button id="${BTN.home}" class="hdr-chip tool-header-home" type="button" title="Volver al inicio" aria-label="Volver al inicio">
        <i data-lucide="home" class="w-3.5 h-3.5"></i>
        <span>Inicio</span>
      </button>
    </div>`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let _onHome = null;
let _root = null;

function _onHomeClick() {
  if (typeof _onHome === 'function') _onHome();
}

export const ToolHeader = {
  /** IDs públicos de los botones, para que UI / IA los reutilicen. */
  IDS: { ...BTN },

  /**
   * Monta el header estándar dentro de `container`.
   * @param {Object}   opts
   * @param {HTMLElement|string} opts.container  Elemento o id donde inyectar el header.
   * @param {string}  [opts.toolName='']         Título de la herramienta (p.ej. "Generador de QR").
   * @param {string}  [opts.logoSrc='brand/Logo_horizontal.png']
   * @param {Function}[opts.onHome]              Callback del botón "Inicio".
   * @param {Object}  [opts.buttons]             { launcher, chat, ai, account } (true por defecto).
   * @returns {HTMLElement|null} el nodo .tool-header montado, o null si falla.
   */
  mount({ container, toolName = '', logoSrc = 'brand/Logo_horizontal.png', onHome, buttons } = {}) {
    const host = typeof container === 'string'
      ? document.getElementById(container)
      : container;
    if (!host) {
      console.warn('[ToolHeader] container no encontrado:', container);
      return null;
    }

    // Idempotente: si ya hay un header montado, lo desmonta antes.
    this.unmount();

    const cfg = { launcher: true, chat: true, ai: true, account: true, ...(buttons || {}) };
    _onHome = typeof onHome === 'function' ? onHome : null;

    // Asegura el contenedor de overlays del chat (MessageManager).
    ensureMsgOverlays();

    const wrap = document.createElement('div');
    wrap.id = ROOT_ID;
    wrap.innerHTML = buildHeaderHTML({ toolName, logoSrc, buttons: cfg });
    // Insertamos el contenido directo (el .tool-header) en el host.
    host.prepend(wrap);
    _root = wrap;

    // AppLauncher: busca #header-inner y se autoinyecta (idempotente: comprueba
    // si #btn-app-launcher ya existe). Solo si el botón launcher está activo.
    if (cfg.launcher !== false) {
      try { AppLauncher.init(); } catch (e) { console.warn('[ToolHeader] AppLauncher.init falló:', e); }
    }

    // CompanyManager: cablea #btn-account (idempotente vía isInitialized).
    if (cfg.account !== false) {
      try { CompanyManager.init(); } catch (e) { console.warn('[ToolHeader] CompanyManager.init falló:', e); }
    }

    // MessageManager: bind de triggers por id de botón + overlays (idempotente).
    try { MessageManager.init(); } catch (e) { console.warn('[ToolHeader] MessageManager.init falló:', e); }

    // Cableado de botones propios del header.
    if (cfg.chat !== false) {
      document.getElementById(BTN.chat)?.addEventListener('click', openSupportChat);
    }
    if (cfg.ai !== false) {
      // Placeholder: dispara el evento que el copiloto QR (scale-ai-actions) escuchará.
      document.getElementById(BTN.ai)?.addEventListener('click', () => {
        const handled = !document.dispatchEvent(
          new CustomEvent('escale:tool-ai-open', { cancelable: true })
        );
        if (!handled) {
          const btn = document.getElementById(BTN.ai);
          if (btn) {
            const prev = btn.getAttribute('title');
            btn.setAttribute('title', 'Asistente IA — disponible muy pronto');
            btn.classList.add('is-pulsing');
            setTimeout(() => {
              btn.classList.remove('is-pulsing');
              if (prev) btn.setAttribute('title', prev);
            }, 1400);
          }
          console.info('[ToolHeader] IA aún no conectada (placeholder).');
        }
      });
    }
    document.getElementById(BTN.home)?.addEventListener('click', _onHomeClick);

    refreshIcons(wrap);
    return wrap.querySelector('.tool-header') || wrap;
  },

  /** Desmonta el header (no toca AppLauncher/CompanyManager/MessageManager globales). */
  unmount() {
    const root = document.getElementById(ROOT_ID);
    if (root) {
      document.getElementById(BTN.home)?.removeEventListener('click', _onHomeClick);
      root.remove();
    }
    _root = null;
    _onHome = null;
  },
};

export default ToolHeader;

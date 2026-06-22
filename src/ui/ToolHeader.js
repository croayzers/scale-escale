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
import { AuthManager } from '../services/AuthManager.js';
import { AppState } from '../core/AppState.js';

const ROOT_ID = 'tool-header-root';

// IDs públicos de los botones (para que UI y el copiloto IA los reutilicen).
const BTN = {
  chat: 'btn-tool-chat',
  notifications: 'btn-tool-notif',
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
  // Campana de notificaciones (activa por defecto). Abre un popover-feed con las
  // notificaciones de la empresa (public.company_notifications). El punto rojo
  // (.tool-header-notif-dot) se muestra cuando hay notificaciones sin leer.
  const notifBtn = b.notifications === false ? '' : `
        <button id="${BTN.notifications}" class="hdr-chip tool-header-action tool-header-notif" type="button" title="Notificaciones" aria-label="Notificaciones">
          <i data-lucide="bell" class="w-3.5 h-3.5"></i>
          <span class="tool-header-notif-dot" hidden></span>
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
        ${notifBtn}
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

/* ─── Notificaciones (feed básico) ──────────────────────────────────────────────
   NotifEmitter.js solo ESCRIBE en public.company_notifications. Aquí añadimos la
   LECTURA mínima coherente con el design-system: un popover-feed (.hdr-popover)
   con las últimas notificaciones de la empresa. La marca de "leído" es local
   (localStorage) — el centro de notificaciones compartido de L/P/S-Scale gestiona
   el read-state real; aquí basta con ocultar el punto rojo tras abrir el panel.
   TODO: si en el futuro existe un panel de notificaciones reutilizable en
   @scale/shared o un evento global, sustituir este feed por una llamada a él.
   ──────────────────────────────────────────────────────────────────────────── */

const NOTIF_PANEL_ID = 'tool-notif-panel';
const NOTIF_SEEN_KEY = 'escale_notif_seen_at';
let _notifOpen = false;
let _notifCache = null;

function _notifEscHtml(str) { return escHtml(str); }

// Lee las últimas notificaciones de la empresa vía el cliente Supabase de AuthManager.
async function _loadNotifications(limit = 30) {
  try {
    const sb = AuthManager.getSupabaseClient?.();
    const companyId = AppState?.company?.organizationId || null;
    if (!sb || !companyId) return [];
    const { data, error } = await sb
      .from('company_notifications')
      .select('id,actor_nombre,app_id,tipo,titulo,recurso_label,cmd,created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { console.warn('[ToolHeader] notificaciones:', error.message); return []; }
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[ToolHeader] notificaciones:', e?.message || e);
    return [];
  }
}

// Fecha local relativa corta (nunca toISOString().slice — corre un día en husos +).
function _notifFmt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Pinta el punto rojo si hay notificaciones más recientes que la última vista.
async function _refreshNotifBadge() {
  const dot = document.querySelector('.tool-header-notif-dot');
  if (!dot) return;
  const list = await _loadNotifications(10);
  _notifCache = list;
  const lastSeen = Number(localStorage.getItem(NOTIF_SEEN_KEY) || 0);
  const newest = list.length ? new Date(list[0].created_at).getTime() : 0;
  dot.hidden = !(newest > lastSeen);
}

function _notifRowHTML(n) {
  const when = _notifFmt(n.created_at);
  const who = n.actor_nombre ? `${_notifEscHtml(n.actor_nombre)} · ` : '';
  const sub = n.recurso_label ? `<div class="hdr-notif-sub">${_notifEscHtml(n.recurso_label)}</div>` : '';
  return `
    <div class="hdr-notif-row">
      <div class="hdr-notif-icon"><i data-lucide="bell"></i></div>
      <div class="hdr-notif-main">
        <div class="hdr-notif-title">${_notifEscHtml(n.titulo || 'Notificación')}</div>
        ${sub}
        <div class="hdr-notif-meta">${who}${_notifEscHtml(when)}</div>
      </div>
    </div>`;
}

async function _toggleNotifPanel() {
  if (_notifOpen) { _closeNotifPanel(); return; }
  _notifOpen = true;
  document.getElementById(BTN.notifications)?.classList.add('active');

  const panel = document.createElement('div');
  panel.id = NOTIF_PANEL_ID;
  panel.className = 'hdr-popover hdr-notif-popover';
  panel.innerHTML = `
    <div class="hdr-popover-head">
      <span class="hdr-popover-title">Notificaciones</span>
    </div>
    <div class="hdr-notif-list"><div class="hdr-notif-empty">Cargando…</div></div>`;
  document.body.appendChild(panel);

  // Posicionar bajo la campana, alineado a la derecha.
  const btn = document.getElementById(BTN.notifications);
  const rect = btn?.getBoundingClientRect();
  if (rect) {
    panel.style.position = 'fixed';
    panel.style.top = `${rect.bottom + 8}px`;
    const w = 320;
    panel.style.left = `${Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8))}px`;
    panel.style.width = `${w}px`;
  }

  refreshIcons(panel);

  const list = await _loadNotifications(30);
  _notifCache = list;
  const body = panel.querySelector('.hdr-notif-list');
  if (body) {
    body.innerHTML = list.length
      ? list.map(_notifRowHTML).join('')
      : '<div class="hdr-notif-empty">No hay notificaciones todavía.</div>';
    refreshIcons(body);
  }

  // Marcar como vistas → ocultar el punto rojo.
  localStorage.setItem(NOTIF_SEEN_KEY, String(Date.now()));
  const dot = document.querySelector('.tool-header-notif-dot');
  if (dot) dot.hidden = true;

  setTimeout(() => document.addEventListener('pointerdown', _notifOutside, true), 0);
}

function _notifOutside(e) {
  const panel = document.getElementById(NOTIF_PANEL_ID);
  const btn = document.getElementById(BTN.notifications);
  if (panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
    _closeNotifPanel();
  }
}

function _closeNotifPanel() {
  document.getElementById(NOTIF_PANEL_ID)?.remove();
  document.getElementById(BTN.notifications)?.classList.remove('active');
  document.removeEventListener('pointerdown', _notifOutside, true);
  _notifOpen = false;
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
   * @param {Object}  [opts.buttons]             { launcher, chat, notifications, ai, account } (true por defecto).
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

    const cfg = { launcher: true, chat: true, notifications: true, ai: true, account: true, ...(buttons || {}) };
    _onHome = typeof onHome === 'function' ? onHome : null;

    // Asegura el contenedor de overlays del chat (MessageManager).
    ensureMsgOverlays();

    const wrap = document.createElement('div');
    wrap.id = ROOT_ID;
    wrap.innerHTML = buildHeaderHTML({ toolName, logoSrc, buttons: cfg });
    // Insertamos el contenido directo (el .tool-header) en el host.
    host.prepend(wrap);
    _root = wrap;

    // AppLauncher: se autoinyecta dentro de NUESTRO #header-inner. Le pasamos el
    // host explícito porque el editor 3D (index.html) ya tiene otro #header-inner
    // y getElementById('header-inner') devolvería el suyo (el botón no aparecería
    // en la herramienta). Idempotente: AppLauncher comprueba duplicados en el host.
    if (cfg.launcher !== false) {
      const headerInner = wrap.querySelector('#header-inner');
      try { AppLauncher.init(headerInner); } catch (e) { console.warn('[ToolHeader] AppLauncher.init falló:', e); }
    }

    // CompanyManager: cablea #btn-account (idempotente vía isInitialized).
    if (cfg.account !== false) {
      try { CompanyManager.init(); } catch (e) { console.warn('[ToolHeader] CompanyManager.init falló:', e); }
      // El header se monta TARDE (al abrir la herramienta): los eventos de
      // arranque de SubscriptionManager (escale:license-state / escale:auth-changed)
      // ya se dispararon, así que el chip nace con los valores por defecto
      // ("Acceder"/"Licencia"). Re-sincronizamos el chip con el estado ACTUAL
      // (sesión + plan vigente) en vez de esperar otro evento.
      try { CompanyManager.syncAccountChip?.(); } catch (e) { console.warn('[ToolHeader] syncAccountChip falló:', e); }
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
    // Campana de notificaciones: abre/cierra el popover-feed.
    if (cfg.notifications !== false) {
      document.getElementById(BTN.notifications)?.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleNotifPanel();
      });
      // Carga inicial silenciosa para pintar el punto de "sin leer".
      _refreshNotifBadge();
    }

    document.getElementById(BTN.home)?.addEventListener('click', _onHomeClick);

    refreshIcons(wrap);
    return wrap.querySelector('.tool-header') || wrap;
  },

  /** Desmonta el header (no toca AppLauncher/CompanyManager/MessageManager globales). */
  unmount() {
    _closeNotifPanel();
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

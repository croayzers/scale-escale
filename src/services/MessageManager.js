/**
 * MessageManager — muestra overlays configurados en admin/mensajes.
 * Lee la config desde localStorage (escale_admin_config) o /config/app.config.json.
 * Cooldown por tipo se guarda en localStorage como escale_msj_<key>_last.
 */

const LS_CONFIG_KEY = 'escale_admin_config';
const CONFIG_URL    = '/config/app.config.json';

const MESSAGE_TYPES = ['msj_alerta', 'msj_oferta', 'msj_info', 'msj_stats'];

let _config = null;

async function loadConfig() {
  if (_config) return _config;
  const stored = localStorage.getItem(LS_CONFIG_KEY);
  if (stored) {
    try { _config = JSON.parse(stored); return _config; } catch {}
  }
  try {
    const r = await fetch(CONFIG_URL, { cache: 'no-cache' });
    if (r.ok) { _config = await r.json(); return _config; }
  } catch {}
  return {};
}

function cooldownKey(type) { return `escale_msj_${type}_last`; }

function isOnCooldown(type, cooldownDays) {
  if (!cooldownDays && cooldownDays !== 0) return false;
  if (cooldownDays === 0) return false;
  const last = Number(localStorage.getItem(cooldownKey(type)) || 0);
  if (!last) return false;
  const msAgo = Date.now() - last;
  return msAgo < cooldownDays * 86400000;
}

function recordShown(type) {
  localStorage.setItem(cooldownKey(type), String(Date.now()));
}

function buildOverlay(type, cfg) {
  const overlay = document.createElement('div');
  overlay.id = `msg-overlay-${type}`;
  overlay.className = 'msg-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const typeClass = {
    msj_alerta: 'msg-variant-alerta',
    msj_oferta: 'msg-variant-oferta',
    msj_info:   'msg-variant-info',
    msj_stats:  'msg-variant-stats'
  }[type] || '';

  overlay.innerHTML = `
    <div class="msg-shell ${typeClass}">
      <div class="msg-accent-bar"></div>
      <div class="msg-body">
        <div class="msg-title">${escHtml(cfg.title || '')}</div>
        <div class="msg-text">${escHtml(cfg.text || '')}</div>
        <div class="msg-actions">
          <button class="msg-btn msg-btn-cancel" data-action="cancel">${escHtml(cfg.cancelBtn || 'Cancelar')}</button>
          <button class="msg-btn msg-btn-accept" data-action="accept">${escHtml(cfg.acceptBtn || 'Aceptar')}</button>
        </div>
      </div>
    </div>
  `;

  overlay.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action) {
      overlay.remove();
      if (action === 'accept') {
        if (cfg.acceptUrl) {
          window.open(cfg.acceptUrl, '_blank', 'noopener,noreferrer');
        } else if (cfg.acceptAction) {
          _triggerUiButton(cfg.acceptAction);
        }
      }
      document.dispatchEvent(new CustomEvent(`escale:message-${action}`, { detail: { type } }));
    }
  });

  return overlay;
}

function _triggerUiButton(value) {
  if (!value) return;
  if (value.startsWith('dock-')) {
    const catKey = value.slice(5);
    document.querySelector(`#dock-items button[data-cat="${catKey}"]`)?.click();
  } else {
    document.getElementById(value)?.click();
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let _initialized = false;

async function checkAndShowOnLoad() {
  // Idempotente: el editor y ToolHeader pueden invocarlo; solo corre una vez.
  if (_initialized) return;
  _initialized = true;
  const cfg = await loadConfig();
  const messages = cfg.messages || {};

  for (const type of MESSAGE_TYPES) {
    const m = messages[type];
    if (!m || !m.enabled) continue;
    if (m.trigger !== 'onload' && m.trigger) continue;
    if (isOnCooldown(type, m.cooldownDays)) continue;
    recordShown(type);
    show(type, m);
    break; // show one at a time
  }

  // Wire button-click triggers
  _bindButtonTriggers(messages);
}

function _bindButtonTriggers(messages) {
  // Collect all messages that have a button-id trigger
  for (const [type, m] of Object.entries(messages)) {
    const trigger = m?.trigger;
    if (!trigger || trigger === 'onload' || trigger === 'manual') continue;
    if (!m.enabled) continue;

    const isCooldown = isOnCooldown(type, m.cooldownDays);

    // Dock category buttons use data-cat attribute
    if (trigger.startsWith('dock-')) {
      const catKey = trigger.slice(5); // e.g. "chairs"
      document.querySelectorAll(`#dock-items button[data-cat="${catKey}"]`).forEach(btn => {
        btn.addEventListener('click', () => {
          if (!isCooldown) { recordShown(type); show(type, m); }
        }, { once: true });
      });
    } else {
      // Header button by id
      const btn = document.getElementById(trigger);
      if (btn) {
        btn.addEventListener('click', () => {
          if (!isOnCooldown(type, m.cooldownDays)) { recordShown(type); show(type, m); }
        }, { once: true });
      }
    }
  }
}

function show(type, cfg) {
  if (!cfg) return;
  const container = document.getElementById('msg-overlays') || document.body;
  const existing = document.getElementById(`msg-overlay-${type}`);
  if (existing) existing.remove();
  container.appendChild(buildOverlay(type, cfg));
}

async function showManual(type) {
  const cfg = await loadConfig();
  const m = cfg.messages?.[type];
  if (!m) return;
  show(type, m);
}

function dismiss(type) {
  document.getElementById(`msg-overlay-${type}`)?.remove();
}

export const MessageManager = {
  init: checkAndShowOnLoad,
  show: showManual,
  dismiss
};

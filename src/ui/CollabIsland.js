import { CollabManager }    from '../services/CollabManager.js';
import { CollabInviteModal } from './CollabInviteModal.js';
import { SceneManager }      from '../scene/SceneManager.js';

let _wrap    = null;
let _el      = null;
let _expanded   = false;
let _participants = [];
let _view       = 'iso';
let _followCam  = false;
let _camTimer   = null;

const initials = name => (name || '?').slice(0, 2).toUpperCase();

function injectStyles() {
  if (document.getElementById('collab-island-styles')) return;
  const s = document.createElement('style');
  s.id = 'collab-island-styles';
  s.textContent = `
    @property --ci-a {
      syntax: '<angle>';
      initial-value: 0deg;
      inherits: false;
    }
    @keyframes ci-spin    { to { --ci-a: 360deg; } }
    @keyframes ci-blink   { 0%,100%{opacity:1} 50%{opacity:.2} }
    @keyframes ci-fadein  { from{opacity:0;transform:translateX(-50%) scaleX(.7)} to{opacity:1;transform:translateX(-50%) scaleX(1)} }

    #ci-wrap {
      display: none;
      position: fixed;
      top: 44px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 8500;
      border-radius: 100px;
      padding: 1.5px;
      background: conic-gradient(from var(--ci-a), #ff0080, #a855f7, #00d4ff, #10B981, #f59e0b, #ff0080);
      animation: ci-spin 4s linear infinite;
    }
    #ci-wrap.visible { display: block; }

    #ci-island {
      display: flex;
      align-items: center;
      gap: 0;
      background: rgba(10, 10, 14, 0.9);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 100px;
      height: 36px;
      overflow: hidden;
      transition: padding .25s ease, gap .25s ease;
    }
    #ci-island.collapsed { padding: 0 14px; gap: 6px; cursor: pointer; }
    #ci-island.expanded  { padding: 0 10px; gap: 6px; animation: ci-fadein .25s ease; cursor: default; }

    .ci-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #10B981; flex-shrink: 0;
      animation: ci-blink 1.4s ease-in-out infinite;
    }
    .ci-label {
      font-size: 11px; font-weight: 700; color: #10B981;
      text-transform: uppercase; letter-spacing: .07em;
    }
    .ci-sep {
      width: 1px; height: 22px; flex-shrink: 0;
      background: rgba(255,255,255,.12); margin: 0 2px;
    }
    .ci-avatars { display: flex; align-items: center; gap: 3px; }
    .ci-av {
      width: 26px; height: 26px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 800; color: #fff; flex-shrink: 0;
      border: 1.5px solid rgba(255,255,255,.15);
      position: relative;
    }
    .ci-av.local { border-color: rgba(255,255,255,.5); }
    .ci-av-tip {
      position: absolute; top: calc(100% + 5px); left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,.85); color: #e5e7eb;
      font-size: 10px; padding: 2px 7px; border-radius: 5px;
      white-space: nowrap; pointer-events: none;
      opacity: 0; transition: opacity .12s; z-index: 1;
    }
    .ci-av:hover .ci-av-tip { opacity: 1; }

    .ci-btns { display: flex; align-items: center; gap: 4px; }
    .ci-btn {
      width: 30px; height: 30px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.1);
      color: #cbd5e1; cursor: pointer; flex-shrink: 0;
      transition: all .15s; font-size: 11px; font-weight: 700;
    }
    .ci-btn svg { pointer-events: none; }
    .ci-btn:hover { background: rgba(255,255,255,.15); color: #fff; border-color: rgba(255,255,255,.25); }
    .ci-btn.on  { background: rgba(16,185,129,.18); border-color: #10B981; color: #10B981; }
    .ci-btn.end:hover { background: rgba(185,28,28,.3); border-color: #b91c1c; color: #fca5a5; }
  `;
  document.head.appendChild(s);
}

function renderCollapsed() {
  _el.className = 'collapsed';
  _el.innerHTML = `
    <span class="ci-dot"></span>
    <span class="ci-label">En vivo</span>
    <div class="ci-avatars">
      ${_participants.slice(0, 4).map(p =>
        `<div class="ci-av${p.isLocal ? ' local' : ''}" style="background:${p.color}" title="${p.displayName}">
          ${initials(p.displayName)}
         </div>`
      ).join('')}
    </div>
  `;
}

function renderExpanded() {
  _el.className = 'expanded';
  _el.innerHTML = `
    <span class="ci-dot"></span>
    <div class="ci-avatars">
      ${_participants.slice(0, 5).map(p =>
        `<div class="ci-av${p.isLocal ? ' local' : ''}" style="background:${p.color}">
          ${initials(p.displayName)}
          <span class="ci-av-tip">${p.displayName}${p.isLocal ? ' (Tú)' : ''}</span>
         </div>`
      ).join('')}
    </div>
    <div class="ci-sep"></div>
    <div class="ci-btns">
      <button class="ci-btn${_followCam ? ' on' : ''}" data-ci-action="cam" title="Seguir cámara">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14"/>
          <rect x="1" y="8" width="14" height="10" rx="2"/>
        </svg>
      </button>
      <button class="ci-btn" data-ci-action="invite" title="Invitar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <line x1="19" y1="8" x2="19" y2="14"/>
          <line x1="22" y1="11" x2="16" y2="11"/>
        </svg>
      </button>
      <button class="ci-btn" data-ci-action="view" title="Cambiar vista (${_view === 'top' ? '2D→3D' : '3D→2D'})">
        ${_view === 'top' ? '2D' : '3D'}
      </button>
      <button class="ci-btn end" data-ci-action="end" title="Salir de la sesión">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </div>
  `;

  _el.querySelector('[data-ci-action="cam"]')?.addEventListener('click', e => {
    e.stopPropagation();
    _followCam = !_followCam;
    if (_followCam) startCamBroadcast(); else stopCamBroadcast();
    renderExpanded();
  });
  _el.querySelector('[data-ci-action="invite"]')?.addEventListener('click', e => {
    e.stopPropagation();
    CollabInviteModal.show(CollabManager.inviteToken);
  });
  _el.querySelector('[data-ci-action="view"]')?.addEventListener('click', e => {
    e.stopPropagation();
    _view = _view === 'iso' ? 'top' : 'iso';
    SceneManager.setCamera(_view);
    renderExpanded();
  });
  _el.querySelector('[data-ci-action="end"]')?.addEventListener('click', e => {
    e.stopPropagation();
    CollabManager.end();
  });
}

function startCamBroadcast() {
  const tick = () => {
    if (!_followCam || !CollabManager.active) return;
    const cam  = SceneManager.activeCam;
    const ctrl = SceneManager.activeControls;
    if (cam && ctrl) {
      CollabManager.broadcastCameraMove({
        position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        target:   { x: ctrl.target.x,   y: ctrl.target.y,   z: ctrl.target.z }
      });
    }
    _camTimer = setTimeout(tick, 120);
  };
  tick();
}

function stopCamBroadcast() {
  if (_camTimer) { clearTimeout(_camTimer); _camTimer = null; }
}

export const CollabIsland = {
  init() {
    injectStyles();

    _wrap = document.createElement('div');
    _wrap.id = 'ci-wrap';
    _el = document.createElement('div');
    _el.id = 'ci-island';
    _wrap.appendChild(_el);
    document.body.appendChild(_wrap);

    _el.addEventListener('click', () => {
      if (!_expanded) { _expanded = true; renderExpanded(); }
    });

    document.addEventListener('click', e => {
      if (_expanded && !_wrap.contains(e.target)) {
        _expanded = false;
        renderCollapsed();
      }
    });

    document.addEventListener('escale:collab-presence', e => {
      _participants = e.detail.participants || [];
      _expanded ? renderExpanded() : renderCollapsed();
    });

    document.addEventListener('escale:collab-ended', () => this.hide());

    CollabManager.onCameraMove(({ position, target }) => {
      if (!_followCam) return;
      const cam  = SceneManager.activeCam;
      const ctrl = SceneManager.activeControls;
      if (!cam || !ctrl) return;
      cam.position.set(position.x, position.y, position.z);
      ctrl.target.set(target.x, target.y, target.z);
      ctrl.update?.();
    });
  },

  show() {
    if (!_el) this.init();
    _wrap.classList.add('visible');
    renderCollapsed();
  },

  hide() {
    _expanded = false;
    _followCam = false;
    stopCamBroadcast();
    _wrap?.classList.remove('visible');
  }
};

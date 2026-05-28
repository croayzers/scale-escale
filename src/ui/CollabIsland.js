import { CollabManager }       from '../services/CollabManager.js';
import { CollabInviteModal }    from './CollabInviteModal.js';
import { SceneManager }         from '../scene/SceneManager.js';
import { SubscriptionManager }  from '../services/SubscriptionManager.js';

let _wrap  = null;
let _el    = null;
let _participants = [];
let _view  = 'iso';
let _broadcasting = false;
let _camTimer     = null;

const initials = name => (name || '?').slice(0, 2).toUpperCase();
const isPro = () => ['pro', 'premium'].includes(SubscriptionManager.currentPlanCode?.() || '');

function injectStyles() {
  if (document.getElementById('ci-styles')) return;
  const s = document.createElement('style');
  s.id = 'ci-styles';
  s.textContent = `
    @property --ci-a { syntax:'<angle>'; initial-value:0deg; inherits:false; }
    @keyframes ci-spin  { to { --ci-a: 360deg; } }
    @keyframes ci-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
    @keyframes ci-pop   { from{opacity:0;transform:translateX(-50%) scale(.85)} to{opacity:1;transform:translateX(-50%) scale(1)} }
    @keyframes ci-thanks { 0%{opacity:0;transform:scale(.95)} 15%{opacity:1;transform:scale(1)} 85%{opacity:1} 100%{opacity:0} }

    #ci-wrap {
      display:none; position:fixed; top:54px; left:50%;
      transform:translateX(-50%); z-index:8500;
      border-radius:100px; padding:1.5px;
      background:conic-gradient(from var(--ci-a),#ff0080,#a855f7,#00d4ff,#10B981,#f59e0b,#ff0080);
      animation:ci-spin 4s linear infinite;
    }
    #ci-wrap.visible { display:block; animation:ci-pop .3s ease, ci-spin 4s linear infinite; }

    #ci-island {
      display:flex; align-items:center; gap:6px; padding:0 10px;
      background:rgba(10,10,14,.92); backdrop-filter:blur(20px);
      -webkit-backdrop-filter:blur(20px);
      border-radius:100px; height:38px; white-space:nowrap;
    }

    .ci-sep { width:1px; height:22px; background:rgba(255,255,255,.12); flex-shrink:0; }

    .ci-avatars { display:flex; align-items:center; gap:3px; }
    .ci-av {
      width:28px; height:28px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-size:9.5px; font-weight:800; color:#fff; flex-shrink:0;
      border:1.5px solid rgba(255,255,255,.12); position:relative; cursor:default;
    }
    .ci-av.local { border-color:rgba(255,255,255,.45); }
    .ci-av-tip {
      position:absolute; top:calc(100% + 6px); left:50%;
      transform:translateX(-50%);
      background:rgba(0,0,0,.88); color:#e5e7eb; font-size:10px;
      padding:3px 8px; border-radius:5px; white-space:nowrap;
      pointer-events:none; opacity:0; transition:opacity .12s; z-index:1;
    }
    .ci-av:hover .ci-av-tip { opacity:1; }

    .ci-btns { display:flex; align-items:center; gap:3px; }
    .ci-btn {
      width:30px; height:30px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.1);
      color:#cbd5e1; cursor:pointer; flex-shrink:0; transition:all .15s;
      font-size:10px; font-weight:800; font-family:inherit;
    }
    .ci-btn svg { pointer-events:none; }
    .ci-btn:hover:not(:disabled) { background:rgba(255,255,255,.15); color:#fff; border-color:rgba(255,255,255,.25); }
    .ci-btn.on  { background:rgba(16,185,129,.2); border-color:#10B981; color:#10B981; }
    .ci-btn:disabled { opacity:.35; cursor:not-allowed; }
    .ci-btn.end:hover { background:rgba(185,28,28,.28); border-color:#b91c1c; color:#fca5a5; }
    .ci-btn-pro { position:relative; }
    .ci-btn-pro[data-locked]::after {
      content:'PRO'; position:absolute; top:-5px; right:-5px;
      background:#f59e0b; color:#000; font-size:7px; font-weight:900;
      border-radius:4px; padding:1px 3px; pointer-events:none;
    }

    /* Dock disabled for viewers */
    #dock-items[data-collab-viewer] button {
      pointer-events:none; opacity:.35; cursor:not-allowed;
    }
    #dock-items[data-collab-viewer]::after {
      content:'Solo visualización';
      display:block; text-align:center; font-size:9px; color:rgba(255,255,255,.35);
      margin-top:4px; letter-spacing:.04em;
    }

    /* Header lock overlay for guests */
    #ci-header-lock {
      display:none; position:fixed; top:12px; left:12px; right:12px; height:44px;
      z-index:8400; border-radius:12px; cursor:not-allowed;
      background:rgba(0,0,0,.45); backdrop-filter:blur(2px);
      align-items:center; justify-content:center;
      font-size:12px; color:rgba(255,255,255,.7); font-weight:500;
      letter-spacing:.03em; pointer-events:all;
    }
    #ci-header-lock.visible { display:flex; }

    /* Thank-you screen */
    #ci-thanks-screen {
      display:none; position:fixed; inset:0; z-index:99999;
      background:rgba(10,10,14,.96); backdrop-filter:blur(24px);
      flex-direction:column; align-items:center; justify-content:center; gap:16px;
    }
    #ci-thanks-screen.visible {
      display:flex;
      animation:ci-thanks 5s ease forwards;
    }
    .ci-thanks-emoji { font-size:64px; }
    .ci-thanks-title { font-size:28px; font-weight:700; color:#f0ede8; font-family:inherit; }
    .ci-thanks-sub   { font-size:14px; color:#9ca3af; }
    .ci-thanks-bar   {
      width:200px; height:3px; border-radius:2px;
      background:rgba(255,255,255,.1); overflow:hidden; margin-top:8px;
    }
    .ci-thanks-bar-fill {
      height:100%; background:#10B981; border-radius:2px;
      animation:ci-fill 5s linear forwards;
    }
    @keyframes ci-fill { from{width:0%} to{width:100%} }
  `;
  document.head.appendChild(s);
}

function renderIsland() {
  if (!_el) return;
  const avatarsHtml = _participants.slice(0, 6).map(p => {
    const tipName = p.displayName + (p.isLocal ? ' (Tú)' : '');
    const tipCompany = p.company ? ` · ${p.company}` : '';
    return `
    <div class="ci-av${p.isLocal ? ' local' : ''}" style="background:${p.color}">
      ${initials(p.displayName)}
      <span class="ci-av-tip">${tipName}${tipCompany}</span>
    </div>`;
  }).join('');

  const canInvite = CollabManager.isHost && isPro();
  const inviteDisabled = !canInvite ? 'disabled' : '';
  const inviteLocked   = !isPro() ? 'data-locked' : '';

  _el.innerHTML = `
    <div class="ci-avatars">${avatarsHtml}</div>
    <div class="ci-sep"></div>
    <div class="ci-btns">
      <button class="ci-btn${_broadcasting ? ' on' : ''}" data-ci="cam" title="${_broadcasting ? 'Dejar de compartir cámara' : 'Compartir mi vista de cámara'}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14"/>
          <rect x="1" y="8" width="14" height="10" rx="2"/>
        </svg>
      </button>
      <button class="ci-btn ci-btn-pro" data-ci="invite" title="Copiar enlace de invitación" ${inviteDisabled} ${inviteLocked}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <line x1="19" y1="8" x2="19" y2="14"/>
          <line x1="22" y1="11" x2="16" y2="11"/>
        </svg>
      </button>
      <button class="ci-btn" data-ci="view" title="Cambiar vista">
        ${_view === 'top' ? '2D' : '3D'}
      </button>
      <button class="ci-btn end" data-ci="end" title="Salir de la sesión">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </div>
  `;

  _el.querySelector('[data-ci="cam"]')?.addEventListener('click', () => {
    _broadcasting = !_broadcasting;
    _broadcasting ? startCamBroadcast() : stopCamBroadcast();
    renderIsland();
  });

  _el.querySelector('[data-ci="invite"]')?.addEventListener('click', () => {
    CollabInviteModal.show(CollabManager.inviteToken);
  });

  _el.querySelector('[data-ci="view"]')?.addEventListener('click', () => {
    _view = _view === 'iso' ? 'top' : 'iso';
    SceneManager.setCamera(_view);
    renderIsland();
  });

  _el.querySelector('[data-ci="end"]')?.addEventListener('click', () => {
    CollabManager.end();
  });
}

function startCamBroadcast() {
  const tick = () => {
    if (!_broadcasting || !CollabManager.active) return;
    const cam  = SceneManager.activeCam;
    const ctrl = SceneManager.activeControls;
    if (cam && ctrl) {
      CollabManager.broadcastCameraMove({
        position: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        target:   { x: ctrl.target.x,   y: ctrl.target.y,   z: ctrl.target.z }
      });
    }
    _camTimer = setTimeout(tick, 100);
  };
  tick();
}

function stopCamBroadcast() {
  if (_camTimer) { clearTimeout(_camTimer); _camTimer = null; }
}

function showThanksAndRedirect() {
  const screen = document.getElementById('ci-thanks-screen');
  if (!screen) return;
  screen.classList.add('visible');
  setTimeout(() => {
    window.location.href = 'https://escale3d.vercel.app';
  }, 5000);
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

    // Header lock overlay for guests
    const lock = document.createElement('div');
    lock.id = 'ci-header-lock';
    document.body.appendChild(lock);

    // Thank-you screen
    const thanks = document.createElement('div');
    thanks.id = 'ci-thanks-screen';
    thanks.innerHTML = `
      <div class="ci-thanks-emoji">🙌</div>
      <div class="ci-thanks-title">¡Gracias por colaborar!</div>
      <div class="ci-thanks-sub">Volviendo a E-scale…</div>
      <div class="ci-thanks-bar"><div class="ci-thanks-bar-fill"></div></div>
    `;
    document.body.appendChild(thanks);

    document.addEventListener('escale:collab-presence', e => {
      _participants = e.detail.participants || [];
      renderIsland();
    });

    document.addEventListener('escale:collab-ended', e => {
      if (!e.detail?.wasHost) {
        showThanksAndRedirect();
      }
      this.hide();
    });

    // Apply incoming camera from whoever is broadcasting
    CollabManager.onCameraMove(({ position, target }) => {
      const cam  = SceneManager.activeCam;
      const ctrl = SceneManager.activeControls;
      if (!cam || !ctrl) return;
      cam.position.set(position.x, position.y, position.z);
      ctrl.target.set(target.x, target.y, target.z);
      if (typeof ctrl.update === 'function') ctrl.update();
    });
  },

  show() {
    if (!_el) this.init();
    _wrap.classList.add('visible');
    renderIsland();

    // Lock header for guests and show host info
    if (!CollabManager.isHost) {
      const lock = document.getElementById('ci-header-lock');
      const header = document.getElementById('header-mac');
      if (lock) {
        const host = CollabManager.hostName || CollabManager.sessionName || 'el anfitrión';
        lock.textContent = `Invitado por ${host}`;
        lock.classList.add('visible');
      }
      if (header) header.style.pointerEvents = 'none';
    }

    // Disable dock for viewers
    if (CollabManager.localRole === 'viewer') {
      document.getElementById('dock-items')?.setAttribute('data-collab-viewer', '');
    }
  },

  hide() {
    stopCamBroadcast();
    _broadcasting = false;
    _wrap?.classList.remove('visible');

    const lock   = document.getElementById('ci-header-lock');
    const header = document.getElementById('header-mac');
    lock?.classList.remove('visible');
    if (header) header.style.pointerEvents = '';
    document.getElementById('dock-items')?.removeAttribute('data-collab-viewer');
  }
};

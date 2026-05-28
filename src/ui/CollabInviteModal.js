import { CollabManager } from '../services/CollabManager.js';
import { AppState }       from '../core/AppState.js';
import { AuthManager }    from '../services/AuthManager.js';

let _el = null;

function q(attr) { return _el?.querySelector(`[data-ci="${attr}"]`); }

function buildInviteUrl(token) {
  const base = window.location.origin + window.location.pathname;
  return `${base}?collab=${token}`;
}

function renderParticipants(participants) {
  const container = q('participants');
  if (!container) return;
  if (!participants.length) {
    container.innerHTML = '<p class="ci-empty">Esperando que alguien se una…</p>';
    return;
  }
  container.innerHTML = participants.map(p => `
    <div class="ci-participant">
      <span class="ci-dot" style="background:${p.color}"></span>
      <span class="ci-pname">${p.isLocal ? `${p.displayName} (Tú)` : p.displayName}</span>
      <span class="ci-prole">${p.role === 'viewer' ? '👁 Visor' : '✏️ Editor'}</span>
    </div>
  `).join('');
}

function injectStyles() {
  if (document.getElementById('collab-invite-styles')) return;
  const s = document.createElement('style');
  s.id = 'collab-invite-styles';
  s.textContent = `
    #collab-invite-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:9000; align-items:center; justify-content:center; }
    #collab-invite-modal.visible { display:flex; }
    .ci-box { background:#1c1c1e; border:1px solid #2a2a2e; border-radius:14px; width:460px; max-width:calc(100vw - 32px); box-shadow:0 24px 64px rgba(0,0,0,.5); color:#f0ede8; font-family:inherit; }
    .ci-header { display:flex; align-items:center; justify-content:space-between; padding:18px 20px 14px; border-bottom:1px solid #2a2a2e; }
    .ci-title { font-size:15px; font-weight:600; display:flex; align-items:center; gap:8px; }
    .ci-live { display:inline-block; width:8px; height:8px; border-radius:50%; background:#10B981; animation:ci-blink 1.4s infinite; }
    @keyframes ci-blink { 0%,100%{opacity:1} 50%{opacity:.3} }
    .ci-close { background:none; border:none; color:#9ca3af; font-size:20px; cursor:pointer; padding:0 4px; line-height:1; }
    .ci-body { padding:20px; }
    .ci-label { display:block; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:#6b7280; margin-bottom:6px; }
    .ci-link-row { display:flex; gap:8px; }
    .ci-link-input { flex:1; background:#111; border:1px solid #374151; border-radius:8px; padding:8px 10px; color:#d1d5db; font-size:13px; outline:none; }
    .ci-copy-btn { background:#374151; border:1px solid #4b5563; border-radius:8px; color:#f0ede8; font-size:13px; padding:8px 14px; cursor:pointer; white-space:nowrap; transition:background .15s; }
    .ci-copy-btn:hover { background:#4b5563; }
    .ci-role-group { margin-top:16px; }
    .ci-role-select { width:100%; background:#111; border:1px solid #374151; border-radius:8px; color:#d1d5db; font-size:13px; padding:8px 10px; outline:none; cursor:pointer; }
    .ci-separator { border:none; border-top:1px solid #2a2a2e; margin:18px 0; }
    .ci-participants-list { min-height:44px; }
    .ci-participant { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #1e1e22; }
    .ci-participant:last-child { border-bottom:none; }
    .ci-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
    .ci-pname { flex:1; font-size:13px; color:#e5e7eb; }
    .ci-prole { font-size:11px; color:#9ca3af; }
    .ci-empty { font-size:13px; color:#6b7280; padding:8px 0; }
    .ci-footer { padding:14px 20px; border-top:1px solid #2a2a2e; display:flex; gap:10px; justify-content:flex-end; }
    .ci-share-btn { background:none; border:1px solid #374151; border-radius:8px; color:#d1d5db; font-size:13px; padding:8px 14px; cursor:pointer; }
    .ci-share-btn:hover { background:#1e1e22; }
    .ci-end-btn { background:#b91c1c; border:none; border-radius:8px; color:#fff; font-size:13px; padding:8px 16px; cursor:pointer; transition:background .15s; }
    .ci-end-btn:hover { background:#dc2626; }
  `;
  document.head.appendChild(s);
}

export const CollabInviteModal = {
  init() {
    injectStyles();
    _el = document.createElement('div');
    _el.id = 'collab-invite-modal';
    _el.innerHTML = `
      <div class="ci-box">
        <div class="ci-header">
          <span class="ci-title"><span class="ci-live"></span> Sesión de colaboración activa</span>
          <button data-ci="close" class="ci-close" title="Cerrar">×</button>
        </div>
        <div class="ci-body">
          <label class="ci-label">Enlace de invitación</label>
          <div class="ci-link-row">
            <input data-ci="link-input" class="ci-link-input" readonly />
            <button data-ci="copy-btn" class="ci-copy-btn">Copiar</button>
          </div>

          <div class="ci-role-group">
            <label class="ci-label">Permiso del invitado</label>
            <select data-ci="role-select" class="ci-role-select">
              <option value="editor">✏️ Editor — puede mover y añadir elementos</option>
              <option value="viewer">👁 Visor — solo ve los cambios en tiempo real</option>
            </select>
          </div>

          <hr class="ci-separator" />

          <label class="ci-label">Conectados</label>
          <div data-ci="participants" class="ci-participants-list">
            <p class="ci-empty">Esperando que alguien se una…</p>
          </div>
        </div>
        <div class="ci-footer">
          <button data-ci="email-btn" class="ci-share-btn">Enviar por email</button>
          <button data-ci="end-btn" class="ci-end-btn">Terminar sesión</button>
        </div>
      </div>
    `;
    document.body.appendChild(_el);

    q('close')?.addEventListener('click', () => this.hide());

    q('copy-btn')?.addEventListener('click', () => {
      const url = q('link-input')?.value;
      if (!url) return;
      navigator.clipboard?.writeText(url).then(() => {
        const btn = q('copy-btn');
        if (btn) { btn.textContent = '¡Copiado!'; setTimeout(() => { btn.textContent = 'Copiar'; }, 2200); }
      }).catch(() => {
        q('link-input').select();
        document.execCommand('copy');
      });
    });

    q('email-btn')?.addEventListener('click', () => {
      const url = q('link-input')?.value || '';
      const event = AppState.company?.cliente || 'el plano';
      const subject = encodeURIComponent(`Te invito a colaborar en ${event}`);
      const body    = encodeURIComponent(`Hola, te invito a colaborar conmigo en ${event}.\n\nAbres este enlace y entras directamente:\n${url}`);
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    });

    q('end-btn')?.addEventListener('click', () => {
      CollabManager.end();
      this.hide();
    });

    // Update participant list on presence changes
    document.addEventListener('escale:collab-presence', e => renderParticipants(e.detail.participants || []));
    document.addEventListener('escale:collab-ended', () => this.hide());
  },

  async openOrStart() {
    if (!_el) this.init();

    if (CollabManager.active) {
      this.show(CollabManager.inviteToken, CollabManager.localRole === 'viewer' ? 'viewer' : (q('role-select')?.value || 'editor'));
      return;
    }

    // Start a new session
    const session = AppState.company;
    const displayName = session?.authDisplayName || session?.name || 'Host';
    const sessionName = session?.cliente || session?.venue || 'Planificación';
    const guestRole   = 'editor';
    const accessToken = AuthManager.getSession?.()?.access_token || '';

    try {
      const data = await CollabManager.startSession({ sessionName, displayName, guestRole, accessToken });
      document.dispatchEvent(new CustomEvent('escale:collab-joined', { detail: data }));
      this.show(data.inviteToken, guestRole);
    } catch (err) {
      console.error('[CollabInviteModal]', err);
      alert('No se pudo iniciar la sesión: ' + err.message);
    }
  },

  show(inviteToken, guestRole = 'editor') {
    if (!_el) this.init();
    const input = q('link-input');
    if (input) input.value = buildInviteUrl(inviteToken);
    const sel = q('role-select');
    if (sel) sel.value = guestRole;
    renderParticipants([]);
    _el.classList.add('visible');
  },

  hide() { _el?.classList.remove('visible'); }
};

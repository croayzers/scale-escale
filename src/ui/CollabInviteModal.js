import { CollabManager }       from '../services/CollabManager.js';
import { AppState }            from '../core/AppState.js';
import { AuthManager }         from '../services/AuthManager.js';
import { SubscriptionManager } from '../services/SubscriptionManager.js';

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

    /* Create-link state */
    .ci-create-section { text-align:center; padding:8px 0 4px; }
    .ci-create-hint { font-size:13px; color:#6b7280; margin-bottom:16px; line-height:1.5; }
    .ci-create-btn {
      width:100%; background:#3B82F6; border:none; border-radius:10px; color:#fff;
      font-size:14px; font-weight:600; padding:13px; cursor:pointer;
      display:flex; align-items:center; justify-content:center; gap:8px;
      transition:background .15s; font-family:inherit;
    }
    .ci-create-btn:hover:not(:disabled) { background:#2563eb; }
    .ci-create-btn:disabled { background:#374151; cursor:not-allowed; opacity:.7; }

    /* Link-visible state */
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
    .ci-share-group { display:flex; gap:8px; }
    .ci-share-btn { display:flex; align-items:center; gap:6px; background:none; border:1px solid #374151; border-radius:8px; color:#d1d5db; font-size:13px; padding:7px 12px; cursor:pointer; transition:background .15s,border-color .15s; white-space:nowrap; }
    .ci-share-btn:hover { background:#1e1e22; border-color:#4b5563; }
    .ci-share-wa { border-color:#25d366; color:#25d366; }
    .ci-share-wa:hover { background:rgba(37,211,102,.12); }
    .ci-share-email:hover { background:#1e1e22; }
    .ci-end-btn { background:#b91c1c; border:none; border-radius:8px; color:#fff; font-size:13px; padding:8px 16px; cursor:pointer; transition:background .15s; }
    .ci-end-btn:hover { background:#dc2626; }
    .ci-editor-warn { display:none; margin-top:10px; padding:9px 12px; background:rgba(245,158,11,.12); border:1px solid rgba(245,158,11,.35); border-radius:8px; font-size:12px; color:#f59e0b; line-height:1.5; gap:7px; align-items:flex-start; }
    .ci-editor-warn.visible { display:flex; }
    .ci-editor-warn-icon { font-size:15px; flex-shrink:0; margin-top:1px; }
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
          <span class="ci-title"><span class="ci-live"></span> Sesión de colaboración</span>
          <button data-ci="close" class="ci-close" title="Cerrar">×</button>
        </div>
        <div class="ci-body">

          <!-- State A: create link -->
          <div data-ci="state-create" class="ci-create-section">
            <p class="ci-create-hint">
              Configura el acceso y genera un enlace para compartir con tu equipo.<br>
              <small style="color:#4b5563">Válido 5 días · máx. 5 participantes</small>
            </p>
            <div class="ci-role-group" style="text-align:left; margin-bottom:16px;">
              <label class="ci-label">Permiso del invitado</label>
              <select data-ci="role-select" class="ci-role-select">
                <option value="viewer">👁 Visor — solo ve los cambios en tiempo real</option>
                <option value="editor">✏️ Editor — puede mover y añadir elementos</option>
              </select>
              <div data-ci="editor-warn" class="ci-editor-warn">
                <span class="ci-editor-warn-icon">⚠️</span>
                <span>Tenga en cuenta que el modo editor, en móvil aún no está disponible.</span>
              </div>
            </div>
            <button data-ci="create-link-btn" class="ci-create-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              </svg>
              Crear enlace de invitación
            </button>
          </div>

          <!-- State B: link visible -->
          <div data-ci="state-link" hidden>
            <label class="ci-label">Enlace de invitación</label>
            <div class="ci-link-row">
              <input data-ci="link-input" class="ci-link-input" readonly />
              <button data-ci="copy-btn" class="ci-copy-btn">Copiar</button>
            </div>

            <hr class="ci-separator" />

            <label class="ci-label">Conectados</label>
            <div data-ci="participants" class="ci-participants-list">
              <p class="ci-empty">Esperando que alguien se una…</p>
            </div>
          </div>

        </div>
        <div class="ci-footer">
          <div data-ci="share-btns" class="ci-share-group" hidden>
            <button data-ci="wa-btn" class="ci-share-btn ci-share-wa" title="Compartir por WhatsApp">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </button>
            <button data-ci="email-btn" class="ci-share-btn ci-share-email" title="Compartir por email">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              Email
            </button>
          </div>
          <button data-ci="end-btn" class="ci-end-btn">Terminar sesión</button>
        </div>
      </div>
    `;
    document.body.appendChild(_el);

    q('close')?.addEventListener('click', () => this.hide());

    q('role-select')?.addEventListener('change', () => {
      const warn = q('editor-warn');
      if (warn) warn.classList.toggle('visible', q('role-select')?.value === 'editor');
    });

    q('create-link-btn')?.addEventListener('click', async () => {
      if (!SubscriptionManager.ensureFeature('collabHost')) return;
      const btn = q('create-link-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Creando…'; }

      const session   = AppState.company;
      const displayName = session?.authDisplayName || session?.name || 'Host';
      const sessionName = session?.cliente || session?.venue || 'Planificación';
      const guestRole   = q('role-select')?.value || 'editor';
      const accessToken = AuthManager.getSession?.()?.access_token || '';

      try {
        const data = await CollabManager.startSession({ sessionName, displayName, guestRole, accessToken });
        document.dispatchEvent(new CustomEvent('escale:collab-joined', { detail: data }));
        this._showLink(data.inviteToken);
      } catch (err) {
        if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Crear enlace de invitación`; }
        console.error('[CollabInviteModal]', err);
        alert('No se pudo iniciar la sesión: ' + err.message);
      }
    });

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
      const url   = q('link-input')?.value || '';
      const event = AppState.company?.cliente || 'el plano';
      const subject = encodeURIComponent(`Te invito a colaborar en ${event}`);
      const body    = encodeURIComponent(`Hola, te invito a colaborar conmigo en ${event}.\n\nAbres este enlace y entras directamente:\n${url}`);
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    });

    q('wa-btn')?.addEventListener('click', () => {
      const url   = q('link-input')?.value || '';
      const event = AppState.company?.cliente || 'el plano';
      const text  = encodeURIComponent(`Hola, te invito a colaborar conmigo en ${event}.\n\nEntra directamente con este enlace:\n${url}`);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    });

    q('end-btn')?.addEventListener('click', () => {
      CollabManager.end();
      this.hide();
    });

    document.addEventListener('escale:collab-presence', e => renderParticipants(e.detail.participants || []));
    document.addEventListener('escale:collab-ended', () => this.hide());
  },

  _showLink(inviteToken) {
    q('state-create')?.setAttribute('hidden', '');
    const stateLink = q('state-link');
    if (stateLink) stateLink.removeAttribute('hidden');
    const input = q('link-input');
    if (input) input.value = buildInviteUrl(inviteToken);
    q('share-btns')?.removeAttribute('hidden');
    renderParticipants([]);
  },

  open() {
    if (!_el) this.init();
    if (CollabManager.active) {
      this._showLink(CollabManager.inviteToken);
    } else {
      // Reset to create state
      q('state-create')?.removeAttribute('hidden');
      q('state-link')?.setAttribute('hidden', '');
      q('share-btns')?.setAttribute('hidden', '');
      const btn = q('create-link-btn');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Crear enlace de invitación`;
      }
    }
    _el.classList.add('visible');
  },

  // Legacy alias used from CollabIsland invite button
  show(inviteToken) {
    if (!_el) this.init();
    this._showLink(inviteToken);
    _el.classList.add('visible');
  },

  hide() { _el?.classList.remove('visible'); }
};

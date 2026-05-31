import { AppState }     from '../core/AppState.js';
import { SceneManager }  from '../scene/SceneManager.js';
import { ServiceConfig } from './ServiceConfig.js';
import { AuthManager }   from './AuthManager.js';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#EF4444', '#F97316'];

let _sbClient   = null;
let _channel    = null;
let _sessionId  = null;
let _sessionName = null;
let _hostName   = null;
let _inviteToken = null;
let _isHost     = false;
let _localRole  = 'editor';   // 'editor' | 'viewer'
let _localUserId = null;
let _localName  = null;
let _localColor = null;
let _lastSnap        = null;  // deep copy of items after last broadcast
let _throttleTimer   = null;  // throttle for 30 broadcasts/s
let _pendingBroadcast = false;
let _presenceCb  = null;
let _camMoveCb   = null;
let _localCompany = null;

// ── Supabase realtime client ──────────────────────────────────────────────────

function makeClient() {
  if (_sbClient) return _sbClient;
  // Reuse the existing Supabase client from AuthManager to avoid duplicate instances
  const existing = AuthManager.getSupabaseClient?.();
  if (existing) { _sbClient = existing; return _sbClient; }
  const svc = ServiceConfig.getService('supabase');
  if (!svc?.url || !svc?.anonKey || !window.supabase) return null;
  _sbClient = window.supabase.createClient(svc.url, svc.anonKey, {
    realtime: { params: { eventsPerSecond: 15 } }
  });
  return _sbClient;
}

// ── Delta computation ─────────────────────────────────────────────────────────

function snap() {
  return JSON.parse(JSON.stringify(AppState.items || []));
}

function computeDelta(prev, curr) {
  const prevMap = new Map((prev || []).map(it => [it.id, JSON.stringify(it)]));
  const currMap = new Map((curr || []).map(it => [it.id, it]));
  const added = [], updated = [], deleted = [];
  for (const [id, item] of currMap) {
    if (!prevMap.has(id)) added.push(item);
    else if (prevMap.get(id) !== JSON.stringify(item)) updated.push(item);
  }
  for (const id of prevMap.keys()) {
    if (!currMap.has(id)) deleted.push(id);
  }
  return { added, updated, deleted };
}

function applyDelta({ added = [], updated = [], deleted = [] }) {
  const items = AppState.items;
  for (const id of deleted) {
    const i = items.findIndex(it => it.id === id);
    if (i !== -1) items.splice(i, 1);
  }
  for (const item of updated) {
    const i = items.findIndex(it => it.id === item.id);
    if (i !== -1) Object.assign(items[i], item);
    else items.push(item);
  }
  for (const item of added) {
    if (!items.find(it => it.id === item.id)) items.push(item);
  }
  AppState.items.forEach(it => SceneManager.rebuild(it));
  document.dispatchEvent(new CustomEvent('escale:collab-remote-update'));
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

function doBroadcast() {
  if (!_channel || _localRole === 'viewer') return;
  const curr = snap();
  if (!_lastSnap) { _lastSnap = curr; return; }
  const delta = computeDelta(_lastSnap, curr);
  if (!delta.added.length && !delta.updated.length && !delta.deleted.length) return;
  _lastSnap = curr;
  _channel.send({ type: 'broadcast', event: 'delta', payload: { delta, from: _localUserId } });
}

function onSceneChange() {
  _pendingBroadcast = true;
  if (_throttleTimer) return;
  _pendingBroadcast = false;
  doBroadcast();
  _throttleTimer = setTimeout(() => {
    _throttleTimer = null;
    if (_pendingBroadcast) { _pendingBroadcast = false; onSceneChange(); }
  }, 33); // ~30 broadcasts/second
}

// ── Channel connection ────────────────────────────────────────────────────────

async function connect(channelName) {
  const client = makeClient();
  if (!client) { console.warn('[CollabManager] Supabase client unavailable — realtime disabled'); return false; }

  _channel = client.channel(channelName, {
    config: { broadcast: { self: false }, presence: { key: _localUserId } }
  });

  _channel
    .on('broadcast', { event: 'delta' }, ({ payload }) => {
      if (payload.from === _localUserId) return;
      applyDelta(payload.delta);
      _lastSnap = snap();
    })
    .on('broadcast', { event: 'full_sync' }, ({ payload }) => {
      if (payload.from === _localUserId) return;
      AppState.items.length = 0;
      for (const it of (payload.items || [])) AppState.items.push(it);
      AppState.items.forEach(it => SceneManager.rebuild(it));
      _lastSnap = snap();
    })
    .on('broadcast', { event: 'camera-move' }, ({ payload }) => {
      if (payload.from === _localUserId) return;
      _camMoveCb?.(payload);
    })
    .on('broadcast', { event: 'collab-note' }, ({ payload }) => {
      if (payload.from === _localUserId) return;
      document.dispatchEvent(new CustomEvent('escale:collab-note', { detail: payload }));
    })
    .on('broadcast', { event: 'collab-note-dismiss' }, ({ payload }) => {
      if (payload.from === _localUserId) return;
      document.dispatchEvent(new CustomEvent('escale:collab-note-dismiss', { detail: payload }));
    })
    .on('broadcast', { event: 'request_sync' }, ({ payload }) => {
      if (!_isHost || payload.from === _localUserId) return;
      _channel.send({ type: 'broadcast', event: 'full_sync', payload: { from: _localUserId, items: snap() } });
    })
    .on('presence', { event: 'sync' }, () => {
      const seen = new Set();
      const participants = Object.values(_channel.presenceState())
        .flat()
        .filter(p => {
          if (!p.userId || seen.has(p.userId)) return false;
          seen.add(p.userId);
          return true;
        })
        .map((p, i) => ({
          userId:         p.userId,
          displayName:    p.displayName || 'Usuario',
          company:        p.company || '',
          color:          p.color || COLORS[i % COLORS.length],
          role:           p.role || 'editor',
          selectedItemId: p.selectedItemId || null,
          isLocal:        p.userId === _localUserId
        }));
      document.dispatchEvent(new CustomEvent('escale:collab-presence', { detail: { participants } }));
      _presenceCb?.(participants);
    })
    .on('presence', { event: 'join' }, () => {
      if (_isHost) {
        setTimeout(() => {
          _channel.send({ type: 'broadcast', event: 'full_sync', payload: { from: _localUserId, items: snap() } });
        }, 400);
      }
    });

  await new Promise(resolve => {
    const t = setTimeout(resolve, 6000);
    _channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(t);
        await _channel.track({ userId: _localUserId, displayName: _localName, company: _localCompany || '', color: _localColor, role: _localRole });
        if (!_isHost) {
          setTimeout(() => {
            _channel.send({ type: 'broadcast', event: 'request_sync', payload: { from: _localUserId } });
          }, 800);
        }
        resolve();
      }
    });
  });

  document.addEventListener('escale:scene-insights-changed', onSceneChange);
  return true;
}

// ── Public API ────────────────────────────────────────────────────────────────

export const CollabManager = {
  get active()      { return Boolean(_sessionId); },
  get sessionId()   { return _sessionId; },
  get sessionName() { return _sessionName; },
  get hostName()    { return _hostName; },
  get inviteToken() { return _inviteToken; },
  get isHost()      { return _isHost; },
  get localRole()   { return _localRole; },

  async init() {
    // Detect invite token in URL — CollabJoinModal will react to this event
    const token = new URLSearchParams(window.location.search).get('collab');
    if (token) {
      document.dispatchEvent(new CustomEvent('escale:collab-invite-detected', { detail: { token } }));
    }
  },

  async startSession({ sessionName, displayName, guestRole = 'editor', accessToken } = {}) {
    const sceneSnap = snap();
    const planSnap  = AppState.plan
      ? { widthM: AppState.plan.widthM ?? 0, lengthM: AppState.plan.lengthM ?? 0 }
      : {};

    const resp = await fetch(ServiceConfig.getUrl('collabCreate'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({ sessionName, hostDisplayName: displayName, guestRole, sceneSnapshot: sceneSnap, planSnapshot: planSnap })
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'No se pudo crear la sesión');

    _sessionId   = data.sessionId;
    _sessionName = sessionName || 'Colaboración';
    _inviteToken = data.inviteToken;
    _isHost      = true;
    _localRole   = 'editor';
    _localUserId = `host-${Date.now()}`;
    _localName   = displayName || 'Host';
    _localColor  = COLORS[0];
    _lastSnap    = sceneSnap;

    await connect(data.channelName);
    return data;
  },

  async joinSession({ inviteToken, displayName, company = '', email } = {}) {
    const resp = await fetch(ServiceConfig.getUrl('collabJoin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteToken, displayName, email })
    });
    const data = await resp.json();
    if (!data.ok) {
      const msg = data.error === 'session_not_found' ? 'Sesión no encontrada o expirada'
                : data.error === 'session_expired'   ? 'El enlace ha caducado (válido 5 días)'
                : data.error === 'session_full'      ? 'Sesión completa — máximo 5 participantes'
                : (data.error || 'No se pudo conectar');
      throw new Error(msg);
    }

    // Load host's scene snapshot
    AppState.items.length = 0;
    for (const it of (data.snapshot?.items || [])) AppState.items.push(it);
    AppState.items.forEach(it => SceneManager.rebuild(it));

    _sessionId    = data.sessionId;
    _sessionName  = data.sessionName;
    _hostName     = data.hostName || null;
    _isHost       = false;
    _localRole    = data.guestRole || 'editor';
    _localUserId  = `guest-${Date.now()}`;
    _localName    = displayName;
    _localCompany = company || '';
    _localColor   = COLORS[1 + Math.floor(Math.random() * (COLORS.length - 1))];
    _lastSnap     = snap();

    await connect(data.channelName);
    return data;
  },

  get localName()  { return _localName; },
  get localColor() { return _localColor; },

  onPresenceChange(fn) { _presenceCb = fn; },
  onCameraMove(fn)     { _camMoveCb  = fn; },

  updatePresence(extra = {}) {
    if (!_channel) return;
    _channel.track({ userId: _localUserId, displayName: _localName, company: _localCompany || '', color: _localColor, role: _localRole, ...extra });
  },

  sendNoteEvent(type, payload) {
    if (!_channel) return;
    const full = { ...payload, from: _localUserId };
    _channel.send({ type: 'broadcast', event: type, payload: full });
    // Apply locally via DOM event (sender doesn't receive own broadcast)
    document.dispatchEvent(new CustomEvent(`escale:${type}`, { detail: full }));
  },

  broadcastCameraMove(data) {
    if (!_channel || _localRole === 'viewer') return;
    _channel.send({ type: 'broadcast', event: 'camera-move', payload: { ...data, from: _localUserId } });
  },

  end() {
    if (_throttleTimer) { clearTimeout(_throttleTimer); _throttleTimer = null; }
    _pendingBroadcast = false;
    try { _channel?.unsubscribe(); } catch {}
    _channel = null;
    document.removeEventListener('escale:scene-insights-changed', onSceneChange);
    const wasHost = _isHost;
    _sessionId = null; _sessionName = null; _hostName = null; _inviteToken = null;
    _isHost = false; _lastSnap = null; _localCompany = null;
    document.dispatchEvent(new CustomEvent('escale:collab-ended', { detail: { wasHost } }));
  }
};

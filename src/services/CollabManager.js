import { AppState }     from '../core/AppState.js';
import { SceneManager }  from '../scene/SceneManager.js';
import { ServiceConfig } from './ServiceConfig.js';
import { AuthManager }   from './AuthManager.js';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#EF4444', '#F97316'];

let _sbClient   = null;
let _channel    = null;
let _sessionId  = null;
let _sessionName = null;
let _inviteToken = null;
let _isHost     = false;
let _localRole  = 'editor';   // 'editor' | 'viewer'
let _localUserId = null;
let _localName  = null;
let _localColor = null;
let _lastSnap   = null;       // deep copy of items after last broadcast
let _debounce   = null;
let _presenceCb = null;

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
  SceneManager.rebuildAll?.();
  document.dispatchEvent(new CustomEvent('escale:collab-remote-update'));
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

function doBroadcast() {
  _debounce = null;
  if (!_channel || _localRole === 'viewer') return;
  const curr = snap();
  if (!_lastSnap) { _lastSnap = curr; return; }
  const delta = computeDelta(_lastSnap, curr);
  if (!delta.added.length && !delta.updated.length && !delta.deleted.length) return;
  _lastSnap = curr;
  _channel.send({ type: 'broadcast', event: 'delta', payload: { delta, from: _localUserId } });
}

function onSceneChange() {
  if (_debounce) clearTimeout(_debounce);
  _debounce = setTimeout(doBroadcast, 150);
}

// ── Channel connection ────────────────────────────────────────────────────────

async function connect(channelName) {
  const client = makeClient();
  if (!client) { console.warn('[CollabManager] Supabase client unavailable — realtime disabled'); return false; }

  console.log('[CollabManager] conectando canal', channelName, _isHost ? '(host)' : '(guest)');

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
      console.log('[CollabManager] full_sync recibido, items:', payload.items?.length);
      if (payload.from === _localUserId) return;
      AppState.items.length = 0;
      for (const it of (payload.items || [])) AppState.items.push(it);
      SceneManager.rebuildAll?.();
      _lastSnap = snap();
    })
    .on('broadcast', { event: 'request_sync' }, ({ payload }) => {
      console.log('[CollabManager] request_sync recibido, isHost:', _isHost);
      if (!_isHost || payload.from === _localUserId) return;
      console.log('[CollabManager] enviando full_sync con', snap().length, 'items');
      _channel.send({ type: 'broadcast', event: 'full_sync', payload: { from: _localUserId, items: snap() } });
    })
    .on('presence', { event: 'sync' }, () => {
      const participants = Object.values(_channel.presenceState())
        .flat()
        .map((p, i) => ({
          userId:      p.userId,
          displayName: p.displayName || 'Usuario',
          color:       p.color || COLORS[i % COLORS.length],
          role:        p.role || 'editor',
          isLocal:     p.userId === _localUserId
        }));
      document.dispatchEvent(new CustomEvent('escale:collab-presence', { detail: { participants } }));
      _presenceCb?.(participants);
    })
    .on('presence', { event: 'join' }, () => {
      console.log('[CollabManager] presence join, isHost:', _isHost);
      if (_isHost) {
        setTimeout(() => {
          console.log('[CollabManager] enviando full_sync por join con', snap().length, 'items');
          _channel.send({ type: 'broadcast', event: 'full_sync', payload: { from: _localUserId, items: snap() } });
        }, 400);
      }
    });

  await new Promise(resolve => {
    const t = setTimeout(resolve, 6000);
    _channel.subscribe(async status => {
      console.log('[CollabManager] canal status:', status);
      if (status === 'SUBSCRIBED') {
        clearTimeout(t);
        await _channel.track({ userId: _localUserId, displayName: _localName, color: _localColor, role: _localRole });
        if (!_isHost) {
          setTimeout(() => {
            console.log('[CollabManager] guest enviando request_sync');
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

  async joinSession({ inviteToken, displayName, email } = {}) {
    const resp = await fetch(ServiceConfig.getUrl('collabJoin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteToken, displayName, email })
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error === 'session_not_found' ? 'Sesión no encontrada o expirada' : (data.error || 'No se pudo conectar'));

    // Load host's scene snapshot
    AppState.items.length = 0;
    for (const it of (data.snapshot?.items || [])) AppState.items.push(it);
    SceneManager.rebuildAll?.();

    _sessionId   = data.sessionId;
    _sessionName = data.sessionName;
    _isHost      = false;
    _localRole   = data.guestRole || 'editor';
    _localUserId = `guest-${Date.now()}`;
    _localName   = displayName;
    _localColor  = COLORS[1 + Math.floor(Math.random() * (COLORS.length - 1))];
    _lastSnap    = snap();

    await connect(data.channelName);
    return data;
  },

  onPresenceChange(fn) { _presenceCb = fn; },

  end() {
    if (_debounce) { clearTimeout(_debounce); _debounce = null; }
    _channel?.unsubscribe();
    _channel = null;
    document.removeEventListener('escale:scene-insights-changed', onSceneChange);
    _sessionId = null; _sessionName = null; _inviteToken = null;
    _isHost = false; _lastSnap = null;
    document.dispatchEvent(new CustomEvent('escale:collab-ended'));
  }
};

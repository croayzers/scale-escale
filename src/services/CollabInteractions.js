import { CollabManager } from './CollabManager.js';
import { AppState }      from '../core/AppState.js';
import { SceneManager }  from '../scene/SceneManager.js';

// { itemId, helper } keyed by remote userId
const _lockBoxes  = new Map();
// { itemId, helper } keyed by noteId
const _noteGlows  = new Map();
// { div, itemId } keyed by noteId
const _noteLabels = new Map();
// active note payloads keyed by noteId
const _notes      = new Map();
// current noteId per itemId (max one note per item)
const _itemNoteMap = new Map();

let _presenceDebounce = null;
let _lastSelectedId   = null;

// ── Presence: broadcast local selection ───────────────────────────────────────

function syncSelectionToPresence() {
  if (!CollabManager.active) return;
  const id = AppState.selectedId ?? null;
  if (id === _lastSelectedId) return;
  _lastSelectedId = id;
  CollabManager.updatePresence({ selectedItemId: id });
}

// ── Lock boxes: red wireframe on remotely-selected items ──────────────────────

function updateLockBoxes(participants) {
  // Collect stale entries
  const toRemove = [];
  for (const [userId] of _lockBoxes) {
    if (!participants.some(p => !p.isLocal && p.userId === userId && p.selectedItemId)) {
      toRemove.push(userId);
    }
  }
  for (const uid of toRemove) {
    SceneManager.scene?.remove(_lockBoxes.get(uid).helper);
    _lockBoxes.delete(uid);
  }

  for (const p of participants) {
    if (p.isLocal || !p.selectedItemId) continue;
    const existing = _lockBoxes.get(p.userId);
    if (existing?.itemId === p.selectedItemId) continue; // same item, update() will track it

    // Remove old helper for this user
    if (existing) { SceneManager.scene?.remove(existing.helper); _lockBoxes.delete(p.userId); }

    const group = SceneManager.meshes?.get(p.selectedItemId);
    if (!group) continue;
    try {
      const helper = new THREE.BoxHelper(group, new THREE.Color(0xff2222));
      SceneManager.scene?.add(helper);
      _lockBoxes.set(p.userId, { itemId: p.selectedItemId, helper });
    } catch {}
  }
}

// ── Note glows: green wireframe on noted items ────────────────────────────────

function addNoteGlow(noteId, itemId) {
  removeNoteGlow(noteId);
  const group = SceneManager.meshes?.get(itemId);
  if (!group || !SceneManager.scene) return;
  try {
    const helper = new THREE.BoxHelper(group, new THREE.Color(0x10B981));
    SceneManager.scene.add(helper);
    _noteGlows.set(noteId, { itemId, helper });
  } catch {}
}

function removeNoteGlow(noteId) {
  const entry = _noteGlows.get(noteId);
  if (!entry) return;
  SceneManager.scene?.remove(entry.helper);
  _noteGlows.delete(noteId);
}

// ── Note labels: CSS overlay near element ────────────────────────────────────

function createNoteLabel(noteId, itemId, text, authorName, authorColor) {
  removeNoteLabel(noteId);
  const div = document.createElement('div');
  div.className = 'ci-note-label';
  div.dataset.noteId = noteId;
  div.innerHTML = `
    <span class="cinl-dot" style="background:${authorColor}"></span>
    <span class="cinl-author">${authorName}:</span>
    <span class="cinl-text">${text}</span>
    <button class="cinl-dismiss" title="Quitar nota">×</button>
  `;
  document.body.appendChild(div);
  _noteLabels.set(noteId, { div, itemId });

  div.querySelector('.cinl-dismiss')?.addEventListener('click', () => {
    CollabManager.sendNoteEvent('collab-note-dismiss', { noteId });
    dismissNote(noteId);
  });
}

function applyNote(payload) {
  const { noteId, itemId, text, authorName, authorColor } = payload;
  if (!noteId || !itemId) return;
  // Overwrite: dismiss existing note for this item first
  const existing = _itemNoteMap.get(itemId);
  if (existing && existing !== noteId) dismissNote(existing);
  _notes.set(noteId, payload);
  _itemNoteMap.set(itemId, noteId);
  addNoteGlow(noteId, itemId);
  createNoteLabel(noteId, itemId, text, authorName, authorColor);
}

function dismissNote(noteId) {
  const note = _notes.get(noteId);
  if (note) _itemNoteMap.delete(note.itemId);
  removeNoteGlow(noteId);
  removeNoteLabel(noteId);
  _notes.delete(noteId);
}

function removeNoteLabel(noteId) {
  const entry = _noteLabels.get(noteId);
  if (!entry) return;
  entry.div.remove();
  _noteLabels.delete(noteId);
}

// ── Animation loop: update helpers + labels + note button position ────────────

function animLoop() {
  const scene  = SceneManager.scene;
  const meshes = SceneManager.meshes;
  const cam    = SceneManager.activeCam;

  // Refresh group refs for lock boxes (handles after rebuild)
  for (const [, entry] of _lockBoxes) {
    const g = meshes?.get(entry.itemId);
    if (g && entry.helper.object !== g) entry.helper.object = g;
    entry.helper.update?.();
  }

  // Refresh group refs for note glows
  for (const [, entry] of _noteGlows) {
    const g = meshes?.get(entry.itemId);
    if (g && entry.helper.object !== g) entry.helper.object = g;
    entry.helper.update?.();
  }

  // Update note label CSS positions
  if (cam) {
    for (const [, { div, itemId }] of _noteLabels) {
      const group = meshes?.get(itemId);
      if (!group) { div.style.display = 'none'; continue; }
      const box3 = new THREE.Box3().setFromObject(group);
      const top  = new THREE.Vector3(
        (box3.min.x + box3.max.x) * 0.5,
        box3.max.y,
        (box3.min.z + box3.max.z) * 0.5
      );
      top.project(cam);
      if (top.z > 1) { div.style.display = 'none'; continue; }
      const sx = (top.x *  0.5 + 0.5) * window.innerWidth;
      const sy = (top.y * -0.5 + 0.5) * window.innerHeight;
      div.style.display = '';
      div.style.left = sx + 'px';
      div.style.top  = (sy - 44) + 'px';
    }
  }

  // Update floating note button position (tracks selected element)
  updateNoteButtonPosition(cam, meshes);

  requestAnimationFrame(animLoop);
}

function updateNoteButtonPosition(cam, meshes) {
  const float   = document.getElementById('collab-note-float');
  const compose = document.getElementById('collab-note-compose');
  if (!float) return;

  const active   = CollabManager.active;
  const itemId   = AppState.selectedId;
  if (!active || itemId === null || !cam) {
    float.classList.remove('visible');
    compose?.classList.remove('visible');
    return;
  }

  const group = meshes?.get(itemId);
  if (!group) { float.classList.remove('visible'); return; }

  const bounds = new THREE.Box3().setFromObject(group);
  const anchor = new THREE.Vector3(
    bounds.max.x,
    Math.max(0.04, bounds.min.y + 0.06),
    bounds.max.z
  );
  anchor.project(cam);
  if (anchor.z > 1) { float.classList.remove('visible'); return; }

  const x = (anchor.x *  0.5 + 0.5) * window.innerWidth;
  const y = (anchor.y * -0.5 + 0.5) * window.innerHeight;

  // Position to the right of the ⚙ handle (which sits at x+6, y+6)
  float.style.left = (x + 44) + 'px';
  float.style.top  = (y + 6) + 'px';
  float.classList.add('visible');
}

// ── Styles ────────────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById('ci-interact-styles')) return;
  const s = document.createElement('style');
  s.id = 'ci-interact-styles';
  s.textContent = `
    /* Note label near element */
    .ci-note-label {
      position:fixed; z-index:7500; pointer-events:none;
      display:flex; align-items:center; gap:5px;
      background:rgba(10,10,14,.9); backdrop-filter:blur(12px);
      border:1px solid rgba(16,185,129,.5); border-radius:8px;
      padding:5px 10px; font-size:11px; color:#e5e7eb; white-space:nowrap;
      transform:translateX(-50%); pointer-events:all;
      box-shadow:0 2px 16px rgba(0,0,0,.5), 0 0 10px rgba(16,185,129,.2);
      max-width:280px; font-family:inherit;
    }
    .cinl-dot    { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .cinl-author { font-weight:700; color:#10B981; flex-shrink:0; }
    .cinl-text   { overflow:hidden; text-overflow:ellipsis; }
    .cinl-dismiss {
      background:none; border:none; color:#6b7280; cursor:pointer;
      padding:0 0 0 4px; font-size:14px; line-height:1; flex-shrink:0;
    }
    .cinl-dismiss:hover { color:#fff; }

    /* Floating note button — appears next to ⚙ handle */
    #collab-note-float {
      position:fixed; z-index:8200; display:none; pointer-events:none;
    }
    #collab-note-float.visible { display:block; pointer-events:all; }

    #collab-note-toggle {
      width:30px; height:30px; border-radius:50%;
      background:rgba(10,10,14,.88); border:1px solid rgba(255,255,255,.15);
      color:#cbd5e1; cursor:pointer; display:flex; align-items:center;
      justify-content:center; transition:all .15s;
      backdrop-filter:blur(10px); pointer-events:all;
    }
    #collab-note-toggle:hover {
      background:rgba(16,185,129,.2); border-color:#10B981; color:#10B981;
    }
    #collab-note-toggle svg { pointer-events:none; }

    /* Compose popover above the toggle button */
    #collab-note-compose {
      display:none; position:absolute; bottom:calc(100% + 8px); left:50%;
      transform:translateX(-50%);
      background:rgba(16,16,20,.95); border:1px solid rgba(255,255,255,.12);
      border-radius:12px; padding:10px; width:220px;
      backdrop-filter:blur(16px);
      box-shadow:0 8px 32px rgba(0,0,0,.6);
    }
    #collab-note-compose.visible { display:block; }
    #collab-note-compose textarea {
      width:100%; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
      border-radius:8px; color:#e5e7eb; font-size:12px; font-family:inherit;
      padding:8px 10px; resize:none; outline:none; box-sizing:border-box; height:60px;
    }
    #collab-note-compose textarea:focus { border-color:rgba(16,185,129,.5); }
    #collab-note-send {
      width:100%; margin-top:6px; background:#10B981; border:none;
      border-radius:8px; color:#fff; font-size:12px; font-weight:600;
      padding:7px; cursor:pointer; display:flex; align-items:center;
      justify-content:center; gap:5px; transition:background .15s; font-family:inherit;
    }
    #collab-note-send:hover { background:#059669; }
  `;
  document.head.appendChild(s);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const CollabInteractions = {
  init() {
    injectStyles();

    // Floating note button (no panel injection, tracks element position)
    const float = document.createElement('div');
    float.id = 'collab-note-float';
    float.innerHTML = `
      <button id="collab-note-toggle" title="Nota colaborativa">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      </button>
      <div id="collab-note-compose">
        <textarea placeholder="Escribe una nota para todos…" maxlength="200"></textarea>
        <button id="collab-note-send">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          Enviar
        </button>
      </div>
    `;
    document.body.appendChild(float);

    float.querySelector('#collab-note-toggle')?.addEventListener('click', () => {
      const compose = float.querySelector('#collab-note-compose');
      const isOpen  = compose?.classList.toggle('visible');
      if (isOpen) float.querySelector('textarea')?.focus();
    });

    float.querySelector('#collab-note-send')?.addEventListener('click', () => {
      const ta     = float.querySelector('textarea');
      const text   = ta?.value.trim();
      const itemId = AppState.selectedId;
      if (!text || !itemId || !CollabManager.active) return;

      CollabManager.sendNoteEvent('collab-note', {
        noteId:      `n-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        itemId,
        text,
        authorName:  CollabManager.localName  || 'Anónimo',
        authorColor: CollabManager.localColor || '#10B981'
      });
      if (ta) ta.value = '';
      float.querySelector('#collab-note-compose')?.classList.remove('visible');
    });

    // Broadcast local selection on any scene change (debounced)
    document.addEventListener('escale:scene-insights-changed', () => {
      if (_presenceDebounce) clearTimeout(_presenceDebounce);
      _presenceDebounce = setTimeout(syncSelectionToPresence, 120);
    });

    // Hide compose when clicking outside
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest('#collab-note-float')) {
        float.querySelector('#collab-note-compose')?.classList.remove('visible');
      }
    }, true);

    // Lock boxes from remote selections
    document.addEventListener('escale:collab-presence', e => {
      updateLockBoxes(e.detail.participants || []);
    });

    // Receive note events via DOM (works for both sender and remote receiver)
    document.addEventListener('escale:collab-note', e => applyNote(e.detail));
    document.addEventListener('escale:collab-note-dismiss', e => dismissNote(e.detail?.noteId));

    // Cleanup on session end
    document.addEventListener('escale:collab-ended', () => {
      for (const noteId of [..._notes.keys()]) dismissNote(noteId);
      _itemNoteMap.clear();
      for (const [, entry] of _lockBoxes) SceneManager.scene?.remove(entry.helper);
      _lockBoxes.clear();
      _lastSelectedId = null;
      float.classList.remove('visible');
      float.querySelector('#collab-note-compose')?.classList.remove('visible');
    });

    animLoop();
  }
};

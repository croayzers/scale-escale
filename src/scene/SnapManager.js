/* ─────────────────────────────────────────────────────────
   SNAP MANAGER — Toggles, spacing, atajo S
   ───────────────────────────────────────────────────────── */

import { AppState }     from '../core/AppState.js';
import { SceneManager } from './SceneManager.js';

let _btnHeader, _togglePanel, _inp, _statusEl, _presets;

function init() {
  _btnHeader   = document.getElementById('btn-snap');
  _togglePanel = document.getElementById('snap-toggle');
  _inp         = document.getElementById('snap-spacing');
  _statusEl    = document.getElementById('status-snap');
  _presets     = [...document.querySelectorAll('[data-snap-preset]')];

  _btnHeader?.addEventListener('click', () => setEnabled(!AppState.snap.enabled));
  _togglePanel?.addEventListener('change', () => setEnabled(_togglePanel.checked));
  _inp?.addEventListener('change', () => {
    const v = Math.max(0.05, Math.min(5, parseFloat(_inp.value) || 0.25));
    _inp.value = v;
    setSpacing(v);
  });
  _presets.forEach(p => {
    p.addEventListener('click', () => {
      const v = parseFloat(p.dataset.snapPreset);
      setSpacing(v);
      if (_inp) _inp.value = v;
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key?.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (document.activeElement?.tagName === 'TEXTAREA') return;
      // En 2D con selección activa, 'S' mueve el elemento (WASD), no togglea snap.
      if (AppState.camera === 'top' && AppState.selectedIds?.size > 0) return;
      setEnabled(!AppState.snap.enabled);
    }
  });
  updateStatus();
}

function setEnabled(v) {
  AppState.snap.enabled = v;
  _btnHeader?.classList.toggle('active', v);
  if (_togglePanel) _togglePanel.checked = v;
  updateStatus();
}

function setSpacing(v) {
  AppState.snap.spacing = v;
  if (AppState.grid) AppState.grid.subSize = v;
  _presets.forEach(p => p.classList.toggle('active', parseFloat(p.dataset.snapPreset) === v));
  SceneManager.rebuildGrids();
  updateStatus();
}

function updateStatus() {
  if (!_statusEl) return;
  _statusEl.textContent = AppState.snap.enabled
    ? `SNAP ${AppState.snap.spacing}m`
    : 'SNAP OFF';
  _statusEl.style.opacity = AppState.snap.enabled ? '1' : '0.5';
}

export const SnapManager = { init, setEnabled, setSpacing };

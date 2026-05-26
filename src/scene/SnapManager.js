/* ─────────────────────────────────────────────────────────
   SNAP MANAGER — Toggles, spacing, atajo S
   ───────────────────────────────────────────────────────── */

import { AppState }     from '../core/AppState.js';
import { SceneManager } from './SceneManager.js';

function init() {
  // Toggle del header
  const btnHeader = document.getElementById('btn-snap');
  btnHeader?.addEventListener('click', () => setEnabled(!AppState.snap.enabled));

  // Toggle del panel
  const togglePanel = document.getElementById('snap-toggle');
  togglePanel?.addEventListener('change', () => setEnabled(togglePanel.checked));

  // Input numérico de paso
  const inp = document.getElementById('snap-spacing');
  inp?.addEventListener('change', () => {
    const v = Math.max(0.05, Math.min(5, parseFloat(inp.value) || 0.25));
    inp.value = v;
    setSpacing(v);
  });

  // Pills de presets (si existen)
  document.querySelectorAll('[data-snap-preset]').forEach(p => {
    p.addEventListener('click', () => {
      const v = parseFloat(p.dataset.snapPreset);
      setSpacing(v);
      if (inp) inp.value = v;
    });
  });

  // Atajo S
  document.addEventListener('keydown', e => {
    if (e.key?.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
      if (document.activeElement?.tagName === 'INPUT') return;
      setEnabled(!AppState.snap.enabled);
    }
  });

  updateStatus();
}

function setEnabled(v) {
  AppState.snap.enabled = v;
  document.getElementById('btn-snap')?.classList.toggle('active', v);
  const t = document.getElementById('snap-toggle');
  if (t) t.checked = v;
  updateStatus();
}

function setSpacing(v) {
  AppState.snap.spacing = v;
  if (AppState.grid) AppState.grid.subSize = v;
  document.querySelectorAll('[data-snap-preset]').forEach(p => {
    p.classList.toggle('active', parseFloat(p.dataset.snapPreset) === v);
  });
  SceneManager.rebuildGrids();
  updateStatus();
}

function updateStatus() {
  const el = document.getElementById('status-snap');
  if (!el) return;
  el.textContent = AppState.snap.enabled
    ? `SNAP ${AppState.snap.spacing}m`
    : 'SNAP OFF';
  el.style.opacity = AppState.snap.enabled ? '1' : '0.5';
}

export const SnapManager = { init, setEnabled, setSpacing };

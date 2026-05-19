/* ═══════════════════════════════════════════════════════════
   E-SCALE · Bootstrap principal
   ═══════════════════════════════════════════════════════════ */

import { AppState }           from './core/AppState.js';
import { ElementLibrary }     from './core/ElementLibrary.js';
import { SceneManager }       from './scene/SceneManager.js';
import { InteractionManager } from './scene/InteractionManager.js';
import { SnapManager }        from './scene/SnapManager.js';
import { UIManager }          from './ui/UIManager.js';
import { PlanManager }        from './io/PlanManager.js';
import { CompanyManager }     from './io/CompanyManager.js';
import { ExportManager }      from './io/ExportManager.js';

async function bootstrap() {
  if (typeof THREE === 'undefined') {
    document.body.innerHTML = '<pre style="padding:24px;color:#b91c1c">Error: Three.js no se cargó. Comprueba tu conexión y los script CDN.</pre>';
    return;
  }

  // Bindeo de deps perezosas (UIManager ↔ AppState ↔ SceneManager)
  await UIManager.init();
  await SceneManager.init();

  InteractionManager.init();
  SnapManager.init();
  PlanManager.init();
  CompanyManager.init();
  ExportManager.init();

  // ── Cargar biblioteca y renderizar botones ──
  await ElementLibrary.load();
  ElementLibrary.renderAddButtons();

  // ── Cámara ──
  document.getElementById('cam-iso').addEventListener('click', () => {
    SceneManager.setCamera('iso');
    document.getElementById('cam-iso').classList.add('active');
    document.getElementById('cam-top').classList.remove('active');
  });
  document.getElementById('cam-top').addEventListener('click', () => {
    SceneManager.setCamera('top');
    document.getElementById('cam-top').classList.add('active');
    document.getElementById('cam-iso').classList.remove('active');
  });

  // ── Cotas ──
  document.getElementById('btn-cotas').addEventListener('click', e => {
    AppState.showCotas = !AppState.showCotas;
    e.currentTarget.classList.toggle('active', AppState.showCotas);
    SceneManager.drawCotas();
  });

  // ── Limpiar ──
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (AppState.items.length === 0) return;
    if (confirm('¿Vaciar toda la escena?')) AppState.clear();
  });

  // ── Iconos lucide ──
  if (window.lucide) lucide.createIcons();

  // ── Escena de demostración ──
  AppState._suppressHistory = true;
  AppState.add({
    type: 'mesa', subtype: 'standard',
    dims: { diameter: 1.8 },
    x: -3, z: 0, rotY: 0, chairs: 8
  });
  AppState.add({
    type: 'mesa', subtype: 'napoleon',
    dims: { diameter: 2.0 },
    x: 3, z: 0, rotY: 0, chairs: 10
  });
  AppState.add({
    type: 'buffet', subtype: 'arroces',
    dims: { length: 3.6 },
    x: 0, z: -5, rotY: 0, chairs: 0
  });
  AppState._suppressHistory = false;

  SceneManager.drawCotas();
  UIManager.refresh();

  console.info('[E-scale] arranque completo · Entrega 2');
}

window.addEventListener('load', bootstrap);

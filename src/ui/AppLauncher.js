import { AuthManager } from '../services/AuthManager.js';

const APP_ID = 'escale';   // qué app SOMOS (no abre en pestaña nueva)

// Fallback si la tabla apps_registry no responde (offline / sin sesión).
// La fuente de verdad es public.apps_registry en Supabase.
const FALLBACK_APPS = [
  { id: 'lscale', nombre: 'L-Scale', emoji: '📦', color: '#f97316', url_prod: 'https://logistics.thescaleapps.com', url_dev: 'http://localhost:5182', activa: true,  orden: 10 },
  { id: 'pscale', nombre: 'P-Scale', emoji: '👥', color: '#6366f1', url_prod: 'https://people.thescaleapps.com',    url_dev: 'http://localhost:5181', activa: true,  orden: 20 },
  { id: 'sscale', nombre: 'S-Scale', emoji: '📱', color: '#8b5cf6', url_prod: 'https://social.thescaleapps.com',    url_dev: 'http://localhost:3001', activa: true,  orden: 30 },
  { id: 'escale', nombre: 'E-Scale', emoji: '🏛️', color: '#10b981', url_prod: 'https://events.thescaleapps.com',    url_dev: 'http://localhost:5173', activa: true,  orden: 40 },
  { id: 'fscale', nombre: 'F-Scale', emoji: '💰', color: '#f59e0b', url_prod: 'https://finance.thescaleapps.com',   url_dev: null,                    activa: false, orden: 50 },
  { id: 'rscale', nombre: 'R-Scale', emoji: '📊', color: '#ef4444', url_prod: 'https://reports.thescaleapps.com',   url_dev: null,                    activa: false, orden: 60 },
];

let _appsCache = null;   // catálogo cargado (de Supabase o fallback)

function _portalIsProd() {
  const portal = AuthManager.getPortalUrl?.() ?? 'https://thescaleapps.com';
  return portal.includes('thescaleapps.com');
}

// URL efectiva de una app según el entorno (prod vs dev).
function _appUrl(app) {
  const prod = _portalIsProd();
  const url = prod ? app.url_prod : (app.url_dev ?? app.url_prod);
  return (app.activa && url) ? url : null;
}

// Lee el catálogo de Supabase una vez; cae al fallback si algo falla.
async function _loadApps() {
  if (_appsCache) return _appsCache;
  try {
    const sb = AuthManager.getSupabaseClient?.();
    if (sb) {
      const { data, error } = await sb
        .from('apps_registry')
        .select('id,nombre,emoji,color,url_prod,url_dev,activa,orden')
        .order('orden', { ascending: true });
      if (!error && Array.isArray(data) && data.length) {
        _appsCache = data;
        return _appsCache;
      }
    }
  } catch (err) {
    console.warn('[AppLauncher] apps_registry no disponible, usando fallback:', err?.message);
  }
  _appsCache = [...FALLBACK_APPS].sort((a, b) => a.orden - b.orden);
  return _appsCache;
}

function _portalUrl() {
  return AuthManager.getPortalUrl?.() ?? 'https://thescaleapps.com';
}

let _popup = null;
let _btn = null;
let _open = false;

function _closePopup() {
  if (_popup) {
    _popup.remove();
    _popup = null;
  }
  if (_btn) _btn.classList.remove('is-active');
  _open = false;
}

function _outsideClick(e) {
  if (_popup && !_popup.contains(e.target) && !_btn?.contains(e.target)) {
    _closePopup();
    document.removeEventListener('pointerdown', _outsideClick, true);
  }
}

async function _buildPopup() {
  const apps = await _loadApps();
  const popup = document.createElement('div');
  popup.id = 'app-launcher-popup';
  popup.style.cssText = [
    'position:fixed',
    'background:var(--surface,#1a1b2e)',
    'border:1px solid var(--border,rgba(255,255,255,.1))',
    'border-radius:16px',
    'box-shadow:0 8px 32px rgba(0,0,0,.35)',
    'padding:14px 12px 10px',
    'z-index:10000',
    'width:240px',
    'display:flex',
    'flex-direction:column',
    'gap:0',
    'font-family:inherit',
  ].join(';');

  // Header label
  const header = document.createElement('div');
  header.style.cssText = 'font-size:11px;font-weight:700;color:var(--text-2,#9ca3af);letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px;padding-left:4px';
  header.textContent = 'Scale Apps';
  popup.appendChild(header);

  // Grid de apps
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:10px';

  apps.forEach(app => {
    const isCurrent = app.id === APP_ID;
    const url = isCurrent ? null : _appUrl(app);
    const cell = document.createElement('a');
    cell.href = url || '#';
    if (!isCurrent && url) cell.target = '_blank';
    cell.rel = 'noreferrer';
    cell.title = app.nombre;
    cell.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:5px',
      'padding:10px 6px 8px',
      'border-radius:12px',
      'text-decoration:none',
      `background:${isCurrent ? app.color + '14' : 'transparent'}`,
      `border:1px solid ${isCurrent ? app.color + '33' : 'transparent'}`,
      `opacity:${url || isCurrent ? '1' : '0.4'}`,
      `cursor:${url || isCurrent ? 'pointer' : 'default'}`,
      'transition:background .12s',
    ].join(';');

    if (!url && !isCurrent) {
      cell.addEventListener('click', e => e.preventDefault());
    }

    cell.addEventListener('mouseenter', () => { if (!isCurrent) cell.style.background = 'var(--surface-2,rgba(255,255,255,.06))'; });
    cell.addEventListener('mouseleave', () => { if (!isCurrent) cell.style.background = 'transparent'; });

    const icon = document.createElement('div');
    icon.style.cssText = `width:40px;height:40px;border-radius:12px;font-size:20px;display:grid;place-items:center;background:${app.color}18`;
    icon.textContent = app.emoji;

    const label = document.createElement('span');
    label.style.cssText = `font-size:11px;font-weight:${isCurrent ? '700' : '500'};color:${isCurrent ? app.color : 'var(--text,#f1f5f9)'};text-align:center`;
    label.textContent = app.nombre;

    cell.appendChild(icon);
    cell.appendChild(label);
    grid.appendChild(cell);
  });

  popup.appendChild(grid);

  // Divider + Portal link
  const divider = document.createElement('div');
  divider.style.cssText = 'border-top:1px solid var(--border,rgba(255,255,255,.1));padding-top:8px';

  const portalLink = document.createElement('a');
  portalLink.href = _portalUrl();
  portalLink.target = '_blank';
  portalLink.rel = 'noreferrer';
  portalLink.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:10px',
    'padding:8px 10px',
    'border-radius:10px',
    'text-decoration:none',
    'color:var(--text,#f1f5f9)',
    'transition:background .12s',
  ].join(';');
  portalLink.addEventListener('mouseenter', () => { portalLink.style.background = 'var(--surface-2,rgba(255,255,255,.06))'; });
  portalLink.addEventListener('mouseleave', () => { portalLink.style.background = 'transparent'; });

  const badge = document.createElement('div');
  badge.style.cssText = 'width:32px;height:32px;border-radius:9px;background:var(--brand,#6366f1);color:#fff;display:grid;place-items:center;font-weight:800;font-size:15px;flex-shrink:0';
  badge.textContent = 'S';

  const info = document.createElement('div');
  const infoTitle = document.createElement('div');
  infoTitle.style.cssText = 'font-size:13px;font-weight:600';
  infoTitle.textContent = 'Scale Portal';
  const infoSub = document.createElement('div');
  infoSub.style.cssText = 'font-size:11px;color:var(--text-2,#9ca3af)';
  infoSub.textContent = 'Cuenta y administración';
  info.appendChild(infoTitle);
  info.appendChild(infoSub);

  portalLink.appendChild(badge);
  portalLink.appendChild(info);
  divider.appendChild(portalLink);
  popup.appendChild(divider);

  return popup;
}

function _buildButton() {
  const btn = document.createElement('button');
  btn.id = 'btn-app-launcher';
  btn.type = 'button';
  btn.title = 'Cambiar de app';
  btn.className = 'hdr-chip';
  btn.style.cssText = 'padding:5px 7px;display:grid;place-items:center;flex-shrink:0';

  // SVG 9 puntos
  const size = 16;
  const r = size * 0.11;
  const g = size * 0.36;
  const offset = (size - g * 2) / 2;
  const positions = [
    [0,0],[g,0],[g*2,0],
    [0,g],[g,g],[g*2,g],
    [0,g*2],[g,g*2],[g*2,g*2],
  ];
  const circles = positions.map(([x,y]) =>
    `<circle cx="${offset+x}" cy="${offset+y}" r="${r}" fill="currentColor"/>`
  ).join('');
  btn.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">${circles}</svg>`;

  btn.addEventListener('click', async () => {
    if (_open) {
      _closePopup();
      document.removeEventListener('pointerdown', _outsideClick, true);
      return;
    }
    _open = true;
    btn.classList.add('is-active');
    const popup = await _buildPopup();
    // Si se cerró mientras cargaba el catálogo, abortar.
    if (!_open) return;
    document.body.appendChild(popup);
    _popup = popup;

    // Posicionar debajo del botón
    const rect = btn.getBoundingClientRect();
    popup.style.top = `${rect.bottom + 8}px`;
    const left = Math.max(8, rect.right - 240);
    popup.style.left = `${left}px`;

    // capture:true para recibir antes que el canvas de Three.js
    setTimeout(() => document.addEventListener('pointerdown', _outsideClick, true), 0);
  });

  return btn;
}

function init() {
  const headerInner = document.getElementById('header-inner');
  if (!headerInner) return;
  if (document.getElementById('btn-app-launcher')) return;

  _btn = _buildButton();

  // Insertar antes del primer separador o al final del header
  const sep = headerInner.querySelector('.hdr-sep');
  if (sep) {
    headerInner.insertBefore(_btn, sep);
    // separador después del botón
    const newSep = document.createElement('div');
    newSep.className = 'hdr-sep';
    headerInner.insertBefore(newSep, sep);
  } else {
    headerInner.appendChild(_btn);
  }
}

export const AppLauncher = { init };

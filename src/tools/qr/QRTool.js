// QRTool.js — Generador de QR (E-scale): ESTÁTICOS (locales) + DINÁMICOS (servidor).
//
// Herramienta NUEVA e independiente del editor 3D: NO importa nada del editor
// ni carga Three.js. El hub la invoca con:
//   import('../tools/qr/QRTool.js').then(m => m.QRTool.open({ onHome }))
//
// Estructura:
//   - Header ESTÁNDAR de la suite vía src/ui/ToolHeader.js (logo + Inicio + 9
//     puntos AppLauncher + chat + IA placeholder + cuenta).
//   - ESTÁTICO: el contenido va dentro del QR; generación 100% local (no toca
//     servidor). Tipos: url/text/vcard/wifi/email/phone/whatsapp/sms.
//   - DINÁMICO: el QR codifica <origin>/q/<code>. Se guarda en servidor
//     (api/qr/create) con título + destino + tipo + caducidad opcional (≤15d).
//   - MIS QR: lista los dinámicos del usuario (api/qr/list) con acciones.
//   - STATS: panel detallado de escaneos (api/qr/stats) con mini-gráfica CSS.
//
// Librería QR: soldair/node-qrcode (UMD browser bundle) cargada BAJO DEMANDA por
// CDN. Expone window.QRCode con toCanvas/toDataURL/toString.

import { ToolHeader } from '../../ui/ToolHeader.js';
import { QRCopilot } from './QRCopilot.js';
import { AppState } from '../../core/AppState.js';
import { CompanyManager } from '../../io/CompanyManager.js';
import { QR_TEMPLATES, getTemplate, defaultPartsState } from './qrTemplates.js';
import { composeToCanvas, composeToSVG, loadImage } from './qrCompositor.js';

const QR_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.1/qrcode.min.js';

let _qrLibPromise = null;

/** Carga la librería QR una sola vez (guardia anti-doble-carga). */
function loadQRLib() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  if (_qrLibPromise) return _qrLibPromise;

  _qrLibPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-qr-lib="1"]');
    if (existing) {
      if (window.QRCode) return resolve(window.QRCode);
      existing.addEventListener('load', () => resolve(window.QRCode), { once: true });
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar la librería QR')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = QR_CDN_URL;
    s.async = true;
    s.dataset.qrLib = '1';
    s.onload = () => {
      if (window.QRCode) resolve(window.QRCode);
      else reject(new Error('Librería QR cargada pero no expone window.QRCode'));
    };
    s.onerror = () => {
      _qrLibPromise = null;
      reject(new Error('No se pudo cargar la librería QR (revisa tu conexión)'));
    };
    document.head.appendChild(s);
  });
  return _qrLibPromise;
}

// ── Auth helpers (token de Supabase compartido por AuthManager) ──────────────

function getAccessToken() {
  try { return window.__ESCALE_AUTH__?.getAccessToken?.() || ''; }
  catch { return ''; }
}
function isAuthenticated() {
  return Boolean(getAccessToken());
}

async function apiFetch(path, { method = 'GET', body } = {}) {
  const token = getAccessToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* respuesta no-JSON */ }
  if (!res.ok || !data?.ok) {
    const reason = data?.reason || data?.error || `HTTP ${res.status}`;
    const err = new Error(reason);
    err.status = res.status;
    err.reason = data?.reason;
    throw err;
  }
  return data;
}

// ── Helpers de construcción de contenido (estático) ──────────────────────────

function escVCard(v) {
  return String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function escWifi(v) {
  return String(v || '').replace(/([\\;,:"])/g, '\\$1');
}
function buildVCard({ name, org, phone, email }) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push('N:' + escVCard(name));
  lines.push('FN:' + escVCard(name));
  if (org) lines.push('ORG:' + escVCard(org));
  if (phone) lines.push('TEL;TYPE=CELL:' + escVCard(phone));
  if (email) lines.push('EMAIL;TYPE=INTERNET:' + escVCard(email));
  lines.push('END:VCARD');
  return lines.join('\n');
}
function buildWifi({ ssid, pass, auth }) {
  const T = auth === 'nopass' ? 'nopass' : auth;
  const p = auth === 'nopass' ? '' : ('P:' + escWifi(pass) + ';');
  return `WIFI:T:${T};S:${escWifi(ssid)};${p};`;
}
// Solo dígitos y '+' para teléfonos; wa.me exige sin '+' ni separadores.
function cleanPhone(v) { return String(v || '').replace(/[^\d+]/g, ''); }
function cleanWaPhone(v) { return String(v || '').replace(/[^\d]/g, ''); }

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Fecha local legible (nunca toISOString().slice — corre un día en husos +).
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

// ── Estado ────────────────────────────────────────────────────────────────────

const OVERLAY_ID = 'qrtool-overlay';
const QR_SIZE = 288;          // lado del módulo QR pelado (canvas oculto)
const COMPOSE_PREVIEW = 320;  // lado del lienzo de previsualización compuesto
const COMPOSE_EXPORT = 1024;  // lado del lienzo de export (PNG)
const PREVIEW_DEBOUNCE = 260; // ms para el render automático en directo

const state = {
  view: 'create',        // 'create' | 'mine'
  mode: 'static',        // 'static' | 'dynamic'
  type: 'url',           // url|text|vcard|wifi|email|phone|whatsapp|sms
  color: '#0a0a0b',
  lastText: '',          // último contenido pintado (para descargas)
  expiry: false,         // caducidad activa (dinámico)
  expiryDays: 7,
  onHome: null,
  mineLoaded: false,
  filePath: null,   // storage path del archivo subido (tipo 'file' dinámico)
  fileName: null,   // nombre original del archivo

  // ── DISEÑO de la composición (nuevo) ───────────────────────────────────────
  template: 'none',      // id de plantilla activa (qrTemplates.js)
  parts: defaultPartsState(getTemplate('none')), // { [partId]: { on, stroke, fill } }
  bgColor: '#ffffff',    // color de fondo del lienzo
  bgImage: null,         // data URL de imagen de fondo (o null)
  topLogo: false,        // mostrar logo de empresa arriba del marco
  logoInQr: false,       // insertar logo en el centro del QR (fuerza ECC=H)

  _debounceTimer: null,  // temporizador del preview en directo
  _composing: false,     // guardia anti-reentrada de la composición
};

// Devuelve el logo de empresa (URL o data URL) o '' si no hay.
function companyLogo() {
  return AppState?.company?.logo || '';
}

// Abre el modal de empresa para que el usuario cargue su logo; cuando se cierra
// (o cuando el logo termina de cargarse) reintenta y refresca el preview.
function promptCompanyLogo() {
  const onLoaded = () => { syncLogoControls(); schedulePreview(true); };
  document.addEventListener('escale:company-logo-loaded', onLoaded, { once: true });
  document.addEventListener('escale:company-modal-closed', () => {
    document.removeEventListener('escale:company-logo-loaded', onLoaded);
    syncLogoControls();
    schedulePreview(true);
  }, { once: true });
  try { CompanyManager.openModal(); } catch (e) { console.warn('[QRTool] No se pudo abrir el modal de empresa:', e); }
}

// Catálogo de tipos por modo.
const STATIC_TYPES = [
  { id: 'url',      icon: 'link',           label: 'URL / Texto' },
  { id: 'vcard',    icon: 'contact',        label: 'Contacto' },
  { id: 'wifi',     icon: 'wifi',           label: 'WiFi' },
  { id: 'email',    icon: 'mail',           label: 'Email' },
  { id: 'phone',    icon: 'phone',          label: 'Teléfono' },
  { id: 'whatsapp', icon: 'message-circle', label: 'WhatsApp' },
  { id: 'sms',      icon: 'message-square',  label: 'SMS' },
];
const DYNAMIC_TYPES = [
  { id: 'url',  icon: 'link',     label: 'Enlace' },
  { id: 'file', icon: 'file-up',  label: 'PDF / Imagen' },
];

function currentTypes() {
  return state.mode === 'dynamic' ? DYNAMIC_TYPES : STATIC_TYPES;
}

// ── Render: formularios por tipo ──────────────────────────────────────────────

function fieldsHTML() {
  if (state.mode === 'dynamic') {
    const dynContent = state.type === 'file'
      ? `<div class="qrt-field qrt-field-full">
        <span>Archivo (PDF o imagen)</span>
        <div id="qrt-file-drop" class="qrt-file-drop${state.filePath ? ' is-uploaded' : ''}">
          <input id="qrt-file-input" type="file" accept=".pdf,image/jpeg,image/png,image/gif,image/webp,image/svg+xml" hidden/>
          ${state.filePath
            ? `<i data-lucide="check-circle"></i><span class="qrt-file-name">${escHtml(state.fileName || state.filePath)}</span><button id="qrt-file-clear" class="qrt-btn qrt-btn-ghost qrt-btn-sm" type="button"><i data-lucide="x"></i>Quitar</button>`
            : `<i data-lucide="upload-cloud"></i><span>PDF o imagen, máx. 20 MB</span><button id="qrt-file-pick" class="qrt-btn qrt-btn-ghost qrt-btn-sm" type="button"><i data-lucide="folder-open"></i>Elegir…</button>`
          }
        </div>
      </div>`
      : `<label class="qrt-field qrt-field-full">
        <span>Destino (URL a la que redirige)</span>
        <input id="qrt-dyn-target" class="qrt-input" type="url" placeholder="https://tu-destino.com/landing" autocomplete="off"/>
      </label>`;

    return `
      <label class="qrt-field qrt-field-full">
        <span>Título (para Mis QR)</span>
        <input id="qrt-dyn-title" class="qrt-input" type="text" placeholder="Campaña feria primavera" autocomplete="off"/>
      </label>
      ${dynContent}
      <div class="qrt-field qrt-field-full qrt-expiry">
        <label class="qrt-check">
          <input id="qrt-dyn-expiry" type="checkbox" ${state.expiry ? 'checked' : ''}/>
          <span>Caduca</span>
        </label>
        <label class="qrt-expiry-days ${state.expiry ? '' : 'is-disabled'}">
          <span>Días (máx. 15) ${helpHTML('El QR deja de redirigir tras los días indicados (máx. 15).')}</span>
          <select id="qrt-dyn-days" class="qrt-input" ${state.expiry ? '' : 'disabled'}>
            ${Array.from({ length: 15 }, (_, i) => i + 1)
              .map((d) => `<option value="${d}" ${d === state.expiryDays ? 'selected' : ''}>${d}</option>`)
              .join('')}
          </select>
        </label>
      </div>`;
  }

  switch (state.type) {
    case 'vcard':
      return `
        <div class="qrt-grid2">
          <label class="qrt-field"><span>Nombre</span><input id="qrt-vc-name" class="qrt-input" type="text" placeholder="Ana García" autocomplete="off"/></label>
          <label class="qrt-field"><span>Empresa</span><input id="qrt-vc-org" class="qrt-input" type="text" placeholder="Sibaris Catering" autocomplete="off"/></label>
          <label class="qrt-field"><span>Teléfono</span><input id="qrt-vc-phone" class="qrt-input" type="tel" placeholder="+34 600 000 000" autocomplete="off"/></label>
          <label class="qrt-field"><span>Email</span><input id="qrt-vc-email" class="qrt-input" type="email" placeholder="ana@empresa.com" autocomplete="off"/></label>
        </div>`;
    case 'wifi':
      return `
        <div class="qrt-grid2">
          <label class="qrt-field"><span>Red (SSID)</span><input id="qrt-wf-ssid" class="qrt-input" type="text" placeholder="MiWiFi" autocomplete="off"/></label>
          <label class="qrt-field"><span>Seguridad</span>
            <select id="qrt-wf-auth" class="qrt-input">
              <option value="WPA">WPA / WPA2</option>
              <option value="WEP">WEP</option>
              <option value="nopass">Sin contraseña</option>
            </select>
          </label>
          <label class="qrt-field qrt-field-full"><span>Contraseña</span><input id="qrt-wf-pass" class="qrt-input" type="text" placeholder="contraseña" autocomplete="off"/></label>
        </div>`;
    case 'email':
      return `
        <div class="qrt-grid2">
          <label class="qrt-field qrt-field-full"><span>Email destino</span><input id="qrt-em-to" class="qrt-input" type="email" placeholder="hola@empresa.com" autocomplete="off"/></label>
          <label class="qrt-field"><span>Asunto</span><input id="qrt-em-subject" class="qrt-input" type="text" placeholder="Consulta" autocomplete="off"/></label>
          <label class="qrt-field"><span>Mensaje</span><input id="qrt-em-body" class="qrt-input" type="text" placeholder="Hola…" autocomplete="off"/></label>
        </div>`;
    case 'phone':
      return `
        <label class="qrt-field qrt-field-full">
          <span>Teléfono</span>
          <input id="qrt-ph-number" class="qrt-input" type="tel" placeholder="+34 600 000 000" autocomplete="off"/>
        </label>`;
    case 'whatsapp':
      return `
        <div class="qrt-grid2">
          <label class="qrt-field"><span>Teléfono (con prefijo)</span><input id="qrt-wa-number" class="qrt-input" type="tel" placeholder="+34 600 000 000" autocomplete="off"/></label>
          <label class="qrt-field"><span>Mensaje (opcional)</span><input id="qrt-wa-text" class="qrt-input" type="text" placeholder="Hola, quería…" autocomplete="off"/></label>
        </div>`;
    case 'sms':
      return `
        <div class="qrt-grid2">
          <label class="qrt-field"><span>Teléfono</span><input id="qrt-sms-number" class="qrt-input" type="tel" placeholder="+34 600 000 000" autocomplete="off"/></label>
          <label class="qrt-field"><span>Mensaje (opcional)</span><input id="qrt-sms-text" class="qrt-input" type="text" placeholder="Hola…" autocomplete="off"/></label>
        </div>`;
    default: // url / text
      return `
        <label class="qrt-field qrt-field-full">
          <span>URL o texto</span>
          <textarea id="qrt-url" class="qrt-input qrt-textarea" rows="3" placeholder="https://escale.app  ·  o cualquier texto"></textarea>
        </label>`;
  }
}

function typeTabsHTML() {
  return currentTypes()
    .map((t) => `<button class="qrt-tab" data-qr-type="${t.id}" type="button"><i data-lucide="${t.icon}"></i>${t.label}</button>`)
    .join('');
}

// Tooltip reutilizable "?": icono lucide help-circle junto a un título de sección.
// Funciona on-hover y es accesible por focus/click (táctil): el texto vive en un
// <span role="tooltip"> que se muestra vía CSS (:hover/:focus-within) y por la
// clase .is-open que añadimos al hacer clic. tabindex=0 para foco por teclado.
function helpHTML(text) {
  return `<button type="button" class="qrt-help" data-qr-help aria-label="Ayuda" title="">
    <i data-lucide="help-circle"></i>
    <span class="qrt-help-bubble" role="tooltip">${escHtml(text)}</span>
  </button>`;
}

// Selector de plantillas (chips con icono).
function templateChipsHTML() {
  return QR_TEMPLATES.map((t) => `
    <button class="qrt-tplchip ${t.id === state.template ? 'is-active' : ''}" data-qr-tpl="${t.id}" type="button" title="${t.label}">
      <i data-lucide="${t.icon || 'square'}"></i><span>${t.label}</span>
    </button>`).join('');
}

// Controles de las PARTES de la plantilla activa: toggle on/off + color stroke
// y fill por parte (solo se muestran los colores que la parte usa).
function partsControlsHTML() {
  const tpl = getTemplate(state.template);
  if (!tpl.parts || !tpl.parts.length) {
    return '<p class="qrt-design-empty">Esta plantilla no tiene partes configurables.</p>';
  }
  return tpl.parts.map((part) => {
    const st = state.parts[part.id] || { on: part.defaultOn !== false, stroke: part.stroke, fill: part.fill };
    const strokeCtrl = part.stroke
      ? `<label class="qrt-part-color" title="Color de borde">
           <input type="color" data-qr-part-stroke="${part.id}" value="${st.stroke || part.stroke}"/>
           <span>Borde</span>
         </label>` : '';
    const fillCtrl = part.fill
      ? `<label class="qrt-part-color" title="Color de relleno">
           <input type="color" data-qr-part-fill="${part.id}" value="${st.fill || part.fill}"/>
           <span>Relleno</span>
         </label>` : '';
    return `
      <div class="qrt-part-row ${st.on ? '' : 'is-off'}">
        <label class="qrt-check qrt-part-toggle">
          <input type="checkbox" data-qr-part-on="${part.id}" ${st.on ? 'checked' : ''}/>
          <span>${part.label}</span>
        </label>
        <div class="qrt-part-colors">${strokeCtrl}${fillCtrl}</div>
      </div>`;
  }).join('');
}

// Panel de DISEÑO: plantillas + partes + logos + fondo. Plegable.
function designPanelHTML() {
  const hasLogo = Boolean(companyLogo());
  return `
    <section class="qrt-card qrt-design">
      <div class="qrt-eyebrow">Diseño y marco</div>

      <div class="qrt-design-group">
        <div class="qrt-design-label">Plantilla ${helpHTML('Marco decorativo alrededor del QR (estilo «SCAN HERE»). Elige uno o «Sin plantilla».')}</div>
        <div class="qrt-tplchips" id="qrt-tplchips">${templateChipsHTML()}</div>
      </div>

      <div class="qrt-design-group" id="qrt-parts-group">
        <div class="qrt-design-label">Partes del marco ${helpHTML('Activa o desactiva cada parte del marco y personaliza su color de borde y relleno.')}</div>
        <div id="qrt-parts" class="qrt-parts">${partsControlsHTML()}</div>
      </div>

      <div class="qrt-design-group">
        <div class="qrt-design-label">Logo de empresa ${helpHTML('Coloca el logo de tu empresa en la parte superior del marco.')}</div>
        <div id="qrt-logo-controls" class="qrt-logo-controls">
          <label class="qrt-check">
            <input type="checkbox" id="qrt-top-logo" ${state.topLogo ? 'checked' : ''} ${hasLogo ? '' : 'disabled'}/>
            <span>Logo arriba del marco</span>
          </label>
          <label class="qrt-check">
            <input type="checkbox" id="qrt-logo-in-qr" ${state.logoInQr ? 'checked' : ''} ${hasLogo ? '' : 'disabled'}/>
            <span>Logo en el centro del QR ${helpHTML('Inserta un logo en el centro del QR. Subimos la corrección de errores para que siga escaneando, pero no abuses del tamaño.')}</span>
          </label>
          <div id="qrt-no-logo" class="qrt-no-logo ${hasLogo ? 'hidden' : ''}">
            <i data-lucide="image-off"></i>
            <span>Tu empresa no tiene logo.</span>
            <button id="qrt-load-logo" class="qrt-btn qrt-btn-ghost qrt-btn-sm" type="button"><i data-lucide="upload"></i>Cargar logo de empresa</button>
          </div>
        </div>
      </div>

      <div class="qrt-design-group">
        <div class="qrt-design-label">Fondo ${helpHTML('Color o imagen de fondo de la composición. La imagen lleva un velo para no restar legibilidad al QR.')}</div>
        <div class="qrt-bg-controls">
          <label class="qrt-color">
            <span>Color</span>
            <input id="qrt-bg-color" type="color" value="${state.bgColor}"/>
          </label>
          <button id="qrt-bg-img" class="qrt-btn qrt-btn-ghost qrt-btn-sm" type="button"><i data-lucide="image"></i>Imagen…</button>
          <button id="qrt-bg-clear" class="qrt-btn qrt-btn-ghost qrt-btn-sm ${state.bgImage ? '' : 'hidden'}" type="button"><i data-lucide="x"></i>Quitar</button>
          <input id="qrt-bg-file" type="file" accept="image/*" hidden/>
        </div>
      </div>
    </section>`;
}

function createViewHTML() {
  return `
    <div class="qrt-body">
      <section class="qrt-card qrt-form">
        <div class="qrt-eyebrow">Generador de QR</div>
        <h1 class="qrt-title">Crea tu código QR</h1>

        <div class="qrt-seg-wrap">
          <div class="qrt-segment" role="tablist" aria-label="Tipo de QR">
            <button class="qrt-seg" data-qr-mode="static" type="button"><i data-lucide="square"></i>Estático</button>
            <button class="qrt-seg" data-qr-mode="dynamic" type="button"><i data-lucide="refresh-cw"></i>Dinámico</button>
          </div>
          ${helpHTML('Estático incrusta el contenido en el QR (no se puede editar luego, funciona sin conexión). Dinámico guarda un enlace corto editable y mide los escaneos.')}
        </div>
        <p id="qrt-mode-hint" class="qrt-mode-hint"></p>

        <div class="qrt-tabs" id="qrt-type-tabs" role="tablist"></div>

        <div id="qrt-fields" class="qrt-fields"></div>

        <div class="qrt-row">
          <label class="qrt-color">
            <span>Color QR ${helpHTML('Color de los módulos del código. Mantén buen contraste con el fondo para que sea legible.')}</span>
            <input id="qrt-color" type="color" value="${state.color}"/>
          </label>
          <button id="qrt-generate" class="qrt-btn qrt-btn-primary" type="button">
            <i data-lucide="qr-code"></i><span>Generar</span>
          </button>
        </div>

        <div id="qrt-msg" class="qrt-msg" role="status"></div>

        ${designPanelHTML()}
      </section>

      <section class="qrt-card qrt-preview">
        <div class="qrt-eyebrow">Previsualización en directo</div>
        <div class="qrt-canvas-wrap">
          <!-- Canvas oculto: módulo QR pelado (fuente para la composición). -->
          <canvas id="qrt-canvas" width="${QR_SIZE}" height="${QR_SIZE}" style="display:none"></canvas>
          <!-- Canvas visible: composición completa (fondo + marco + QR + logos). -->
          <canvas id="qrt-compose" width="${COMPOSE_PREVIEW}" height="${COMPOSE_PREVIEW}"></canvas>
          <div id="qrt-empty" class="qrt-empty">
            <i data-lucide="qr-code"></i>
            <p>Rellena los datos: el QR se actualiza solo.</p>
          </div>
        </div>
        <div id="qrt-link-row" class="qrt-link-row" style="display:none">
          <i data-lucide="link"></i>
          <code id="qrt-link-code"></code>
          <button id="qrt-link-copy" class="qrt-btn qrt-btn-ghost qrt-btn-sm" type="button"><i data-lucide="copy"></i>Copiar</button>
        </div>
        <div class="qrt-downloads">
          <button id="qrt-dl-png" class="qrt-btn qrt-btn-ghost" type="button" disabled><i data-lucide="image-down"></i>PNG</button>
          <button id="qrt-dl-svg" class="qrt-btn qrt-btn-ghost" type="button" disabled><i data-lucide="file-down"></i>SVG</button>
        </div>
      </section>
    </div>`;
}

function mineViewHTML() {
  return `
    <div class="qrt-body qrt-body-single">
      <section class="qrt-card qrt-mine">
        <div class="qrt-mine-head">
          <div>
            <div class="qrt-eyebrow">Mis QR dinámicos</div>
            <h1 class="qrt-title">Tus códigos</h1>
          </div>
          <button id="qrt-mine-refresh" class="qrt-btn qrt-btn-ghost qrt-btn-sm" type="button"><i data-lucide="refresh-cw"></i>Actualizar</button>
        </div>
        <div id="qrt-mine-list" class="qrt-mine-list">
          <div class="qrt-empty"><i data-lucide="loader"></i><p>Cargando…</p></div>
        </div>
      </section>
    </div>
    <div id="qrt-stats-panel" class="qrt-stats-panel" style="display:none"></div>`;
}

function overlayHTML() {
  return `
    <div class="qrt-shell">
      <div id="qrt-header-host"></div>
      <nav class="qrt-viewnav">
        <button class="qrt-viewtab" data-qr-view="create" type="button"><i data-lucide="plus-circle"></i>Crear QR</button>
        <button class="qrt-viewtab" data-qr-view="mine" type="button"><i data-lucide="list"></i>Mis QR</button>
      </nav>
      <div id="qrt-view"></div>
    </div>`;
}

// ── Utilidades de UI ──────────────────────────────────────────────────────────

function setMsg(text, kind) {
  const el = document.getElementById('qrt-msg');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'qrt-msg' + (kind ? ' qrt-msg-' + kind : '');
}

function refreshIcons(root) {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try { window.lucide.createIcons(root ? { nodes: [root] } : undefined); }
    catch { /* noop */ }
  }
}

function setActiveMode() {
  document.querySelectorAll('.qrt-seg').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.qrMode === state.mode);
  });
  const hint = document.getElementById('qrt-mode-hint');
  if (hint) {
    hint.textContent = state.mode === 'dynamic'
      ? 'El destino es editable después y se registran estadísticas de cada escaneo. Requiere sesión.'
      : 'El contenido se incrusta en el QR. Funciona sin conexión y no se puede editar luego.';
  }
  const gen = document.getElementById('qrt-generate');
  if (gen) {
    const span = gen.querySelector('span');
    if (span) span.textContent = state.mode === 'dynamic' ? 'Crear QR dinámico' : 'Generar';
  }
}

function setActiveType() {
  document.querySelectorAll('.qrt-tab').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.qrType === state.type);
  });
}

function setActiveView() {
  document.querySelectorAll('.qrt-viewtab').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.qrView === state.view);
  });
}

function renderTypeTabs() {
  const host = document.getElementById('qrt-type-tabs');
  if (!host) return;
  // En dinámico solo hay un tipo: oculta la barra para no añadir ruido.
  host.style.display = currentTypes().length <= 1 ? 'none' : 'flex';
  host.innerHTML = typeTabsHTML();
  // Asegura que el tipo activo existe en el modo actual.
  if (!currentTypes().some((t) => t.id === state.type)) state.type = currentTypes()[0].id;
  setActiveType();
  refreshIcons(host);
  host.querySelectorAll('.qrt-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.type === 'file' && btn.dataset.qrType !== 'file') {
        state.filePath = null;
        state.fileName = null;
      }
      state.type = btn.dataset.qrType;
      setActiveType();
      renderFields();
      setMsg('');
    });
  });
}

function renderFields() {
  const host = document.getElementById('qrt-fields');
  if (host) host.innerHTML = fieldsHTML();
  if (state.mode === 'dynamic') {
    const chk = document.getElementById('qrt-dyn-expiry');
    chk?.addEventListener('change', () => {
      state.expiry = chk.checked;
      renderFields();
    });
    const days = document.getElementById('qrt-dyn-days');
    days?.addEventListener('change', () => { state.expiryDays = Number(days.value) || 7; });

    if (state.type === 'file') {
      const pick = document.getElementById('qrt-file-pick');
      const fileInput = document.getElementById('qrt-file-input');
      const drop = document.getElementById('qrt-file-drop');
      const clear = document.getElementById('qrt-file-clear');
      pick?.addEventListener('click', () => fileInput?.click());
      fileInput?.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (f) uploadAndSetFile(f);
        e.target.value = '';
      });
      clear?.addEventListener('click', () => {
        state.filePath = null;
        state.fileName = null;
        renderFields();
      });
      if (drop) {
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-drag'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
        drop.addEventListener('drop', (e) => {
          e.preventDefault();
          drop.classList.remove('is-drag');
          const f = e.dataTransfer?.files?.[0];
          if (f) uploadAndSetFile(f);
        });
      }
    }
  }
  // Preview EN DIRECTO: cualquier cambio en los campos refresca el QR (debounced).
  host?.querySelectorAll('input, textarea, select').forEach((el) => {
    el.addEventListener('input', () => schedulePreview());
    if (el.tagName === 'SELECT') el.addEventListener('change', () => schedulePreview());
  });
  refreshIcons(host);
  // Render inicial del preview tras (re)pintar los campos.
  schedulePreview();
}

// ── Subida de archivo (tipo dinámico 'file') ──────────────────────────────────

async function uploadAndSetFile(file) {
  if (!isAuthenticated()) { setMsg('Inicia sesión para subir archivos.', 'warn'); return; }
  if (file.size > 20 * 1024 * 1024) { setMsg('El archivo supera el límite de 20 MB.', 'warn'); return; }
  setMsg('Subiendo archivo…');
  try {
    const result = await apiFetch('/api/org/files', {
      method: 'POST',
      body: { action: 'sign-upload', filename: file.name }
    });
    const putRes = await fetch(result.signedURL, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' }
    });
    if (!putRes.ok) throw new Error(`Upload falló: HTTP ${putRes.status}`);
    state.filePath = result.path;
    state.fileName = file.name;
    setMsg(`Archivo cargado: ${file.name}`, 'ok');
    renderFields();
    schedulePreview(true);
  } catch (e) {
    if (e.status === 401 || e.reason === 'auth_required') {
      setMsg('Sesión expirada. Vuelve a iniciar sesión para subir archivos.', 'warn');
    } else {
      setMsg('No se pudo subir el archivo: ' + (e.reason || e.message), 'error');
    }
  }
}

// ── Estático: leer inputs y construir el texto ────────────────────────────────

function collectStaticText() {
  switch (state.type) {
    case 'vcard': {
      const name = (document.getElementById('qrt-vc-name')?.value || '').trim();
      const org = (document.getElementById('qrt-vc-org')?.value || '').trim();
      const phone = (document.getElementById('qrt-vc-phone')?.value || '').trim();
      const email = (document.getElementById('qrt-vc-email')?.value || '').trim();
      if (!name && !phone && !email) return { error: 'Indica al menos un nombre, teléfono o email.' };
      return { text: buildVCard({ name, org, phone, email }) };
    }
    case 'wifi': {
      const ssid = (document.getElementById('qrt-wf-ssid')?.value || '').trim();
      const pass = (document.getElementById('qrt-wf-pass')?.value || '');
      const auth = document.getElementById('qrt-wf-auth')?.value || 'WPA';
      if (!ssid) return { error: 'Indica el nombre de la red (SSID).' };
      if (auth !== 'nopass' && !pass) return { error: 'Indica la contraseña de la red.' };
      return { text: buildWifi({ ssid, pass, auth }) };
    }
    case 'email': {
      const to = (document.getElementById('qrt-em-to')?.value || '').trim();
      const subject = (document.getElementById('qrt-em-subject')?.value || '').trim();
      const bodyTxt = (document.getElementById('qrt-em-body')?.value || '').trim();
      if (!to) return { error: 'Indica el email de destino.' };
      const params = [];
      if (subject) params.push('subject=' + encodeURIComponent(subject));
      if (bodyTxt) params.push('body=' + encodeURIComponent(bodyTxt));
      return { text: `mailto:${to}${params.length ? '?' + params.join('&') : ''}` };
    }
    case 'phone': {
      const num = cleanPhone(document.getElementById('qrt-ph-number')?.value || '');
      if (!num) return { error: 'Indica un número de teléfono.' };
      return { text: `tel:${num}` };
    }
    case 'whatsapp': {
      const num = cleanWaPhone(document.getElementById('qrt-wa-number')?.value || '');
      const text = (document.getElementById('qrt-wa-text')?.value || '').trim();
      if (!num) return { error: 'Indica el teléfono (con prefijo de país).' };
      return { text: `https://wa.me/${num}${text ? '?text=' + encodeURIComponent(text) : ''}` };
    }
    case 'sms': {
      const num = cleanPhone(document.getElementById('qrt-sms-number')?.value || '');
      const text = (document.getElementById('qrt-sms-text')?.value || '').trim();
      if (!num) return { error: 'Indica un número de teléfono.' };
      // smsto:NUMERO:MENSAJE (formato más compatible entre dispositivos).
      return { text: `smsto:${num}${text ? ':' + text : ''}` };
    }
    default: {
      const v = (document.getElementById('qrt-url')?.value || '').trim();
      if (!v) return { error: 'Escribe una URL o un texto.' };
      return { text: v };
    }
  }
}

// ── Pintar un texto en el canvas ──────────────────────────────────────────────

// Nivel de corrección de errores: 'H' cuando hay logo central (más redundancia),
// 'M' en el resto. Subir a H reduce capacidad pero el logo tapa módulos.
function currentECC() {
  return state.logoInQr ? 'H' : 'M';
}

// Pinta el módulo QR pelado en el canvas oculto y luego compone la escena
// completa (fondo + marco + QR + logos) sobre el canvas visible.
async function paintQR(text) {
  let QRCode;
  try { QRCode = await loadQRLib(); }
  catch (e) { setMsg(e.message || 'No se pudo cargar la librería QR.', 'error'); return false; }

  const qrCanvas = document.getElementById('qrt-canvas');
  const empty = document.getElementById('qrt-empty');
  // El módulo pelado se genera SIN margen para que el compositor controle la
  // quiet zone (recuadro blanco bajo el QR). margin pequeño para nitidez.
  const opts = {
    errorCorrectionLevel: currentECC(),
    margin: 1,
    width: QR_SIZE,
    color: { dark: state.color, light: '#ffffff' },
  };

  const drawn = await new Promise((resolve) => {
    QRCode.toCanvas(qrCanvas, text, opts, (err) => {
      if (err) {
        setMsg('No se pudo generar el QR: ' + (err.message || err), 'error');
        return resolve(false);
      }
      resolve(true);
    });
  });
  if (!drawn) return false;

  state.lastText = text;
  if (empty) empty.style.display = 'none';
  document.getElementById('qrt-compose')?.style.setProperty('display', 'block');
  document.getElementById('qrt-dl-png')?.removeAttribute('disabled');
  document.getElementById('qrt-dl-svg')?.removeAttribute('disabled');

  await composePreview();
  return true;
}

// Compone la escena en el canvas visible (#qrt-compose) al tamaño de preview.
async function composePreview() {
  const compose = document.getElementById('qrt-compose');
  const qrCanvas = document.getElementById('qrt-canvas');
  if (!compose || !qrCanvas) return;

  const topLogo = (state.topLogo && companyLogo()) ? await loadImage(companyLogo()) : null;
  const centerLogo = (state.logoInQr && companyLogo()) ? await loadImage(companyLogo()) : null;
  const bgImg = state.bgImage ? await loadImage(state.bgImage) : null;

  await composeToCanvas(compose, {
    qrCanvas,
    templateId: state.template,
    partsState: state.parts,
    bgColor: state.bgColor,
    bgImage: bgImg,
    topLogo,
    centerLogo,
    size: COMPOSE_PREVIEW,
  });
}

// ── Previsualización EN DIRECTO (debounced) ────────────────────────────────────

// Recoge el texto actual del formulario sin marcar errores (modo "silencioso"
// para el preview): si está vacío devuelve null para mostrar el placeholder.
function collectPreviewText() {
  if (state.mode === 'dynamic') {
    if (state.type === 'file') {
      return state.filePath ? `${window.location.origin}/q/preview` : null;
    }
    // El QR real codifica el código corto (se crea al pulsar). Para el preview
    // en directo usamos el destino tecleado como placeholder visual.
    const target = (document.getElementById('qrt-dyn-target')?.value || '').trim();
    return target || null;
  }
  const { text } = collectStaticText();
  return text || null;
}

// Muestra el placeholder y oculta la composición (contenido vacío).
function showEmptyPreview() {
  const compose = document.getElementById('qrt-compose');
  const empty = document.getElementById('qrt-empty');
  if (compose) compose.style.display = 'none';
  if (empty) empty.style.display = 'block';
  state.lastText = '';
  document.getElementById('qrt-dl-png')?.setAttribute('disabled', '');
  document.getElementById('qrt-dl-svg')?.setAttribute('disabled', '');
}

// Programa un render del preview con debounce. immediate=true lo hace ya.
function schedulePreview(immediate = false) {
  if (state._debounceTimer) { clearTimeout(state._debounceTimer); state._debounceTimer = null; }
  const run = async () => {
    if (state._composing) return;
    const text = collectPreviewText();
    if (!text) { showEmptyPreview(); return; }
    state._composing = true;
    try { await paintQR(text); }
    finally { state._composing = false; }
  };
  if (immediate) { run(); return; }
  state._debounceTimer = setTimeout(run, PREVIEW_DEBOUNCE);
}

// ── Acción Generar / Crear ────────────────────────────────────────────────────

async function generate() {
  setMsg('');
  const linkRow = document.getElementById('qrt-link-row');
  if (linkRow) linkRow.style.display = 'none';

  if (state.mode === 'dynamic') return createDynamic();

  const { text, error } = collectStaticText();
  if (error) { setMsg(error, 'warn'); return; }
  setMsg('Generando…');
  // El preview ya está pintado en directo; esto confirma y deja todo listo.
  const ok = await paintQR(text);
  if (ok) setMsg('QR listo. Descárgalo en PNG o SVG.', 'ok');
}

async function createDynamic() {
  if (!isAuthenticated()) {
    setMsg('Inicia sesión para crear QR dinámicos.', 'warn');
    return;
  }
  const title = (document.getElementById('qrt-dyn-title')?.value || '').trim();

  if (state.type === 'file') {
    if (!state.filePath) { setMsg('Sube un archivo antes de crear el QR.', 'warn'); return; }
    const body = { type: 'file', title, filePath: state.filePath, fileName: state.fileName };
    if (state.expiry) body.expiresInDays = Math.min(15, Math.max(1, state.expiryDays));
    setMsg('Creando QR dinámico…');
    let data;
    try {
      data = await apiFetch('/api/qr/create', { method: 'POST', body });
    } catch (e) {
      setMsg('No se pudo crear el QR: ' + (e.reason || e.message), 'error');
      return;
    }
    const link = qrShortUrl(data.code);
    setMsg('Generando…');
    const ok = await paintQR(link);
    if (!ok) return;
    const row = document.getElementById('qrt-link-row');
    const codeEl = document.getElementById('qrt-link-code');
    if (row && codeEl) { codeEl.textContent = link; row.style.display = 'flex'; }
    state.mineLoaded = false;
    setMsg('QR dinámico creado. Lo tienes en "Mis QR".', 'ok');
    refreshIcons(document.getElementById('qrt-view'));
    return;
  }

  const target = (document.getElementById('qrt-dyn-target')?.value || '').trim();
  if (!target) { setMsg('Indica el destino del QR.', 'warn'); return; }
  if (!/^https?:\/\//i.test(target)) { setMsg('El destino debe empezar por http:// o https://', 'warn'); return; }

  const payload = { type: 'url', title, targetUrl: target };
  if (state.expiry) payload.expiresInDays = Math.min(15, Math.max(1, state.expiryDays));

  setMsg('Creando QR dinámico…');
  let data;
  try {
    data = await apiFetch('/api/qr/create', { method: 'POST', body: payload });
  } catch (e) {
    setMsg('No se pudo crear el QR: ' + (e.reason || e.message), 'error');
    return;
  }

  const link = qrShortUrl(data.code);
  setMsg('Generando…');
  const ok = await paintQR(link);
  if (!ok) return;

  // Muestra el enlace corto + botón copiar.
  const row = document.getElementById('qrt-link-row');
  const codeEl = document.getElementById('qrt-link-code');
  if (row && codeEl) {
    codeEl.textContent = link;
    row.style.display = 'flex';
  }
  state.mineLoaded = false; // forzar recarga al ir a "Mis QR"
  setMsg('QR dinámico creado. Lo tienes en "Mis QR".', 'ok');
  refreshIcons(document.getElementById('qrt-view'));
}

function qrShortUrl(code) {
  // En producción el dominio de escaneo es events.thescaleapps.com; en dev usa
  // el origin actual. El redirector vive en /q/<code> en ambos casos.
  return `${window.location.origin}/q/${code}`;
}

// ── Descargas ──────────────────────────────────────────────────────────────────

// Exporta la COMPOSICIÓN completa (fondo + marco + QR + logos) a PNG grande,
// componiendo en un canvas offscreen al tamaño de export.
async function downloadPNG() {
  const qrCanvas = document.getElementById('qrt-canvas');
  if (!qrCanvas || !state.lastText) return;

  const off = document.createElement('canvas');
  const topLogo = (state.topLogo && companyLogo()) ? await loadImage(companyLogo()) : null;
  const centerLogo = (state.logoInQr && companyLogo()) ? await loadImage(companyLogo()) : null;
  const bgImg = state.bgImage ? await loadImage(state.bgImage) : null;

  await composeToCanvas(off, {
    qrCanvas,
    templateId: state.template,
    partsState: state.parts,
    bgColor: state.bgColor,
    bgImage: bgImg,
    topLogo,
    centerLogo,
    size: COMPOSE_EXPORT,
  });
  off.toBlob((blob) => { if (blob) downloadBlob(blob, 'qr-escale.png'); }, 'image/png');
}

// Exporta la COMPOSICIÓN completa a SVG vectorial: marco SVG + QR como SVG
// embebido + fondo y logos como <image> con data URL.
async function downloadSVG() {
  if (!state.lastText) return;
  let QRCode;
  try { QRCode = await loadQRLib(); }
  catch (e) { setMsg(e.message || 'No se pudo cargar la librería QR.', 'error'); return; }

  const qrSVG = await new Promise((resolve) => {
    QRCode.toString(
      state.lastText,
      { type: 'svg', errorCorrectionLevel: currentECC(), margin: 1, color: { dark: state.color, light: '#ffffff' } },
      (err, svg) => resolve(err ? '' : svg)
    );
  });
  if (!qrSVG) { setMsg('No se pudo generar el SVG.', 'error'); return; }

  // Los logos y el fondo deben ir como data URL embebido en el SVG. Si el logo
  // de empresa es una URL remota, lo convertimos a data URL vía canvas.
  const topLogoUrl = (state.topLogo && companyLogo()) ? await toDataUrl(companyLogo()) : '';
  const centerLogoUrl = (state.logoInQr && companyLogo()) ? await toDataUrl(companyLogo()) : '';
  const bgImageUrl = state.bgImage || '';

  const svg = composeToSVG({
    qrSVG,
    templateId: state.template,
    partsState: state.parts,
    bgColor: state.bgColor,
    bgImageUrl,
    topLogoUrl,
    centerLogoUrl,
  });
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'qr-escale.svg');
}

// Convierte una URL/data URL de imagen a data URL (para embeber en SVG).
async function toDataUrl(src) {
  if (!src) return '';
  if (src.startsWith('data:')) return src;
  const img = await loadImage(src);
  if (!img) return '';
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  } catch { return ''; } // canvas "tainted" (sin CORS) — se omite el logo en SVG
}

// Genera y descarga el PNG/SVG de un QR cualquiera (usado desde Mis QR).
async function downloadQRFor(text, filename, kind) {
  let QRCode;
  try { QRCode = await loadQRLib(); } catch { return; }
  const opts = { errorCorrectionLevel: 'M', margin: 2, width: 512, color: { dark: '#0a0a0b', light: '#ffffff' } };
  if (kind === 'svg') {
    QRCode.toString(text, { ...opts, type: 'svg' }, (err, svg) => {
      if (!err && svg) downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
    });
  } else {
    QRCode.toDataURL(text, opts, (err, url) => {
      if (err || !url) return;
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
    });
  }
}

// ── MIS QR ──────────────────────────────────────────────────────────────────

function qrStatusBadge(qr) {
  if (qr.is_active === false) return '<span class="qrt-badge qrt-badge-off">Desactivado</span>';
  if (qr.expires_at && new Date(qr.expires_at).getTime() < Date.now()) {
    return '<span class="qrt-badge qrt-badge-exp">Caducado</span>';
  }
  return '<span class="qrt-badge qrt-badge-on">Activo</span>';
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mineRowHTML(qr) {
  const link = qrShortUrl(qr.code);
  return `
    <div class="qrt-mine-row" data-qr-id="${qr.id}" data-qr-code="${escHtml(qr.code)}">
      <div class="qrt-mine-main">
        <div class="qrt-mine-title">${escHtml(qr.title || '(sin título)')} ${qrStatusBadge(qr)}</div>
        <div class="qrt-mine-target"><i data-lucide="arrow-right"></i><span>${escHtml(qr.target_url || '—')}</span></div>
        <div class="qrt-mine-meta">
          <code>${escHtml(link)}</code>
          <span>· ${Number(qr.scan_count) || 0} escaneos</span>
          <span>· últ.: ${qr.last_scan_at ? fmtDate(qr.last_scan_at) : '—'}</span>
          ${qr.expires_at ? `<span>· caduca: ${fmtDate(qr.expires_at)}</span>` : ''}
        </div>
      </div>
      <div class="qrt-mine-actions">
        <button class="qrt-icbtn" data-act="stats"  title="Ver estadísticas"><i data-lucide="bar-chart-3"></i></button>
        <button class="qrt-icbtn" data-act="edit"   title="Editar destino"><i data-lucide="pencil"></i></button>
        <button class="qrt-icbtn" data-act="toggle" title="${qr.is_active ? 'Desactivar' : 'Activar'}"><i data-lucide="${qr.is_active ? 'toggle-right' : 'toggle-left'}"></i></button>
        <button class="qrt-icbtn" data-act="src"    title="Etiquetar origen (?src=)"><i data-lucide="tag"></i></button>
        <button class="qrt-icbtn" data-act="copy"   title="Copiar enlace"><i data-lucide="copy"></i></button>
        <button class="qrt-icbtn" data-act="png"    title="Descargar PNG"><i data-lucide="image-down"></i></button>
        <button class="qrt-icbtn" data-act="svg"    title="Descargar SVG"><i data-lucide="file-down"></i></button>
      </div>
    </div>
    <!-- Fila de ETIQUETADO DE ORIGEN (?src=), plegable. El mismo QR dinámico
         puede imprimirse en varios soportes con distinto ?src= para medir cuál
         funciona (ver tarjeta "ROI del soporte físico" en las stats). El backend
         ya captura ?src= en el redirector; aquí solo construimos el enlace. -->
    <div class="qrt-src-row hidden" data-src-for="${qr.id}">
      <i data-lucide="tag"></i>
      <input class="qrt-input qrt-src-input" type="text" placeholder="origen (p.ej. entrada, folleto, pantalla)" maxlength="40" autocomplete="off"/>
      <code class="qrt-src-preview">${escHtml(link)}</code>
      <button class="qrt-btn qrt-btn-ghost qrt-btn-sm qrt-src-copy" type="button"><i data-lucide="copy"></i><span>Copiar</span></button>
    </div>`;
}

async function loadMine() {
  const list = document.getElementById('qrt-mine-list');
  if (!list) return;
  if (!isAuthenticated()) {
    list.innerHTML = `<div class="qrt-empty"><i data-lucide="lock"></i><p>Inicia sesión para ver tus QR dinámicos.</p></div>`;
    refreshIcons(list);
    return;
  }
  list.innerHTML = `<div class="qrt-empty"><i data-lucide="loader"></i><p>Cargando…</p></div>`;
  refreshIcons(list);

  let data;
  try {
    data = await apiFetch('/api/qr/list');
  } catch (e) {
    list.innerHTML = `<div class="qrt-empty"><i data-lucide="alert-triangle"></i><p>No se pudo cargar: ${escHtml(e.reason || e.message)}</p></div>`;
    refreshIcons(list);
    return;
  }

  const rows = Array.isArray(data.qrCodes) ? data.qrCodes : [];
  if (!rows.length) {
    list.innerHTML = `<div class="qrt-empty"><i data-lucide="qr-code"></i><p>Aún no tienes QR dinámicos. Créalos en "Crear QR" → Dinámico.</p></div>`;
    refreshIcons(list);
    return;
  }
  list.innerHTML = rows.map(mineRowHTML).join('');
  refreshIcons(list);
  state.mineLoaded = true;

  list.querySelectorAll('.qrt-mine-row').forEach((row) => {
    const qr = rows.find((r) => r.id === row.dataset.qrId);
    // La fila de origen (?src=) va justo DESPUÉS de .qrt-mine-row en el DOM.
    const srcRow = row.nextElementSibling?.classList?.contains('qrt-src-row')
      ? row.nextElementSibling : null;
    row.querySelectorAll('.qrt-icbtn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();   // no disparar el clic de fila (abrir stats)
        if (btn.dataset.act === 'src') { toggleSrcRow(srcRow); return; }
        handleMineAction(btn.dataset.act, qr);
      });
    });
    // Cablea el etiquetado de origen (?src=) de esta fila.
    if (srcRow && qr) bindSrcRow(srcRow, qr);
    // Clic en la fila (fuera de los botones de acción) → abre estadísticas de ESE QR.
    const main = row.querySelector('.qrt-mine-main');
    if (main && qr) {
      main.style.cursor = 'pointer';
      main.title = 'Ver estadísticas';
      main.addEventListener('click', () => openStats(qr));
    }
  });
}

// Muestra/oculta la fila de etiquetado de origen y enfoca el input al abrir.
function toggleSrcRow(srcRow) {
  if (!srcRow) return;
  const hidden = srcRow.classList.toggle('hidden');
  if (!hidden) srcRow.querySelector('.qrt-src-input')?.focus();
}

// Cablea el input "origen" + botón copiar de una fila: el preview se actualiza en
// vivo con <enlace>?src=<origen saneado> y el botón copia ese enlace al portapapeles.
function bindSrcRow(srcRow, qr) {
  const base = qrShortUrl(qr.code);
  const input = srcRow.querySelector('.qrt-src-input');
  const preview = srcRow.querySelector('.qrt-src-preview');
  const copyBtn = srcRow.querySelector('.qrt-src-copy');
  const linkFor = () => {
    const src = sanitizeSrc(input?.value || '');
    return src ? `${base}?src=${src}` : base;
  };
  input?.addEventListener('input', () => { if (preview) preview.textContent = linkFor(); });
  copyBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const link = linkFor();
    try {
      await navigator.clipboard.writeText(link);
      const span = copyBtn.querySelector('span');
      if (span) { span.textContent = 'Copiado'; setTimeout(() => { span.textContent = 'Copiar'; }, 1400); }
    } catch { /* noop */ }
  });
}

async function handleMineAction(act, qr) {
  const link = qrShortUrl(qr.code);
  if (act === 'copy') {
    try { await navigator.clipboard.writeText(link); } catch { /* noop */ }
    return;
  }
  if (act === 'png') { downloadQRFor(link, `qr-${qr.code}.png`, 'png'); return; }
  if (act === 'svg') { downloadQRFor(link, `qr-${qr.code}.svg`, 'svg'); return; }
  if (act === 'stats') { openStats(qr); return; }
  if (act === 'toggle') {
    try {
      await apiFetch('/api/qr/update', { method: 'PATCH', body: { id: qr.id, isActive: !qr.is_active } });
      await loadMine();
    } catch (e) { alert('No se pudo cambiar el estado: ' + (e.reason || e.message)); }
    return;
  }
  if (act === 'edit') {
    const next = prompt('Nuevo destino (URL):', qr.target_url || '');
    if (next == null) return;
    const target = next.trim();
    if (!/^https?:\/\//i.test(target)) { alert('La URL debe empezar por http:// o https://'); return; }
    try {
      await apiFetch('/api/qr/update', { method: 'PATCH', body: { id: qr.id, targetUrl: target } });
      await loadMine();
    } catch (e) { alert('No se pudo actualizar: ' + (e.reason || e.message)); }
    return;
  }
}

// ── PANEL DE STATS (mini-gráficas con divs/CSS, sin librerías) ────────────────

function barListHTML(obj, { translate } = {}) {
  const entries = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '<p class="qrt-stats-empty">Sin datos</p>';
  const max = Math.max(...entries.map((e) => e[1])) || 1;
  return entries.map(([k, v]) => {
    const label = translate ? translate(k) : k;
    const pct = Math.round((v / max) * 100);
    return `
      <div class="qrt-bar-row">
        <span class="qrt-bar-label" title="${escHtml(label)}">${escHtml(label)}</span>
        <span class="qrt-bar-track"><span class="qrt-bar-fill" style="width:${pct}%"></span></span>
        <span class="qrt-bar-val">${v}</span>
      </div>`;
  }).join('');
}

function dayChartHTML(series) {
  if (!series || !series.length) return '<p class="qrt-stats-empty">Sin escaneos todavía</p>';
  const max = Math.max(...series.map((d) => d.count)) || 1;
  return `<div class="qrt-daychart">${series.map((d) => `
    <div class="qrt-daycol" title="${escHtml(d.day)}: ${d.count}">
      <span class="qrt-daybar" style="height:${Math.max(4, Math.round((d.count / max) * 100))}%"></span>
      <span class="qrt-dayx">${fmtDay(d.day)}</span>
    </div>`).join('')}</div>`;
}

function deviceLabel(k) { return ({ mobile: 'Móvil', tablet: 'Tablet', desktop: 'Escritorio' })[k] || k; }

// ── Series temporales: AHORA vienen agregadas del SERVIDOR (UTC) ───────────────
// El endpoint /api/qr/stats agrega en servidor sobre TODOS los eventos (no solo
// recent[]). Consumimos directamente: unique, byHour[24], byWeekday[7] (0=Dom),
// byMonth{YYYY-MM}, byHourWeekday{wd-hour}, bySrc, byCity, byCountry, byOs.
// TODAS las series temporales son UTC → lo rotulamos visiblemente en la UI.
// Etiquetas en español; getHours/getDay NO se usan (los índices ya son UTC del
// servidor), así que no hay riesgo de corrimiento de huso.

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const WEEKDAY_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Orden europeo de días (empieza en Lunes); el índice 0 del servidor es Domingo.
const WEEKDAY_EU_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Normaliza byHour del servidor (array de 24 enteros) a [{ label, count }] 0-23h.
function hourSeries(byHour) {
  const arr = Array.isArray(byHour) ? byHour : [];
  return Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, '0')}h`,
    count: Number(arr[h]) || 0,
  }));
}

// Mini-gráfica de barras verticales genérica (reutiliza el estilo .qrt-daychart).
// series: [{ label, count }]. Vacía si no hay escaneos.
function vBarChartHTML(series) {
  if (!series || !series.length) return '<p class="qrt-stats-empty">Sin escaneos todavía</p>';
  const max = Math.max(...series.map((d) => d.count)) || 1;
  return `<div class="qrt-daychart">${series.map((d) => `
    <div class="qrt-daycol" title="${escHtml(d.label)}: ${d.count}">
      <span class="qrt-daybar" style="height:${Math.max(4, Math.round((d.count / max) * 100))}%"></span>
      <span class="qrt-dayx">${escHtml(d.label)}</span>
    </div>`).join('')}</div>`;
}

// ── HEATMAP hora×día-semana (CSS puro, sin librerías) ─────────────────────────
// byHourWeekday = { '<weekday>-<hour>': count } con weekday 0=Dom..6=Sáb, hora UTC.
// Pintamos una rejilla 7 filas (Lun..Dom, orden europeo) × 24 columnas (0-23h).
// Cada celda colorea su opacidad sobre el color brand en proporción al máximo.
function heatmapHTML(byHourWeekday) {
  const map = byHourWeekday || {};
  let max = 0;
  Object.values(map).forEach((v) => { if (Number(v) > max) max = Number(v); });
  if (max <= 0) return '<p class="qrt-stats-empty">Sin escaneos todavía</p>';

  // Cabecera de horas (cada 3h para no saturar en móvil).
  const headCells = Array.from({ length: 24 }, (_, h) =>
    `<span class="qrt-hm-h">${h % 3 === 0 ? h : ''}</span>`).join('');

  const rows = WEEKDAY_EU_ORDER.map((wd) => {
    const cells = Array.from({ length: 24 }, (_, h) => {
      const n = Number(map[`${wd}-${h}`]) || 0;
      // Opacidad mínima visible 0.08 cuando hay datos; 0 si la celda está vacía.
      const op = n > 0 ? (0.12 + 0.88 * (n / max)).toFixed(3) : 0;
      const title = `${WEEKDAY_FULL[wd]} ${String(h).padStart(2, '0')}h · ${n} escaneo${n === 1 ? '' : 's'} (UTC)`;
      return `<span class="qrt-hm-cell" style="--hm:${op}" title="${escHtml(title)}"></span>`;
    }).join('');
    return `<div class="qrt-hm-row"><span class="qrt-hm-day">${WEEKDAY_LABELS[wd]}</span><div class="qrt-hm-cells">${cells}</div></div>`;
  }).join('');

  return `<div class="qrt-heatmap">
    <div class="qrt-hm-row qrt-hm-head"><span class="qrt-hm-day"></span><div class="qrt-hm-cells qrt-hm-hours">${headCells}</div></div>
    ${rows}
  </div>`;
}

// ── DONA / DONUT (SVG puro, sin librerías) ────────────────────────────────────
// data = { etiqueta: count }. Pinta sectores con stroke-dasharray sobre un círculo
// y devuelve dona + leyenda con %. Paleta fija coherente (iOS/Android destacados).
const DONUT_COLORS = ['#0a0a0b', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#6a6a6e'];
// Colores de marca por SO conocido para destacar iOS vs Android.
const OS_COLORS = { iOS: '#0a0a0b', Android: '#16a34a', Windows: '#2563eb', macOS: '#6a6a6e', Linux: '#d97706' };

function donutHTML(data) {
  const entries = Object.entries(data || {}).filter(([, v]) => Number(v) > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + Number(v), 0);
  if (!total) return '<p class="qrt-stats-empty">Sin datos</p>';

  // r=15.9155 → circunferencia = 100, así stroke-dasharray trabaja en "porcentaje".
  // Cada sector usa dasharray "pct (100-pct)" y un dashoffset = -acumulado para
  // encadenarlos. El grupo <g> se gira -90° en el SVG para empezar arriba (12h).
  const R = 15.9155;
  let acc = 0; // porcentaje acumulado de sectores ya pintados
  const segs = entries.map(([k, v], i) => {
    const pct = (Number(v) / total) * 100;
    const color = OS_COLORS[k] || DONUT_COLORS[i % DONUT_COLORS.length];
    const dash = `${pct.toFixed(3)} ${(100 - pct).toFixed(3)}`;
    const seg = `<circle class="qrt-donut-seg" cx="21" cy="21" r="${R}" fill="none"
      stroke="${color}" stroke-width="6" stroke-dasharray="${dash}" stroke-dashoffset="${(-acc).toFixed(3)}"></circle>`;
    acc += pct;
    return seg;
  }).join('');

  const legend = entries.map(([k, v], i) => {
    const pct = Math.round((Number(v) / total) * 100);
    const color = OS_COLORS[k] || DONUT_COLORS[i % DONUT_COLORS.length];
    return `<div class="qrt-donut-leg">
      <span class="qrt-donut-dot" style="background:${color}"></span>
      <span class="qrt-donut-lbl">${escHtml(k)}</span>
      <span class="qrt-donut-pct">${pct}%</span>
    </div>`;
  }).join('');

  // El grupo de sectores se gira -90° (empezar a las 12h); el texto central queda
  // fuera del grupo para no rotar.
  return `<div class="qrt-donut-wrap">
    <svg class="qrt-donut" viewBox="0 0 42 42" role="img" aria-label="Reparto por sistema operativo">
      <circle cx="21" cy="21" r="${R}" fill="none" stroke="var(--paper-2,#ebe7df)" stroke-width="6"></circle>
      <g transform="rotate(-90 21 21)">${segs}</g>
      <text x="21" y="20.5" class="qrt-donut-c-num">${total}</text>
      <text x="21" y="25" class="qrt-donut-c-lbl">escaneos</text>
    </svg>
    <div class="qrt-donut-legend">${legend}</div>
  </div>`;
}

// Sanea un valor de origen para usarlo en ?src=: minúsculas, sin espacios ni
// caracteres raros, máx 40. Comentado por requisito.
function sanitizeSrc(v) {
  return String(v || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')          // espacios → guiones
    .replace(/[^a-z0-9._-]/g, '')  // solo seguros para URL
    .slice(0, 40);
}

async function openStats(qr) {
  const panel = document.getElementById('qrt-stats-panel');
  if (!panel) return;
  panel.style.display = 'flex';
  panel.innerHTML = `<div class="qrt-stats-card"><div class="qrt-empty"><i data-lucide="loader"></i><p>Cargando estadísticas…</p></div></div>`;
  refreshIcons(panel);

  let data;
  try {
    data = await apiFetch(`/api/qr/stats?id=${encodeURIComponent(qr.id)}`);
  } catch (e) {
    panel.innerHTML = `<div class="qrt-stats-card"><div class="qrt-empty"><i data-lucide="alert-triangle"></i><p>No se pudo cargar: ${escHtml(e.reason || e.message)}</p></div>
      <button class="qrt-btn qrt-btn-ghost" id="qrt-stats-close" type="button">Cerrar</button></div>`;
    refreshIcons(panel);
    document.getElementById('qrt-stats-close')?.addEventListener('click', closeStats);
    return;
  }

  const s = data.stats || {};
  // ── Campos del SERVIDOR (agregados sobre TODOS los eventos, UTC) ────────────
  const total = Number(s.total) || 0;
  const unique = Number(s.unique) || 0;
  // Ratio Total/Único (retención): 1 decimal; '—' si no hay únicos.
  const ratio = unique > 0 ? (total / unique).toFixed(1) : '—';
  // Frase-insight automática según el ratio de reconsulta.
  let insight = 'Aún sin datos suficientes.';
  if (unique > 0) {
    const r = total / unique;
    if (r >= 2) insight = 'Contenido que reconsultan.';
    else if (r >= 1.3) insight = 'Algo de recurrencia.';
    else insight = 'Mayormente de un solo uso.';
  }

  const byHourSeries = hourSeries(s.byHour);

  // Origen físico (?src=). 'directo' = escaneos sin etiquetar.
  const bySrc = s.bySrc || {};
  const srcKeys = Object.keys(bySrc);
  const onlyDirect = srcKeys.length === 0 || (srcKeys.length === 1 && srcKeys[0] === 'directo');

  const recentRows = (s.recent || []).map((ev) => `
    <tr>
      <td>${fmtDate(ev.scanned_at)}</td>
      <td>${escHtml([ev.country, ev.city].filter(Boolean).join(' · ') || '—')}</td>
      <td>${escHtml(deviceLabel(ev.device_type) || '—')}</td>
      <td>${escHtml(ev.browser || '—')}</td>
      <td>${escHtml(ev.src || 'directo')}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="qrt-stats-empty">Sin escaneos todavía</td></tr>';

  // Leyenda UTC reutilizable para las series temporales.
  const utcTag = '<span class="qrt-utc">hora UTC</span>';

  panel.innerHTML = `
    <div class="qrt-stats-card">
      <div class="qrt-stats-head">
        <div>
          <div class="qrt-eyebrow">Analíticas del QR</div>
          <h2 class="qrt-stats-title">${escHtml(qr.title || qr.code)}</h2>
        </div>
        <button class="qrt-icbtn" id="qrt-stats-close" title="Cerrar"><i data-lucide="x"></i></button>
      </div>

      <!-- 1 · INTERÉS Y RETENCIÓN ─────────────────────────────────────────── -->
      <div class="qrt-stats-block">
        <div class="qrt-stats-sub">Interés y retención ${helpHTML('Total de escaneos frente a visitantes únicos. Un ratio alto significa que la gente vuelve a escanear.')}</div>
        <div class="qrt-stats-kpis">
          <div class="qrt-kpi"><span class="qrt-kpi-num">${total}</span><span class="qrt-kpi-lbl">Escaneos totales</span></div>
          <div class="qrt-kpi"><span class="qrt-kpi-num">${unique}</span><span class="qrt-kpi-lbl">Visitantes únicos ${helpHTML('Visitantes distintos, por huella de IP anónima.')}</span></div>
          <div class="qrt-kpi"><span class="qrt-kpi-num">${ratio}</span><span class="qrt-kpi-lbl">Escaneos / único</span></div>
        </div>
        <p class="qrt-insight"><i data-lucide="sparkles"></i> ${escHtml(insight)}</p>
        <div class="qrt-stats-sub qrt-stats-sub-mini">Escaneos por día</div>
        ${dayChartHTML(s.byDay)}
      </div>

      <!-- 2 · EL MOMENTO CLAVE (cuándo escanean) ───────────────────────────── -->
      <div class="qrt-stats-block">
        <div class="qrt-stats-sub">El momento clave ${utcTag} ${helpHTML('Cuándo te escanean, por hora y día — útil para lanzar ofertas o emails en el pico.')}</div>
        ${heatmapHTML(s.byHourWeekday)}
        <div class="qrt-stats-sub qrt-stats-sub-mini">Por hora del día ${utcTag}</div>
        ${vBarChartHTML(byHourSeries)}
      </div>

      <!-- 3 · ROI DEL SOPORTE FÍSICO (origen ?src=) ────────────────────────── -->
      <div class="qrt-stats-block">
        <div class="qrt-stats-sub">ROI del soporte físico ${helpHTML('Qué soporte físico funcionó; etiqueta cada impresión con ?src= en el enlace del QR.')}</div>
        ${onlyDirect
          ? `<p class="qrt-stats-note"><i data-lucide="info"></i> Añade <code>?src=entrada</code> (o folleto, pantalla…) al final del enlace del QR para medir qué soporte funciona. Puedes generar variantes desde "Mis QR".</p>`
          : barListHTML(bySrc)}
      </div>

      <!-- 4 · PERFIL TÉCNICO (SO) ──────────────────────────────────────────── -->
      <div class="qrt-stats-block">
        <div class="qrt-stats-sub">Perfil técnico ${helpHTML('Reparto iOS/Android para decidir dónde optimizar.')}</div>
        <div class="qrt-stats-grid">
          <div>
            <div class="qrt-stats-sub qrt-stats-sub-mini">Sistema operativo</div>
            ${donutHTML(s.byOs)}
          </div>
          <div>
            <div class="qrt-stats-sub qrt-stats-sub-mini">Dispositivo</div>
            ${barListHTML(s.byDevice, { translate: deviceLabel })}
            <div class="qrt-stats-sub qrt-stats-sub-mini" style="margin-top:12px">Navegador</div>
            ${barListHTML(s.byBrowser)}
          </div>
        </div>
      </div>

      <!-- 5 · GEOLOCALIZACIÓN ──────────────────────────────────────────────── -->
      <div class="qrt-stats-block">
        <div class="qrt-stats-sub">Geolocalización ${helpHTML('De dónde escanean: ciudades y países con más escaneos.')}</div>
        <div class="qrt-stats-grid">
          <div>
            <div class="qrt-stats-sub qrt-stats-sub-mini">Top ciudades</div>
            ${barListHTML(s.byCity)}
          </div>
          <div>
            <div class="qrt-stats-sub qrt-stats-sub-mini">Top países</div>
            ${barListHTML(s.byCountry)}
          </div>
        </div>
      </div>

      <!-- Tabla de últimos escaneos (con columna Origen) ──────────────────── -->
      <div class="qrt-stats-block">
        <div class="qrt-stats-sub">Últimos escaneos</div>
        <div class="qrt-stats-tablewrap">
          <table class="qrt-stats-table">
            <thead><tr><th>Fecha</th><th>País / ciudad</th><th>Dispositivo</th><th>Navegador</th><th>Origen</th></tr></thead>
            <tbody>${recentRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  refreshIcons(panel);
  document.getElementById('qrt-stats-close')?.addEventListener('click', closeStats);
  // El panel de stats es un overlay separado de #qrt-view, así que cableamos
  // aquí sus tooltips "?" (bindHelpTooltips es idempotente por nodo).
  bindHelpTooltips(panel);
  panel.addEventListener('click', (e) => { if (e.target === panel) closeStats(); }, { once: true });
}

function closeStats() {
  const panel = document.getElementById('qrt-stats-panel');
  if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
}

// ── Render de la vista activa ─────────────────────────────────────────────────

function renderView() {
  const host = document.getElementById('qrt-view');
  if (!host) return;
  setActiveView();
  if (state.view === 'mine') {
    host.innerHTML = mineViewHTML();
    refreshIcons(host);
    document.getElementById('qrt-mine-refresh')?.addEventListener('click', loadMine);
    loadMine();
    return;
  }
  // create
  host.innerHTML = createViewHTML();
  setActiveMode();
  renderTypeTabs();
  renderFields();
  bindCreateEvents(host);
  refreshIcons(host);
}

function bindCreateEvents(host) {
  host.querySelectorAll('.qrt-seg').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.type === 'file') { state.filePath = null; state.fileName = null; }
      state.mode = btn.dataset.qrMode;
      state.lastText = '';
      setActiveMode();
      renderTypeTabs();
      renderFields();
      setMsg('');
      const row = document.getElementById('qrt-link-row');
      if (row) row.style.display = 'none';
      document.getElementById('qrt-dl-png')?.setAttribute('disabled', '');
      document.getElementById('qrt-dl-svg')?.setAttribute('disabled', '');
    });
  });

  host.querySelector('#qrt-color')?.addEventListener('input', (e) => {
    state.color = e.target.value;
    schedulePreview();
  });

  host.querySelector('#qrt-generate')?.addEventListener('click', generate);
  host.querySelector('#qrt-dl-png')?.addEventListener('click', downloadPNG);
  host.querySelector('#qrt-dl-svg')?.addEventListener('click', downloadSVG);
  host.querySelector('#qrt-link-copy')?.addEventListener('click', async () => {
    const code = document.getElementById('qrt-link-code')?.textContent || '';
    if (code) { try { await navigator.clipboard.writeText(code); } catch { /* noop */ } }
  });

  bindDesignEvents(host);
  bindHelpTooltips(host);

  host.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      generate();
    }
  });
}

// Tooltips "?": en táctil/clic alternan la clase .is-open (en hover/focus se
// muestran solo con CSS). Delegado en el host → cubre secciones re-renderizadas
// (campos dinámicos, panel de diseño) sin volver a cablear. Evita que el clic
// active el <input> del <label> que pueda contener el botón de ayuda.
function bindHelpTooltips(host) {
  if (host._qrHelpBound) return;
  host._qrHelpBound = true;
  host.addEventListener('click', (e) => {
    const help = e.target.closest('[data-qr-help]');
    if (help) {
      e.preventDefault();
      e.stopPropagation();
      const wasOpen = help.classList.contains('is-open');
      // Cierra cualquier otro tooltip abierto antes de abrir este.
      host.querySelectorAll('[data-qr-help].is-open').forEach((el) => el.classList.remove('is-open'));
      if (!wasOpen) help.classList.add('is-open');
      return;
    }
    // Clic fuera de un tooltip → cierra los abiertos.
    host.querySelectorAll('[data-qr-help].is-open').forEach((el) => el.classList.remove('is-open'));
  });
}

// ── Eventos del panel de DISEÑO (plantillas, partes, logos, fondo) ─────────────

function bindDesignEvents(host) {
  // Selección de plantilla.
  host.querySelectorAll('[data-qr-tpl]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.template = btn.dataset.qrTpl;
      // Reinicia el estado de partes con los valores por defecto de la plantilla.
      state.parts = defaultPartsState(getTemplate(state.template));
      renderDesignPanel();
      schedulePreview(true);
    });
  });

  // Partes: toggle on/off + colores stroke/fill.
  bindPartsControls(host);

  // Logo de empresa arriba.
  host.querySelector('#qrt-top-logo')?.addEventListener('change', (e) => {
    if (e.target.checked && !companyLogo()) { e.target.checked = false; promptCompanyLogo(); return; }
    state.topLogo = e.target.checked;
    schedulePreview(true);
  });

  // Logo dentro del QR: fuerza ECC=H (gestionado en currentECC()).
  host.querySelector('#qrt-logo-in-qr')?.addEventListener('change', (e) => {
    if (e.target.checked && !companyLogo()) { e.target.checked = false; promptCompanyLogo(); return; }
    state.logoInQr = e.target.checked;
    if (state.logoInQr) setMsg('Logo central activo: subimos la corrección de errores a H (reduce capacidad).', 'ok');
    schedulePreview(true);
  });

  // Botón "Cargar logo de empresa" cuando no hay logo.
  host.querySelector('#qrt-load-logo')?.addEventListener('click', () => promptCompanyLogo());

  // Fondo: color.
  host.querySelector('#qrt-bg-color')?.addEventListener('input', (e) => {
    state.bgColor = e.target.value;
    schedulePreview();
  });
  // Fondo: imagen.
  host.querySelector('#qrt-bg-img')?.addEventListener('click', () => {
    host.querySelector('#qrt-bg-file')?.click();
  });
  host.querySelector('#qrt-bg-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) { setMsg('La imagen de fondo es demasiado grande (máx. 1 MB).', 'warn'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      state.bgImage = ev.target.result;
      host.querySelector('#qrt-bg-clear')?.classList.remove('hidden');
      schedulePreview(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  host.querySelector('#qrt-bg-clear')?.addEventListener('click', (e) => {
    state.bgImage = null;
    e.currentTarget.classList.add('hidden');
    schedulePreview(true);
  });
}

// Cablea los controles de cada parte (se rellama tras cambiar de plantilla).
function bindPartsControls(host) {
  host.querySelectorAll('[data-qr-part-on]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const id = chk.dataset.qrPartOn;
      if (!state.parts[id]) state.parts[id] = {};
      state.parts[id].on = chk.checked;
      chk.closest('.qrt-part-row')?.classList.toggle('is-off', !chk.checked);
      schedulePreview(true);
    });
  });
  host.querySelectorAll('[data-qr-part-stroke]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const id = inp.dataset.qrPartStroke;
      if (!state.parts[id]) state.parts[id] = {};
      state.parts[id].stroke = inp.value;
      schedulePreview();
    });
  });
  host.querySelectorAll('[data-qr-part-fill]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const id = inp.dataset.qrPartFill;
      if (!state.parts[id]) state.parts[id] = {};
      state.parts[id].fill = inp.value;
      schedulePreview();
    });
  });
}

// Re-renderiza el panel de diseño completo (tras cambiar de plantilla) y vuelve
// a cablear sus eventos. Sincroniza también los controles de logo.
function renderDesignPanel() {
  const old = document.querySelector('.qrt-design');
  if (!old) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = designPanelHTML();
  const fresh = wrap.firstElementChild;
  old.replaceWith(fresh);
  refreshIcons(fresh);
  const host = document.getElementById('qrt-view');
  if (host) bindDesignEvents(host);
}

// Sincroniza los toggles/aviso de logo según haya o no logo de empresa.
function syncLogoControls() {
  const hasLogo = Boolean(companyLogo());
  const noLogo = document.getElementById('qrt-no-logo');
  if (noLogo) noLogo.classList.toggle('hidden', hasLogo);
  const top = document.getElementById('qrt-top-logo');
  const inQr = document.getElementById('qrt-logo-in-qr');
  if (top) top.disabled = !hasLogo;
  if (inQr) inQr.disabled = !hasLogo;
}

function bindShellEvents(overlay) {
  overlay.querySelectorAll('.qrt-viewtab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.qrView;
      renderView();
    });
  });
}

// ── Componente principal ────────────────────────────────────────────────────

export const QRTool = {
  open({ onHome } = {}) {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.style.display = 'block';
      state.onHome = onHome || state.onHome;
      return;
    }

    state.onHome = onHome || null;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'qrtool-overlay';
    overlay.innerHTML = overlayHTML();
    document.body.appendChild(overlay);

    // Header ESTÁNDAR de la suite (logo + Inicio + AppLauncher + chat + IA + cuenta).
    ToolHeader.mount({
      container: overlay.querySelector('#qrt-header-host'),
      toolName: 'Generador de QR',
      logoSrc: 'brand/Logo_horizontal.png',
      onHome: () => {
        if (typeof state.onHome === 'function') state.onHome();
        else QRTool.close();
      },
    });

    bindShellEvents(overlay);
    renderView();
    refreshIcons(overlay);

    loadQRLib().catch(() => {});

    // Copiloto IA del Generador de QR: escucha el botón IA del header estándar
    // (CustomEvent 'escale:tool-ai-open') y abre/cierra su panel. init() es
    // idempotente (registra el listener una sola vez).
    try { QRCopilot.init(); } catch (e) { console.warn('[QRTool] QRCopilot.init falló:', e); }
  },

  close() {
    try { QRCopilot.destroy(); } catch (_) { /* noop */ }
    ToolHeader.unmount();
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
  },

  // ── Hooks públicos para el copiloto IA (refrescar UI tras acciones) ──────────

  /** Recarga la lista "Mis QR" si está visible; si no, la marca para recargar. */
  refreshMine() {
    state.mineLoaded = false;
    if (state.view === 'mine' && document.getElementById('qrt-mine-list')) {
      loadMine();
    }
  },

  /** Cambia a la vista "Mis QR" y la recarga. */
  showMine() {
    state.view = 'mine';
    state.mineLoaded = false;
    renderView();
  },

  /** Abre el panel de estadísticas de un QR (objeto con al menos id, code, title). */
  openStatsFor(qr) {
    if (state.view !== 'mine') this.showMine();
    if (qr) openStats(qr);
  },

  /** ¿Hay sesión activa? (para que el copiloto avise antes de tocar servidor). */
  isAuthenticated() {
    return isAuthenticated();
  },
};

export default QRTool;

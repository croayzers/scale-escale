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
const QR_SIZE = 288;

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
};

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
  { id: 'url', icon: 'link', label: 'Enlace' },
];

function currentTypes() {
  return state.mode === 'dynamic' ? DYNAMIC_TYPES : STATIC_TYPES;
}

// ── Render: formularios por tipo ──────────────────────────────────────────────

function fieldsHTML() {
  if (state.mode === 'dynamic') {
    return `
      <label class="qrt-field qrt-field-full">
        <span>Título (para Mis QR)</span>
        <input id="qrt-dyn-title" class="qrt-input" type="text" placeholder="Campaña feria primavera" autocomplete="off"/>
      </label>
      <label class="qrt-field qrt-field-full">
        <span>Destino (URL a la que redirige)</span>
        <input id="qrt-dyn-target" class="qrt-input" type="url" placeholder="https://tu-destino.com/landing" autocomplete="off"/>
      </label>
      <div class="qrt-field qrt-field-full qrt-expiry">
        <label class="qrt-check">
          <input id="qrt-dyn-expiry" type="checkbox" ${state.expiry ? 'checked' : ''}/>
          <span>Caduca</span>
        </label>
        <label class="qrt-expiry-days ${state.expiry ? '' : 'is-disabled'}">
          <span>Días (máx. 15)</span>
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

function createViewHTML() {
  return `
    <div class="qrt-body">
      <section class="qrt-card qrt-form">
        <div class="qrt-eyebrow">Generador de QR</div>
        <h1 class="qrt-title">Crea tu código QR</h1>

        <div class="qrt-segment" role="tablist" aria-label="Tipo de QR">
          <button class="qrt-seg" data-qr-mode="static" type="button"><i data-lucide="square"></i>Estático</button>
          <button class="qrt-seg" data-qr-mode="dynamic" type="button"><i data-lucide="refresh-cw"></i>Dinámico</button>
        </div>
        <p id="qrt-mode-hint" class="qrt-mode-hint"></p>

        <div class="qrt-tabs" id="qrt-type-tabs" role="tablist"></div>

        <div id="qrt-fields" class="qrt-fields"></div>

        <div class="qrt-row">
          <label class="qrt-color">
            <span>Color</span>
            <input id="qrt-color" type="color" value="${state.color}"/>
          </label>
          <button id="qrt-generate" class="qrt-btn qrt-btn-primary" type="button">
            <i data-lucide="qr-code"></i><span>Generar</span>
          </button>
        </div>

        <div id="qrt-msg" class="qrt-msg" role="status"></div>
      </section>

      <section class="qrt-card qrt-preview">
        <div class="qrt-eyebrow">Previsualización</div>
        <div class="qrt-canvas-wrap">
          <canvas id="qrt-canvas" width="${QR_SIZE}" height="${QR_SIZE}"></canvas>
          <div id="qrt-empty" class="qrt-empty">
            <i data-lucide="qr-code"></i>
            <p>Rellena los datos y pulsa <strong>Generar</strong>.</p>
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
  }
  refreshIcons(host);
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

async function paintQR(text) {
  let QRCode;
  try { QRCode = await loadQRLib(); }
  catch (e) { setMsg(e.message || 'No se pudo cargar la librería QR.', 'error'); return false; }

  const canvas = document.getElementById('qrt-canvas');
  const empty = document.getElementById('qrt-empty');
  const opts = {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: QR_SIZE,
    color: { dark: state.color, light: '#ffffff' },
  };
  return new Promise((resolve) => {
    QRCode.toCanvas(canvas, text, opts, (err) => {
      if (err) {
        setMsg('No se pudo generar el QR: ' + (err.message || err), 'error');
        return resolve(false);
      }
      state.lastText = text;
      if (empty) empty.style.display = 'none';
      canvas.style.display = 'block';
      document.getElementById('qrt-dl-png')?.removeAttribute('disabled');
      document.getElementById('qrt-dl-svg')?.removeAttribute('disabled');
      resolve(true);
    });
  });
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
  const ok = await paintQR(text);
  if (ok) setMsg('QR listo. Descárgalo en PNG o SVG.', 'ok');
}

async function createDynamic() {
  if (!isAuthenticated()) {
    setMsg('Inicia sesión para crear QR dinámicos.', 'warn');
    return;
  }
  const title = (document.getElementById('qrt-dyn-title')?.value || '').trim();
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

function downloadPNG() {
  const canvas = document.getElementById('qrt-canvas');
  if (!canvas || !state.lastText) return;
  canvas.toBlob((blob) => { if (blob) downloadBlob(blob, 'qr-escale.png'); }, 'image/png');
}

async function downloadSVG() {
  if (!state.lastText) return;
  let QRCode;
  try { QRCode = await loadQRLib(); }
  catch (e) { setMsg(e.message || 'No se pudo cargar la librería QR.', 'error'); return; }
  QRCode.toString(
    state.lastText,
    { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: state.color, light: '#ffffff' } },
    (err, svg) => {
      if (err || !svg) { setMsg('No se pudo generar el SVG.', 'error'); return; }
      downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'qr-escale.svg');
    }
  );
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
        <button class="qrt-icbtn" data-act="copy"   title="Copiar enlace"><i data-lucide="copy"></i></button>
        <button class="qrt-icbtn" data-act="png"    title="Descargar PNG"><i data-lucide="image-down"></i></button>
        <button class="qrt-icbtn" data-act="svg"    title="Descargar SVG"><i data-lucide="file-down"></i></button>
      </div>
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
    row.querySelectorAll('.qrt-icbtn').forEach((btn) => {
      btn.addEventListener('click', () => handleMineAction(btn.dataset.act, qr));
    });
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
  const recentRows = (s.recent || []).map((ev) => `
    <tr>
      <td>${fmtDate(ev.scanned_at)}</td>
      <td>${escHtml([ev.country, ev.city].filter(Boolean).join(' · ') || '—')}</td>
      <td>${escHtml(deviceLabel(ev.device_type) || '—')}</td>
      <td>${escHtml(ev.browser || '—')}</td>
      <td class="qrt-ref">${escHtml(ev.referrer || '—')}</td>
    </tr>`).join('') || '<tr><td colspan="5" class="qrt-stats-empty">Sin escaneos todavía</td></tr>';

  panel.innerHTML = `
    <div class="qrt-stats-card">
      <div class="qrt-stats-head">
        <div>
          <div class="qrt-eyebrow">Estadísticas</div>
          <h2 class="qrt-stats-title">${escHtml(qr.title || qr.code)}</h2>
        </div>
        <button class="qrt-icbtn" id="qrt-stats-close" title="Cerrar"><i data-lucide="x"></i></button>
      </div>

      <div class="qrt-stats-kpis">
        <div class="qrt-kpi"><span class="qrt-kpi-num">${s.total || 0}</span><span class="qrt-kpi-lbl">Escaneos totales</span></div>
        <div class="qrt-kpi"><span class="qrt-kpi-num">${(s.byDay || []).length}</span><span class="qrt-kpi-lbl">Días con actividad</span></div>
        <div class="qrt-kpi"><span class="qrt-kpi-num">${Object.keys(s.byCountry || {}).length}</span><span class="qrt-kpi-lbl">Países</span></div>
      </div>

      <div class="qrt-stats-block">
        <div class="qrt-stats-sub">Escaneos por día</div>
        ${dayChartHTML(s.byDay)}
      </div>

      <div class="qrt-stats-grid">
        <div class="qrt-stats-block"><div class="qrt-stats-sub">Dispositivo</div>${barListHTML(s.byDevice, { translate: deviceLabel })}</div>
        <div class="qrt-stats-block"><div class="qrt-stats-sub">Sistema operativo</div>${barListHTML(s.byOs)}</div>
        <div class="qrt-stats-block"><div class="qrt-stats-sub">Navegador</div>${barListHTML(s.byBrowser)}</div>
        <div class="qrt-stats-block"><div class="qrt-stats-sub">País</div>${barListHTML(s.byCountry)}</div>
      </div>

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
    if (state.lastText) paintQR(state.lastText);
  });

  host.querySelector('#qrt-generate')?.addEventListener('click', generate);
  host.querySelector('#qrt-dl-png')?.addEventListener('click', downloadPNG);
  host.querySelector('#qrt-dl-svg')?.addEventListener('click', downloadSVG);
  host.querySelector('#qrt-link-copy')?.addEventListener('click', async () => {
    const code = document.getElementById('qrt-link-code')?.textContent || '';
    if (code) { try { await navigator.clipboard.writeText(code); } catch { /* noop */ } }
  });

  host.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      generate();
    }
  });
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

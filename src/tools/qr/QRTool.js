// QRTool.js — Generador de QR autocontenido para comerciales (E-scale).
//
// Herramienta NUEVA e independiente del editor 3D: NO importa nada del editor
// ni carga Three.js. El hub la invoca con:
//   import('../tools/qr/QRTool.js').then(m => m.QRTool.open({ onHome }))
//
// Librería QR: soldair/node-qrcode (UMD browser bundle) cargada BAJO DEMANDA por
// CDN dentro de este módulo (no en index.html, para no penalizar el arranque del
// editor). El bundle declara `var QRCode = ...` en scope global, por lo que al
// cargarlo con un <script> normal queda como `window.QRCode`, con la API:
//   QRCode.toCanvas(canvas, text, opts, cb)   -> dibuja en canvas
//   QRCode.toDataURL(text, opts, cb)          -> PNG dataURL
//   QRCode.toString(text, {type:'svg'}, cb)   -> string SVG
//
// NOTA CDN: el bundle UMD para navegador NO se publica en npm (la ruta jsdelivr
// /build/qrcode.min.js da 404). cdnjs sí sirve el bundle UMD; usamos esa URL.
//
// Mejora futura posible (omitida por simplicidad/robustez): logo central en el QR.

const QR_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.1/qrcode.min.js';

let _qrLibPromise = null;

/** Carga la librería QR una sola vez (guardia anti-doble-carga). */
function loadQRLib() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  if (_qrLibPromise) return _qrLibPromise;

  _qrLibPromise = new Promise((resolve, reject) => {
    // Reutiliza un <script> ya inyectado si lo hubiera.
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
      _qrLibPromise = null; // permite reintentar tras un fallo de red
      reject(new Error('No se pudo cargar la librería QR (revisa tu conexión)'));
    };
    document.head.appendChild(s);
  });
  return _qrLibPromise;
}

// ── Helpers de construcción de contenido ───────────────────────────────────

function escVCard(v) {
  return String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function escWifi(v) {
  // En el formato WIFI:, los caracteres especiales se escapan con backslash.
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
  const T = auth === 'nopass' ? 'nopass' : auth; // WPA | WEP | nopass
  const p = auth === 'nopass' ? '' : ('P:' + escWifi(pass) + ';');
  return `WIFI:T:${T};S:${escWifi(ssid)};${p};`;
}

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

// ── Componente principal ────────────────────────────────────────────────────

const OVERLAY_ID = 'qrtool-overlay';
const QR_SIZE = 288; // px, legible y razonable

const state = {
  type: 'url',           // 'url' | 'vcard' | 'wifi'
  color: '#0a0a0b',      // color de los módulos
  lastText: '',          // último contenido generado (para descargas)
  onHome: null,
};

function fieldsHTML() {
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
    default: // url / texto
      return `
        <label class="qrt-field qrt-field-full">
          <span>URL o texto</span>
          <textarea id="qrt-url" class="qrt-input qrt-textarea" rows="3" placeholder="https://escale.app  ·  o cualquier texto"></textarea>
        </label>`;
  }
}

function overlayHTML() {
  return `
    <div class="qrt-shell">
      <header class="qrt-top">
        <img class="qrt-logo" src="brand/Logo_horizontal.png" alt="E-scale" onerror="this.style.display='none'"/>
        <button id="qrt-home" class="qrt-home" type="button" title="Volver al inicio">
          <i data-lucide="home"></i><span>Inicio</span>
        </button>
      </header>

      <div class="qrt-body">
        <section class="qrt-card qrt-form">
          <div class="qrt-eyebrow">Generador de QR</div>
          <h1 class="qrt-title">Crea tu código QR</h1>

          <div class="qrt-tabs" role="tablist">
            <button class="qrt-tab" data-qr-type="url"   type="button"><i data-lucide="link"></i>URL / Texto</button>
            <button class="qrt-tab" data-qr-type="vcard" type="button"><i data-lucide="contact"></i>Contacto</button>
            <button class="qrt-tab" data-qr-type="wifi"  type="button"><i data-lucide="wifi"></i>WiFi</button>
          </div>

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
          <div class="qrt-downloads">
            <button id="qrt-dl-png" class="qrt-btn qrt-btn-ghost" type="button" disabled><i data-lucide="image-down"></i>PNG</button>
            <button id="qrt-dl-svg" class="qrt-btn qrt-btn-ghost" type="button" disabled><i data-lucide="file-down"></i>SVG</button>
          </div>
        </section>
      </div>
    </div>`;
}

function setMsg(text, kind) {
  const el = document.getElementById('qrt-msg');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'qrt-msg' + (kind ? ' qrt-msg-' + kind : '');
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function setActiveTab() {
  document.querySelectorAll('.qrt-tab').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.qrType === state.type);
  });
}

function renderFields() {
  const host = document.getElementById('qrt-fields');
  if (host) host.innerHTML = fieldsHTML();
  refreshIcons();
}

/** Lee los inputs según el tipo y devuelve el texto del QR, o '' si falta lo mínimo. */
function collectText() {
  if (state.type === 'vcard') {
    const name = (document.getElementById('qrt-vc-name')?.value || '').trim();
    const org = (document.getElementById('qrt-vc-org')?.value || '').trim();
    const phone = (document.getElementById('qrt-vc-phone')?.value || '').trim();
    const email = (document.getElementById('qrt-vc-email')?.value || '').trim();
    if (!name && !phone && !email) return { error: 'Indica al menos un nombre, teléfono o email.' };
    return { text: buildVCard({ name, org, phone, email }) };
  }
  if (state.type === 'wifi') {
    const ssid = (document.getElementById('qrt-wf-ssid')?.value || '').trim();
    const pass = (document.getElementById('qrt-wf-pass')?.value || '');
    const auth = document.getElementById('qrt-wf-auth')?.value || 'WPA';
    if (!ssid) return { error: 'Indica el nombre de la red (SSID).' };
    if (auth !== 'nopass' && !pass) return { error: 'Indica la contraseña de la red.' };
    return { text: buildWifi({ ssid, pass, auth }) };
  }
  const v = (document.getElementById('qrt-url')?.value || '').trim();
  if (!v) return { error: 'Escribe una URL o un texto.' };
  return { text: v };
}

async function generate() {
  const { text, error } = collectText();
  if (error) {
    setMsg(error, 'warn');
    return;
  }

  setMsg('Generando…');
  let QRCode;
  try {
    QRCode = await loadQRLib();
  } catch (e) {
    setMsg(e.message || 'No se pudo cargar la librería QR.', 'error');
    return;
  }

  const canvas = document.getElementById('qrt-canvas');
  const empty = document.getElementById('qrt-empty');
  const opts = {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: QR_SIZE,
    color: { dark: state.color, light: '#ffffff' },
  };

  QRCode.toCanvas(canvas, text, opts, (err) => {
    if (err) {
      setMsg('No se pudo generar el QR: ' + (err.message || err), 'error');
      return;
    }
    state.lastText = text;
    if (empty) empty.style.display = 'none';
    canvas.style.display = 'block';
    document.getElementById('qrt-dl-png')?.removeAttribute('disabled');
    document.getElementById('qrt-dl-svg')?.removeAttribute('disabled');
    setMsg('QR listo. Descárgalo en PNG o SVG.', 'ok');
  });
}

function downloadPNG() {
  const canvas = document.getElementById('qrt-canvas');
  if (!canvas || !state.lastText) return;
  // Export directo del canvas ya pintado (fondo blanco incluido por la lib).
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, 'qr-escale.png');
  }, 'image/png');
}

async function downloadSVG() {
  if (!state.lastText) return;
  let QRCode;
  try {
    QRCode = await loadQRLib();
  } catch (e) {
    setMsg(e.message || 'No se pudo cargar la librería QR.', 'error');
    return;
  }
  QRCode.toString(
    state.lastText,
    { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: state.color, light: '#ffffff' } },
    (err, svg) => {
      if (err || !svg) {
        setMsg('No se pudo generar el SVG.', 'error');
        return;
      }
      downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'qr-escale.svg');
    }
  );
}

function bindEvents(overlay) {
  // Tabs de tipo
  overlay.querySelectorAll('.qrt-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.type = btn.dataset.qrType;
      setActiveTab();
      renderFields();
      setMsg('');
    });
  });

  overlay.querySelector('#qrt-color')?.addEventListener('input', (e) => {
    state.color = e.target.value;
    // Si ya hay un QR generado, lo refrescamos al vuelo con el nuevo color.
    if (state.lastText) generate();
  });

  overlay.querySelector('#qrt-generate')?.addEventListener('click', generate);
  overlay.querySelector('#qrt-dl-png')?.addEventListener('click', downloadPNG);
  overlay.querySelector('#qrt-dl-svg')?.addEventListener('click', downloadSVG);

  overlay.querySelector('#qrt-home')?.addEventListener('click', () => {
    if (typeof state.onHome === 'function') state.onHome();
    else QRTool.close();
  });

  // Enter en un input simple (no textarea) dispara Generar.
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      generate();
    }
  });
}

export const QRTool = {
  /**
   * Monta el overlay a pantalla completa del generador de QR.
   * @param {{ onHome?: () => void }} [param0]
   */
  open({ onHome } = {}) {
    // Evita duplicados: si ya está montado, solo lo muestra.
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

    // Estado inicial de la UI
    setActiveTab();
    renderFields();
    bindEvents(overlay);
    refreshIcons();

    // Pre-carga la librería en segundo plano (mejor UX); ignora errores aquí,
    // se reportarán al pulsar "Generar".
    loadQRLib().catch(() => {});
  },

  /** Desmonta/oculta el overlay del generador. */
  close() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
  },
};

export default QRTool;

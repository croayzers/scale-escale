// QRCopilot.js — COPILOTO de IA específico del Generador de QR (E-scale).
//
// Ligero e independiente del AICopilot del editor 3D (ese está acoplado a la
// escena/catálogo y deshabilitado). Este copiloto:
//   - Escucha el CustomEvent('escale:tool-ai-open') que dispara el botón IA del
//     header estándar (src/ui/ToolHeader.js, id #btn-tool-ai). Hace
//     preventDefault() para suprimir el aviso placeholder y hace toggle del panel.
//   - Habla con la Claude API a través del proxy server-side /api/ai/qr-chat
//     (la API key vive en el servidor; aquí NUNCA se expone).
//   - Ejecuta el BUCLE de tool_use en el cliente: mientras la respuesta tenga
//     stop_reason 'tool_use', ejecuta la(s) tool(s) y reenvía los tool_result.
//   - Las tools que tocan servidor llaman a /api/qr/* con el Bearer token del
//     usuario (AuthManager), igual que QRTool. Tras crear/editar refresca la UI
//     vía los hooks públicos de QRTool (refreshMine/showMine/openStatsFor).
//
// UI: panel flotante a la derecha, estilo .qrc-* (styles/qrcopilot.css), coherente
// con .qrt-*. Iconos lucide.

import { QRTool } from './QRTool.js';

const AI_ENDPOINT = '/api/ai/qr-chat';
const PANEL_ID = 'qrc-panel';
const MAX_TOOL_HOPS = 6; // guarda contra bucles de tool_use infinitos

// ── Auth + fetch a /api/qr/* (mismo patrón que QRTool) ───────────────────────

function getAccessToken() {
  try { return window.__ESCALE_AUTH__?.getAccessToken?.() || ''; }
  catch { return ''; }
}
function isAuthenticated() { return Boolean(getAccessToken()); }

async function qrApiFetch(path, { method = 'GET', body } = {}) {
  const token = getAccessToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* no-JSON */ }
  if (!res.ok || !data?.ok) {
    const reason = data?.reason || data?.error || `HTTP ${res.status}`;
    const err = new Error(reason);
    err.status = res.status;
    throw err;
  }
  return data;
}

function qrShortUrl(code) {
  return `${window.location.origin}/q/${code}`;
}

// ── Definición de TOOLS (schema Claude tool_use) ──────────────────────────────

const TOOLS = [
  {
    name: 'crear_qr_dinamico',
    description: 'Crea un QR DINÁMICO (su destino se puede cambiar luego sin reimprimir y registra estadísticas de escaneo). Úsalo cuando el usuario quiera un QR cuyo destino podría cambiar o del que quiera medir escaneos. Requiere sesión iniciada.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título para identificarlo en "Mis QR" (p.ej. "Menú feria primavera").' },
        target_url: { type: 'string', description: 'URL de destino a la que redirige. Debe empezar por http:// o https://' },
        expira_dias: { type: 'number', description: 'Días hasta caducar (1-15). Omitir si no caduca.' }
      },
      required: ['target_url']
    }
  },
  {
    name: 'listar_qr',
    description: 'Lista los QR dinámicos del usuario con su título, destino, nº de escaneos y estado. Úsalo para responder "¿cuántos QR tengo?", "¿cuál es el más escaneado?", o para localizar un QR por su título antes de editarlo o ver sus stats.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'editar_qr',
    description: 'Edita un QR dinámico existente: cambiar su destino (sin reimprimir), activarlo/desactivarlo o ajustar su caducidad. Identifica el QR por id o por una pista de título (busca difusa). Si hay ambigüedad, primero usa listar_qr.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID exacto del QR (si lo conoces).' },
        busca: { type: 'string', description: 'Pista del título para localizarlo si no tienes el id.' },
        target_url: { type: 'string', description: 'Nuevo destino (http(s)://...).' },
        is_active: { type: 'boolean', description: 'true para activar, false para desactivar.' },
        expira_dias: { type: 'number', description: 'Nueva caducidad en días (1-15) desde la creación.' }
      }
    }
  },
  {
    name: 'stats_qr',
    description: 'Devuelve las estadísticas de escaneo de un QR dinámico: total, por país, por dispositivo, por día y último escaneo. Identifica el QR por id o por pista de título. Úsalo para "¿cómo va el QR del menú?".',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID exacto del QR.' },
        busca: { type: 'string', description: 'Pista del título para localizarlo.' }
      }
    }
  }
];

// ── Resolución difusa de QR por título (sin acentos, case-insensitive) ────────

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos/diacríticos combinados
    .trim();
}

async function fetchAllQr() {
  const data = await qrApiFetch('/api/qr/list');
  return Array.isArray(data.qrCodes) ? data.qrCodes : [];
}

function resolveQr(list, { id, busca }) {
  if (id) {
    const byId = list.find((q) => q.id === id);
    if (byId) return { qr: byId };
  }
  if (busca) {
    const needle = normalize(busca);
    const matches = list.filter((q) => normalize(q.title).includes(needle));
    if (matches.length === 1) return { qr: matches[0] };
    if (matches.length > 1) {
      return { error: `Hay ${matches.length} QR que coinciden con "${busca}": ${matches.map((m) => m.title || m.code).join(', ')}. Pide al usuario que concrete.` };
    }
    // Coincidencia parcial por code como último recurso.
    const byCode = list.find((q) => normalize(q.code) === needle);
    if (byCode) return { qr: byCode };
  }
  return { error: 'No encontré ningún QR que coincida. Usa listar_qr para ver los disponibles.' };
}

// ── Ejecución de una tool → resultado serializable para Claude ────────────────

async function executeTool(name, input) {
  input = input || {};
  try {
    if (!isAuthenticated() && name !== 'listar_qr') {
      return { ok: false, error: 'El usuario no ha iniciado sesión; no puedo operar sobre QR dinámicos.' };
    }

    if (name === 'crear_qr_dinamico') {
      const target = String(input.target_url || '').trim();
      if (!/^https?:\/\//i.test(target)) {
        return { ok: false, error: 'El destino debe empezar por http:// o https://' };
      }
      const payload = { type: 'url', title: String(input.title || '').trim(), targetUrl: target };
      if (input.expira_dias != null) {
        const d = Math.floor(Number(input.expira_dias));
        if (!Number.isFinite(d) || d < 1) return { ok: false, error: 'expira_dias debe ser un número ≥ 1.' };
        if (d > 15) return { ok: false, error: 'La caducidad máxima es 15 días.' };
        payload.expiresInDays = d;
      }
      const data = await qrApiFetch('/api/qr/create', { method: 'POST', body: payload });
      QRTool.refreshMine?.();
      return { ok: true, code: data.code, id: data.id, enlace: qrShortUrl(data.code), titulo: payload.title || null };
    }

    if (name === 'listar_qr') {
      if (!isAuthenticated()) return { ok: false, error: 'El usuario no ha iniciado sesión.' };
      const list = await fetchAllQr();
      return {
        ok: true,
        total: list.length,
        qr: list.map((q) => ({
          id: q.id,
          titulo: q.title || '(sin título)',
          destino: q.target_url,
          enlace: qrShortUrl(q.code),
          escaneos: Number(q.scan_count) || 0,
          activo: q.is_active !== false,
          ultimo_escaneo: q.last_scan_at || null,
          caduca: q.expires_at || null
        }))
      };
    }

    if (name === 'editar_qr') {
      const list = await fetchAllQr();
      const { qr, error } = resolveQr(list, input);
      if (error) return { ok: false, error };
      const patch = { id: qr.id };
      if (input.target_url != null) {
        const t = String(input.target_url).trim();
        if (!/^https?:\/\//i.test(t)) return { ok: false, error: 'El destino debe empezar por http:// o https://' };
        patch.targetUrl = t;
      }
      if (input.is_active != null) patch.isActive = Boolean(input.is_active);
      if (input.expira_dias != null) {
        const d = Math.floor(Number(input.expira_dias));
        if (!Number.isFinite(d) || d < 1) return { ok: false, error: 'expira_dias debe ser un número ≥ 1.' };
        if (d > 15) return { ok: false, error: 'La caducidad máxima es 15 días.' };
        patch.expiresInDays = d;
      }
      if (Object.keys(patch).length === 1) return { ok: false, error: 'No indicaste ningún cambio (destino, estado o caducidad).' };
      const data = await qrApiFetch('/api/qr/update', { method: 'PATCH', body: patch });
      QRTool.refreshMine?.();
      return { ok: true, qr: { id: data.qr?.id, titulo: data.qr?.title, destino: data.qr?.target_url, activo: data.qr?.is_active } };
    }

    if (name === 'stats_qr') {
      const list = await fetchAllQr();
      const { qr, error } = resolveQr(list, input);
      if (error) return { ok: false, error };
      const data = await qrApiFetch(`/api/qr/stats?id=${encodeURIComponent(qr.id)}`);
      const s = data.stats || {};
      QRTool.openStatsFor?.({ id: qr.id, code: qr.code, title: qr.title });
      return {
        ok: true,
        titulo: qr.title || qr.code,
        total: s.total || 0,
        por_pais: s.byCountry || {},
        por_dispositivo: s.byDevice || {},
        por_dia: (s.byDay || []).slice(-14),
        ultimo_escaneo: data.qr?.last_scan_at || null,
        activo: data.qr?.is_active !== false
      };
    }

    return { ok: false, error: `Tool desconocida: ${name}` };
  } catch (e) {
    return { ok: false, error: e.message || 'Error ejecutando la acción.' };
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystem() {
  return `Eres el copiloto del Generador de QR de E-scale, una herramienta para comerciales y equipos.
Ayudas a:
- Crear códigos QR estáticos (contenido fijo: URL, texto, vCard, WiFi, email, teléfono, WhatsApp, SMS) y dinámicos (destino editable después, con estadísticas de escaneo).
- Cambiar el destino de un QR dinámico SIN reimprimirlo.
- Fijar caducidad a un QR dinámico (máximo 15 días).
- Consultar estadísticas de escaneos (total, por país, por dispositivo, último escaneo).

Tienes herramientas para operar directamente: crear_qr_dinamico, listar_qr, editar_qr y stats_qr.
Úsalas en lugar de solo describir los pasos cuando el usuario pida una acción concreta.
Para crear o consultar QR el usuario debe tener sesión iniciada; si una tool devuelve que no hay sesión, dilo con tacto.
Los QR estáticos se generan en el propio formulario (modo Estático): si piden uno, explica brevemente que rellenen el formulario y pulsen Generar (no hay tool de servidor para estáticos).

Reglas de estilo: responde SIEMPRE en español, breve y práctico (2-4 frases). Confirma lo que has hecho con el dato útil (enlace, nº de escaneos, etc.). No inventes funciones que no existen. La caducidad nunca supera 15 días.`;
}

// ── Estado + helpers de DOM ───────────────────────────────────────────────────

let _messages = [];
let _open = false;
let _loading = false;
let _listener = null;
let _greeted = false;

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderMd(md) {
  return esc(md)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>');
}
function refreshIcons(root) {
  if (window.lucide?.createIcons) {
    try { window.lucide.createIcons(root ? { nodes: [root] } : undefined); } catch { /* noop */ }
  }
}

function panelHTML() {
  return `
    <div class="qrc-head">
      <div class="qrc-head-brand">
        <span class="qrc-spark"><i data-lucide="sparkles"></i></span>
        <div>
          <div class="qrc-title">Copiloto QR</div>
          <div class="qrc-sub">Crea, edita y consulta tus QR</div>
        </div>
      </div>
      <button id="qrc-close" class="qrc-icbtn" type="button" title="Cerrar"><i data-lucide="x"></i></button>
    </div>
    <div id="qrc-messages" class="qrc-messages"></div>
    <form id="qrc-form" class="qrc-form">
      <textarea id="qrc-input" class="qrc-input" rows="1" placeholder="Pídeme crear un QR, cambiar un destino, ver estadísticas…" autocomplete="off"></textarea>
      <button id="qrc-send" class="qrc-send" type="submit" title="Enviar"><i data-lucide="send"></i></button>
    </form>`;
}

function appendMsg(role, html, id) {
  const list = $('qrc-messages');
  if (!list) return null;
  const div = document.createElement('div');
  div.className = `qrc-msg qrc-msg-${role}`;
  if (id) div.id = id;
  div.innerHTML = html;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
  refreshIcons(div);
  return div;
}

function setLoading(on) {
  _loading = on;
  const send = $('qrc-send');
  const inp = $('qrc-input');
  if (send) send.disabled = on;
  if (inp) inp.disabled = on;
}

// ── Llamada al proxy + bucle de tool_use ──────────────────────────────────────

async function callClaude() {
  // El server resuelve la empresa del usuario (y sus API keys en flags.ai) a
  // partir de ESTE Bearer token. Sin él responde { ok:false, reason:'not_authenticated' }.
  const token = getAccessToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ system: buildSystem(), messages: _messages, tools: TOOLS })
  });
  let data = null;
  try { data = await res.json(); } catch { /* noop */ }
  if (!data) throw new Error('Respuesta vacía del servidor.');
  if (data.ok === false) {
    if (data.reason === 'ai_not_configured') {
      const e = new Error('IA no configurada'); e.notConfigured = true; throw e;
    }
    if (data.reason === 'not_authenticated') {
      const e = new Error('Sesión no iniciada'); e.notAuthenticated = true; throw e;
    }
    throw new Error(data.reason || 'La IA no está disponible ahora mismo.');
  }
  return data;
}

async function runConversation() {
  let hops = 0;
  while (hops < MAX_TOOL_HOPS) {
    const data = await callClaude();
    const content = Array.isArray(data.content) ? data.content : [];

    // Pinta el texto de este turno.
    let textHtml = '';
    const toolUses = [];
    for (const block of content) {
      if (block.type === 'text' && block.text) textHtml += renderMd(block.text);
      if (block.type === 'tool_use') toolUses.push(block);
    }
    if (textHtml) appendMsg('assistant', textHtml);

    // Guarda el turno del asistente (con sus tool_use) en el historial.
    _messages.push({ role: 'assistant', content });

    if (data.stop_reason !== 'tool_use' || !toolUses.length) return;

    // Ejecuta cada tool y arma los tool_result.
    const results = [];
    for (const tu of toolUses) {
      const out = await executeTool(tu.name, tu.input || {});
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) });
    }
    _messages.push({ role: 'user', content: results });
    hops += 1;
  }
  appendMsg('assistant', renderMd('He hecho varios pasos seguidos. ¿Quieres que continúe?'));
}

async function send(text) {
  text = (text || '').trim();
  if (!text || _loading) return;

  const inp = $('qrc-input');
  if (inp) { inp.value = ''; inp.style.height = 'auto'; }

  appendMsg('user', esc(text));
  _messages.push({ role: 'user', content: text });
  setLoading(true);

  const typingId = `qrc-typing-${Date.now()}`;
  appendMsg('assistant', '<span class="qrc-dots"><span></span><span></span><span></span></span>', typingId);

  try {
    await runConversation();
    $(typingId)?.remove();
  } catch (err) {
    $(typingId)?.remove();
    if (err.notAuthenticated) {
      appendMsg('assistant', renderMd('Inicia sesión para usar el copiloto: la IA usa la configuración de tu empresa.'));
    } else if (err.notConfigured) {
      appendMsg('assistant', renderMd('La IA no está configurada para tu empresa. Pide al administrador que añada una API key en los ajustes de IA.'));
    } else {
      appendMsg('assistant', `<span class="qrc-error">${esc(err.message || 'Error inesperado.')}</span>`);
    }
    console.error('[QRCopilot]', err);
  } finally {
    setLoading(false);
    $(typingId)?.remove();
    $('qrc-input')?.focus();
  }
}

// ── Montaje / open / close / toggle ───────────────────────────────────────────

function ensurePanel() {
  let panel = $(PANEL_ID);
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'qrc-panel qrc-hidden';
  panel.innerHTML = panelHTML();
  document.body.appendChild(panel);

  $('qrc-close')?.addEventListener('click', close);
  $('qrc-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    send($('qrc-input')?.value ?? '');
  });
  const inp = $('qrc-input');
  inp?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e.target.value); }
  });
  inp?.addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  });

  refreshIcons(panel);
  return panel;
}

function syncButton() {
  document.getElementById('btn-tool-ai')?.classList.toggle('is-active', _open);
}

function open() {
  const panel = ensurePanel();
  panel.classList.remove('qrc-hidden');
  _open = true;
  syncButton();
  if (!_greeted) {
    appendMsg('assistant', renderMd('Hola, soy tu copiloto del Generador de QR. Puedo crear QR dinámicos, cambiar destinos sin reimprimir, fijar caducidad (máx. 15 días) y resumir estadísticas. ¿Qué necesitas?'));
    _greeted = true;
  }
  $('qrc-input')?.focus();
}

function close() {
  $(PANEL_ID)?.classList.add('qrc-hidden');
  _open = false;
  syncButton();
}

function toggle() { _open ? close() : open(); }

function onAiOpen(e) {
  // Suprime el aviso placeholder del header y abre/cierra nuestro panel.
  if (e?.preventDefault) e.preventDefault();
  toggle();
}

export const QRCopilot = {
  /** Registra el listener del botón IA (idempotente). */
  init() {
    if (_listener) return;
    _listener = onAiOpen;
    document.addEventListener('escale:tool-ai-open', _listener);
  },

  open,
  close,
  toggle,

  /** Quita el listener y el panel (al cerrar la herramienta). */
  destroy() {
    if (_listener) {
      document.removeEventListener('escale:tool-ai-open', _listener);
      _listener = null;
    }
    $(PANEL_ID)?.remove();
    _open = false;
    _messages = [];
    _greeted = false;
  }
};

export default QRCopilot;

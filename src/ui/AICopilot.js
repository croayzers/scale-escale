/* ─────────────────────────────────────────────────────────
   AI COPILOT — Widget de chat flotante con tool use
   Endpoint: /api/ai/chat  (Claude API proxy server-side)
   ───────────────────────────────────────────────────────── */

import { AppBridge } from '../core/AppBridge.js';
import { CATALOG_CATEGORIES } from '../schemas/CatalogCategories.js';
import { ServiceConfig } from '../services/ServiceConfig.js';

// ── Tool definitions (Claude tool_use schema) ────────────────────────────────
const TOOLS = [
  {
    name: 'open_catalog',
    description: 'Abre el catálogo de mobiliario en una categoría específica del dock inferior.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: CATALOG_CATEGORIES.map(c => c.key),
          description: 'Clave de la categoría a abrir'
        }
      }
    }
  },
  {
    name: 'open_menu',
    description: 'Abre un panel o menú de la barra de herramientas superior.',
    input_schema: {
      type: 'object',
      properties: {
        menu: {
          type: 'string',
          enum: ['zones','grid','settings','template','print','pro','company','inventory','layers','calibrate','upload'],
          description: 'Nombre del panel a abrir'
        }
      },
      required: ['menu']
    }
  },
  {
    name: 'highlight_element',
    description: 'Resalta con un borde verde animado un elemento de la interfaz para dirigir la atención del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        element_id: { type: 'string', description: 'ID del elemento HTML (sin #)' },
        duration_ms: { type: 'number', description: 'Duración del resaltado en ms (default 3500)' }
      },
      required: ['element_id']
    }
  },
  {
    name: 'show_hint',
    description: 'Muestra un mensaje flotante de ayuda en la parte inferior de la pantalla.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Texto del mensaje (puede incluir HTML básico)' },
        auto_hide_ms: { type: 'number', description: 'Ms hasta auto-ocultar. 0 = permanente. Default 6000.' }
      },
      required: ['message']
    }
  },
  {
    name: 'get_app_state',
    description: 'Obtiene el estado actual de la app: cámara, calibración, items en escena, menús abiertos, etc.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_scene_items',
    description: 'Lista todos los elementos colocados en la escena con su posición y categoría.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'close_catalog',
    description: 'Cierra el catálogo si está abierto.',
    input_schema: { type: 'object', properties: {} }
  }
];

// ── Execute a tool call from Claude ─────────────────────────────────────────
async function executeTool(name, input) {
  switch (name) {
    case 'open_catalog':      return AppBridge.openCatalog(input.category);
    case 'close_catalog':     return AppBridge.closeCatalog();
    case 'open_menu':         return AppBridge.openMenu(input.menu);
    case 'highlight_element': return AppBridge.highlight(input.element_id, input.duration_ms);
    case 'show_hint':         return AppBridge.showHint(input.message, input.auto_hide_ms);
    case 'get_app_state':     return AppBridge.getState();
    case 'get_scene_items':   return AppBridge.getItems();
    default:                  return { error: `Tool desconocida: ${name}` };
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystem() {
  const s = AppBridge.getState();
  const ui = AppBridge.getUIMap();
  const cats = ui.catalogCategories;

  return `Eres el asistente de E.Scale, una aplicación web profesional para diseñar y planificar eventos en 3D. Tu función es ayudar a los usuarios a usar la app, guiarles por el flujo de trabajo, y responder preguntas sobre mobiliario y montaje de eventos.

ESTADO ACTUAL:
- Vista: ${s.camera === 'iso' ? 'Isométrica 3D' : 'Cenital (plano)'}
- Plano: ${s.planLoaded ? 'cargado ✓' : 'sin cargar'}
- Calibración: ${s.calibrated ? 'completada ✓' : 'pendiente'}
- Elementos en escena: ${s.sceneItemCount}
- Catálogo: ${s.activeCatalogCategory ? `abierto en "${s.activeCatalogCategory}"` : 'cerrado'}

FLUJO DE TRABAJO (en orden):
1. Subir plano del local → botón #btn-upload-plan
2. Calibrar escala → #btn-calibrate → clic en 2 puntos de referencia conocida
3. Crear zonas operativas → #btn-zones-menu
4. Ajustar rejilla → #btn-grid-menu
5. Colocar elementos desde el dock inferior (catálogo por categorías)

CATEGORÍAS DE CATÁLOGO:
${cats.map(c => `- "${c.key}": ${c.label}${c.pro ? ' [PRO]' : ''}`).join('\n')}

BOTONES PRINCIPALES:
${Object.entries(ui.header).map(([id, desc]) => `- #${id}: ${desc}`).join('\n')}

REGLAS DE COMPORTAMIENTO:
- Cuando el usuario quiera hacer algo en la app, usa las tools para actuar directamente (no solo describir).
- Usa highlight_element ANTES de explicar qué hacer con un botón.
- Usa show_hint para mensajes breves de contexto visual.
- Si el usuario pregunta "¿cómo hago X?", guíale visualmente usando las tools.
- Responde siempre en español.
- Sé conciso y práctico. Máximo 3-4 líneas de texto a la vez.
- No inventes funciones que no existen en la app.`;
}

// ── State ────────────────────────────────────────────────────────────────────
let messages = [];
let isOpen = false;
let loading = false;

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const panel = () => $('ai-panel');
const input = () => $('ai-input');
const msgList = () => $('ai-messages');

function appendMsg(role, html, id) {
  const list = msgList();
  if (!list) return null;
  const div = document.createElement('div');
  div.className = `ai-msg ai-msg--${role}`;
  if (id) div.id = id;
  div.innerHTML = html;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
  return div;
}

function setLoading(on) {
  loading = on;
  const send = $('ai-send-btn');
  const inp = input();
  if (send) send.disabled = on;
  if (inp)  inp.disabled = on;
}

// ── Open / close ─────────────────────────────────────────────────────────────
function open() {
  isOpen = true;
  panel()?.classList.remove('ai-panel--hidden');
  input()?.focus();
  if (messages.length === 0) {
    appendMsg('assistant', renderMd('Hola 👋 Soy el asistente de **E.Scale**. Puedo guiarte por la app, abrir menús, o responder cualquier duda sobre el diseño de eventos. ¿En qué empezamos?'));
  }
}

function close() {
  isOpen = false;
  panel()?.classList.add('ai-panel--hidden');
}

function toggle() { isOpen ? close() : open(); }

// ── Send & process ────────────────────────────────────────────────────────────
async function send(text) {
  text = text.trim();
  if (!text || loading) return;

  const inp = input();
  if (inp) inp.value = '';

  appendMsg('user', esc(text));
  messages.push({ role: 'user', content: text });
  setLoading(true);

  const typingId = `ai-typing-${Date.now()}`;
  appendMsg('assistant', '<span class="ai-dots"><span></span><span></span><span></span></span>', typingId);

  try {
    await callAndProcess(typingId);
  } catch (err) {
    $(typingId)?.remove();
    appendMsg('assistant', `<span class="ai-error">Error: ${esc(err.message)}</span>`);
    console.error('[AICopilot]', err);
  } finally {
    setLoading(false);
  }
}

async function callAndProcess(removeBubbleId) {
  const endpoint = ServiceConfig.getUrl('aiChat') || '/api/ai/chat';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: buildSystem(),
      messages,
      tools: TOOLS,
    })
  });

  $(removeBubbleId)?.remove();

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  await processResponse(data);
}

async function processResponse(data) {
  const content = data.content ?? [];

  let textHtml = '';
  const toolUses = [];

  for (const block of content) {
    if (block.type === 'text' && block.text) textHtml += renderMd(block.text);
    if (block.type === 'tool_use') toolUses.push(block);
  }

  if (textHtml) {
    appendMsg('assistant', textHtml);
    messages.push({ role: 'assistant', content: data.content });
  }

  if (toolUses.length > 0) {
    if (!textHtml) messages.push({ role: 'assistant', content: data.content });

    const toolResults = [];
    for (const tool of toolUses) {
      const result = await executeTool(tool.name, tool.input ?? {});
      toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: JSON.stringify(result) });
    }

    messages.push({ role: 'user', content: toolResults });

    // Follow-up call to get the text response after tool execution
    const endpoint = ServiceConfig.getUrl('aiChat') || '/api/ai/chat';
    const followRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: buildSystem(), messages, tools: TOOLS })
    });

    if (followRes.ok) {
      const followData = await followRes.json();
      await processResponse(followData);
    }
  }
}

// ── Markdown → HTML (subset) ─────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  if (window.lucide) lucide.createIcons();

  $('ai-toggle-btn')?.addEventListener('click', toggle);
  $('ai-close-btn')?.addEventListener('click', close);

  $('ai-send-btn')?.addEventListener('click', () => send(input()?.value ?? ''));

  input()?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e.target.value); }
  });

  // Auto-resize textarea
  input()?.addEventListener('input', e => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  });
}

export const AICopilot = { init, open, close, toggle };

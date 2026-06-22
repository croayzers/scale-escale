// ============================================================================
// E-SCALE · lib/llm.js — Adaptadores de proveedor IA + fallback (server-side)
// ----------------------------------------------------------------------------
// Réplica EN CommonJS de la lógica de scale-shared/src/ia/llm.js, adaptada a:
//   - Ejecución server-side (Node): NO se usa el header
//     'anthropic-dangerous-direct-browser-access' (eso es solo para navegador).
//   - Tools en formato ANTHROPIC tal y como las manda el cliente (QRCopilot.js):
//     { name, description, input_schema }  donde input_schema ya es JSON Schema.
//     Para GPT/Gemini se traduce DESDE input_schema (no desde el formato neutro
//     {params} que usa P-Scale).
//   - Salida SIEMPRE normalizada a content blocks Anthropic
//     ([{type:'text',text}|{type:'tool_use',id,name,input}]) + stop_reason, para
//     que el bucle de tool_use de QRCopilot.js funcione sin cambios sea cual sea
//     el proveedor que respondió.
//
// Las API keys NO viven aquí ni en env vars: las pone cada empresa y se leen de
// public.companies.flags.ai (lo resuelve api/ai/qr-chat.js). Aquí solo se reciben.
// ============================================================================

const PROVEEDORES = [
  { id: 'claude', nombre: 'Claude', modelo: 'claude-opus-4-8' },
  { id: 'gpt',    nombre: 'GPT',    modelo: 'gpt-4o' },
  { id: 'gemini', nombre: 'Gemini', modelo: 'gemini-2.0-flash' }
];

const MODELO_DEFECTO = { claude: 'claude-opus-4-8', gpt: 'gpt-4o', gemini: 'gemini-2.0-flash' };
const MAX_TOKENS = 2048;

function modeloDe(id) {
  return MODELO_DEFECTO[id] || MODELO_DEFECTO.claude;
}

const safeParse = (s) => { try { return JSON.parse(s); } catch { return {}; } };

// input_schema (Anthropic, ya JSON Schema) → JSON Schema "limpio" para OpenAI/Gemini.
// Es prácticamente la identidad porque input_schema ya es JSON Schema, pero se
// garantiza la forma mínima { type:'object', properties, required }.
function inputSchemaAJsonSchema(input_schema) {
  const s = input_schema && typeof input_schema === 'object' ? input_schema : {};
  return {
    type: 'object',
    properties: s.properties && typeof s.properties === 'object' ? s.properties : {},
    required: Array.isArray(s.required) ? s.required : []
  };
}

// ── CLAUDE (Anthropic) ───────────────────────────────────────────────────────
// Devuelve la respuesta YA en shape Anthropic (content blocks + stop_reason).
async function llamarClaude({ apiKey, modelo, system, messages, tools }) {
  const body = {
    model: modelo || MODELO_DEFECTO.claude,
    max_tokens: MAX_TOKENS,
    messages: messages.map((m) => ({ role: m.role, content: m.content }))
  };
  if (system) body.system = system;
  if (Array.isArray(tools) && tools.length) {
    // Las tools ya llegan en formato Anthropic; se reenvían tal cual.
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema || inputSchemaAJsonSchema(t.input_schema)
    }));
  }

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
      // server-side: SIN 'anthropic-dangerous-direct-browser-access'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  return {
    content: Array.isArray(data.content) ? data.content : [],
    stop_reason: data.stop_reason || 'end_turn',
    model: data.model,
    usage: data.usage || null
  };
}

// ── GPT (OpenAI) ──────────────────────────────────────────────────────────────
// Recibe messages en formato Anthropic y los traduce a OpenAI; la salida se
// NORMALIZA de vuelta a content blocks Anthropic + stop_reason.
async function llamarGPT({ apiKey, modelo, system, messages, tools }) {
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) {
    if (typeof m.content === 'string') { msgs.push({ role: m.role, content: m.content }); continue; }
    for (const c of (m.content || [])) {
      if (c.type === 'text') msgs.push({ role: m.role, content: c.text });
      else if (c.type === 'tool_use') msgs.push({ role: 'assistant', content: null, tool_calls: [{ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input || {}) } }] });
      else if (c.type === 'tool_result') msgs.push({ role: 'tool', tool_call_id: c.tool_use_id, content: typeof c.content === 'string' ? c.content : JSON.stringify(c.content) });
    }
  }
  const body = {
    model: modelo || MODELO_DEFECTO.gpt,
    messages: msgs
  };
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: inputSchemaAJsonSchema(t.input_schema) } }));
  }

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`GPT ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const msg = data.choices?.[0]?.message || {};

  const content = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  for (const tc of (msg.tool_calls || [])) {
    content.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input: safeParse(tc.function?.arguments) });
  }
  const stop_reason = (msg.tool_calls && msg.tool_calls.length) ? 'tool_use' : 'end_turn';
  return { content, stop_reason, model: data.model, usage: data.usage || null };
}

// ── GEMINI (Google) ───────────────────────────────────────────────────────────
// Igual que GPT: traduce entrada Anthropic→Gemini y normaliza salida a Anthropic.
async function llamarGemini({ apiKey, modelo, system, messages, tools }) {
  const contents = [];
  for (const m of messages) {
    if (typeof m.content === 'string') { contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }); continue; }
    for (const c of (m.content || [])) {
      if (c.type === 'text') contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: c.text }] });
      else if (c.type === 'tool_use') contents.push({ role: 'model', parts: [{ functionCall: { name: c.name, args: c.input || {} } }] });
      else if (c.type === 'tool_result') contents.push({ role: 'user', parts: [{ functionResponse: { name: c.name || 'tool', response: { result: typeof c.content === 'string' ? c.content : c.content } } }] });
    }
  }
  const body = { contents };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (Array.isArray(tools) && tools.length) {
    body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: inputSchemaAJsonSchema(t.input_schema) })) }];
  }

  const mdl = modelo || MODELO_DEFECTO.gemini;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const parts = data.candidates?.[0]?.content?.parts || [];

  const content = [];
  let hasTool = false;
  for (const p of parts) {
    if (p.text) content.push({ type: 'text', text: p.text });
    else if (p.functionCall) {
      hasTool = true;
      content.push({ type: 'tool_use', id: 'g_' + Math.random().toString(36).slice(2), name: p.functionCall.name, input: p.functionCall.args || {} });
    }
  }
  return { content, stop_reason: hasTool ? 'tool_use' : 'end_turn', model: mdl, usage: data.usageMetadata || null };
}

// ── Router ────────────────────────────────────────────────────────────────────
async function llamarLLM(proveedorId, opts) {
  if (proveedorId === 'gpt') return llamarGPT(opts);
  if (proveedorId === 'gemini') return llamarGemini(opts);
  return llamarClaude(opts);
}

// ¿el error indica falta de tokens/saldo/cuota (no un fallo de red o de petición)?
function esErrorCuota(e) {
  const m = (e?.message || String(e || '')).toLowerCase();
  return /\b429\b|quota|insufficient|billing|credit|exhaust|saldo|limit reached|out of|rate limit|payment|balance/.test(m);
}

// Llama con FALLBACK automático: prueba el proveedor preferido y, si se queda sin
// tokens (cuota), pasa al siguiente del `orden` que tenga key, hasta agotar.
//   prefer  proveedor predeterminado de la empresa (ai.provider)
//   orden   preferencia de fallback (ai.orden); default ["claude","gpt","gemini"]
//   keys    { claude, gpt, gemini } (ai.keys)
// Devuelve { content, stop_reason, model, usage, proveedorUsado, cambioDesde }
// o lanza (con .sinConfig si no hay ninguna key, o el error propagado).
async function llamarConFallback({ prefer, orden, keys, system, messages, tools }) {
  const ordenFinal = Array.isArray(orden) && orden.length ? orden : ['claude', 'gpt', 'gemini'];
  const cadena = [prefer, ...ordenFinal.filter((p) => p !== prefer)]
    .filter((p, i, a) => p && a.indexOf(p) === i && keys?.[p]);

  if (!cadena.length) { const err = new Error('Sin ninguna IA configurada (faltan API keys).'); err.sinConfig = true; throw err; }

  let cambioDesde = null;
  for (let i = 0; i < cadena.length; i++) {
    const id = cadena[i];
    try {
      const r = await llamarLLM(id, { apiKey: keys[id], modelo: modeloDe(id), system, messages, tools });
      return { ...r, proveedorUsado: id, cambioDesde };
    } catch (e) {
      const ultimo = i === cadena.length - 1;
      if (esErrorCuota(e) && !ultimo) { cambioDesde = cambioDesde || prefer; continue; }
      e.proveedorUsado = id; e.cambioDesde = cambioDesde; throw e;
    }
  }
}

module.exports = {
  PROVEEDORES,
  MODELO_DEFECTO,
  modeloDe,
  llamarClaude,
  llamarGPT,
  llamarGemini,
  llamarLLM,
  esErrorCuota,
  llamarConFallback
};

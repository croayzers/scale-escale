// ============================================================================
// E-SCALE · POST /api/ai/qr-chat
// ----------------------------------------------------------------------------
// RELAY server-side de IA para el COPILOTO del Generador de QR. Es multi-empresa,
// multi-proveedor y con FALLBACK, igual que el resto de la suite SCALE:
//
//   - Las API keys NO son una env var global. Las pone CADA empresa y viven en
//     public.companies.flags.ai = { provider, keys:{claude,gpt,gemini}, orden }.
//     Este endpoint resuelve la empresa del usuario (Bearer token) y usa ESAS keys.
//   - Es un RELAY de un solo turno: recibe { system, messages, tools } y devuelve
//     la respuesta en formato content blocks Anthropic ({ content[], stop_reason }).
//     El BUCLE de tool_use lo ejecuta el cliente (QRCopilot.js), porque las tools
//     llaman a /api/qr/* con el Bearer token del usuario (vive en el navegador).
//   - Las tools llegan del cliente YA en formato Anthropic { name, description,
//     input_schema }. Para gpt/gemini, lib/llm.js traduce desde input_schema y
//     normaliza la salida de vuelta a content blocks Anthropic, de modo que el
//     bucle del cliente funciona con CUALQUIER proveedor sin cambios.
//   - Modelo por defecto al usar Claude: claude-opus-4-8 (ver lib/llm.js).
//
// Casos suaves (siempre 200 con { ok:false, reason } para que el cliente lo
// muestre sin romper):
//   - no_messages         falta historial
//   - not_authenticated   sin Bearer válido (no se puede resolver la empresa)
//   - ai_not_configured   la empresa no tiene NINGUNA API key en flags.ai.keys
//   - <mensaje cuota/HTTP> error de cuota o de la API del proveedor
//
// NO usa ninguna env var de IA (ANTHROPIC_API_KEY, etc.): eliminado a propósito.
// ============================================================================

const { json, methodNotAllowed, readJsonBody, serverError } = require('../../lib/http');
const { getAuthUser, listUserMemberships } = require('../../lib/supabase');
const { llamarConFallback } = require('../../lib/llm');

function readBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(req, res, ['POST']);

  try {
    const body = await readJsonBody(req);
    const system = typeof body.system === 'string' ? body.system : '';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const tools = Array.isArray(body.tools) ? body.tools : [];

    if (!messages.length) {
      return json(res, 200, { ok: false, reason: 'no_messages' });
    }

    // 1) Autenticación: sin Bearer válido no podemos resolver la empresa → sus keys.
    const accessToken = readBearerToken(req);
    const user = accessToken ? await getAuthUser(accessToken) : null;
    if (!user?.id) {
      return json(res, 200, { ok: false, reason: 'not_authenticated' });
    }

    // 2) Empresa del usuario → flags.ai. Tomamos la primera membresía (mismo
    //    criterio simple que el resto de la app; listUserMemberships ya devuelve
    //    organization con flags normalizados vía companyToOrg).
    const memberships = await listUserMemberships(user.id);
    const org = memberships?.[0]?.organization || null;
    const ai = (org?.flags && typeof org.flags.ai === 'object') ? org.flags.ai : null;

    const keys = (ai && typeof ai.keys === 'object') ? ai.keys : {};
    const hayAlgunaKey = Boolean(keys.claude || keys.gpt || keys.gemini);
    if (!ai || !hayAlgunaKey) {
      return json(res, 200, { ok: false, reason: 'ai_not_configured' });
    }

    // 3) Llamada con fallback (preferido → siguiente con key si hay error de cuota).
    let result;
    try {
      result = await llamarConFallback({
        prefer: ai.provider || 'claude',
        orden: ai.orden,
        keys,
        system,
        messages,
        tools
      });
    } catch (e) {
      if (e?.sinConfig) return json(res, 200, { ok: false, reason: 'ai_not_configured' });
      // Cuota agotada o error de la API del proveedor → 200 suave con motivo legible.
      return json(res, 200, { ok: false, reason: e?.message || 'IA no disponible.' });
    }

    // 4) Respuesta en el MISMO shape que consume QRCopilot.js (content blocks
    //    Anthropic + stop_reason). Se añade proveedorUsado/cambioDesde por si el
    //    cliente quiere avisar de un cambio de proveedor (opcional, no rompe).
    return json(res, 200, {
      ok: true,
      model: result.model || null,
      content: result.content || [],
      stop_reason: result.stop_reason || 'end_turn',
      usage: result.usage || null,
      proveedorUsado: result.proveedorUsado || null,
      cambioDesde: result.cambioDesde || null
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ============================================================================
// E-SCALE · Redirector serverless de QR dinamicos · GET /q/:code
// ----------------------------------------------------------------------------
// Al escanear un QR dinamico la URL es https://events.thescaleapps.com/q/<code>.
// Esta ruta:
//   a) busca el QR por code (service-role, schema escale, bypassa RLS)
//   b) valida existencia / is_active / expires_at
//   c) registra un escaneo DETALLADO en escale.qr_scan_events (no bloqueante)
//   d) incrementa scan_count + last_scan_at
//   e) redirige (302) a target_url, o renderiza el payload no-URL, o muestra
//      una pagina HTML simple (no encontrado / desactivado / caducado).
//
// El que escanea es anonimo (sin sesion). La IP NUNCA se guarda en claro:
// se persiste sha256(ip + QR_IP_SALT) en hex (ver hashIp()).
// ============================================================================

const crypto = require('crypto');
const { env } = require('../../lib/env');
const { escaleRest } = require('../../lib/supabase');

const CODE_RE = /^[A-Za-z0-9_-]{4,40}$/;

// ── Pagina HTML generica (estados terminales: no encontrado, desactivado, ...) ──
function renderPage(res, statusCode, title, message) {
  const safeTitle = String(title || 'QR').replace(/[<>&]/g, '');
  const safeMessage = String(message || '').replace(/[<>&]/g, '');
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${safeTitle} · E-Scale</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0f172a; color: #e2e8f0; padding: 24px;
  }
  .card {
    max-width: 420px; width: 100%; text-align: center;
    background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 40px 28px;
    box-shadow: 0 20px 60px rgba(0,0,0,.4);
  }
  .icon { font-size: 48px; line-height: 1; margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0 0 10px; font-weight: 700; }
  p { margin: 0; font-size: 15px; line-height: 1.5; color: #94a3b8; }
  .brand { margin-top: 28px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <div class="brand">E-Scale · thescaleapps.com</div>
  </div>
</body>
</html>`;
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
}

// ── ip_hash: NUNCA guardar IP en claro. sha256(ip + salt) -> hex ─────────────
// Documentado: el salt viene de env('QR_IP_SALT','escale'). Si no hay IP -> null.
function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || String(req.headers['x-real-ip'] || '').trim() || '';
}

function hashIp(req) {
  const ip = clientIp(req);
  if (!ip) return null;
  const salt = env('QR_IP_SALT', 'escale');
  return crypto.createHash('sha256').update(`${ip}${salt}`).digest('hex');
}

// ── Heuristica simple de user-agent (sin dependencias npm) ───────────────────
function detectDeviceType(ua) {
  const s = String(ua || '').toLowerCase();
  if (/ipad|tablet|(android(?!.*mobile))|kindle|silk|playbook/.test(s)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(s)) return 'mobile';
  return 'desktop';
}

function detectOs(ua) {
  const s = String(ua || '');
  if (/Windows NT|Windows Phone|Win64|WOW64/i.test(s)) return 'Windows';
  if (/Android/i.test(s)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(s)) return 'iOS';
  if (/Mac OS X|Macintosh/i.test(s)) return 'macOS';
  if (/CrOS/i.test(s)) return 'ChromeOS';
  if (/Linux/i.test(s)) return 'Linux';
  return null;
}

function detectBrowser(ua) {
  const s = String(ua || '');
  // Orden importa: Edge/Opera se identifican como Chrome; Chrome como Safari.
  if (/Edg(e|A|iOS)?\//i.test(s)) return 'Edge';
  if (/OPR\/|Opera/i.test(s)) return 'Opera';
  if (/Firefox\/|FxiOS\//i.test(s)) return 'Firefox';
  if (/Chrome\/|CriOS\//i.test(s)) return 'Chrome';
  if (/Safari\//i.test(s)) return 'Safari';
  return null;
}

function firstLang(req) {
  const al = String(req.headers['accept-language'] || '').split(',')[0].trim();
  return al ? al.slice(0, 35) : null;
}

// ── Origen fisico del escaneo (?src=) ────────────────────────────────────────
// Lo añade quien genera el QR poniendo ?src=<origen> al final del enlace corto
// (lo hace la UI: p.ej. /q/abc123?src=entrada). NO afecta a la redirección: el
// QR redirige a su target_url normal. Saneado: string, trim, minúsculas, máx 40.
function scanSrc(req) {
  let raw = req.query?.src;
  if (raw == null) {
    // Fallback: parsear el query string de la URL cruda si Vercel no lo inyectó.
    const qs = String(req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(qs);
    raw = params.get('src');
  }
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().slice(0, 40);
  return s || null;
}

// ── Registro de escaneo (no bloqueante) ──────────────────────────────────────
async function recordScan(qr, req) {
  const ua = String(req.headers['user-agent'] || '') || null;
  const event = {
    qr_id: qr.id,
    ip_hash: hashIp(req),
    country: req.headers['x-vercel-ip-country'] || null,
    city: req.headers['x-vercel-ip-city']
      ? decodeURIComponent(String(req.headers['x-vercel-ip-city']))
      : null,
    user_agent: ua,
    device_type: detectDeviceType(ua),
    os: detectOs(ua),
    browser: detectBrowser(ua),
    referrer: req.headers['referer'] || req.headers['referrer'] || null,
    lang: firstLang(req),
    src: scanSrc(req)
  };
  await escaleRest('qr_scan_events', { method: 'POST', body: event });
}

// ── Incremento de contador (leido+1; ver MEJORA mas abajo) ────────────────────
async function bumpCounter(qr) {
  // MEJORA: idealmente un RPC atomico (escale.qr_increment_scan(code)) para
  // evitar la carrera leido+1 bajo escaneos concurrentes. Aceptable en v1.
  await escaleRest('qr_codes', {
    method: 'PATCH',
    query: `?id=eq.${encodeURIComponent(qr.id)}`,
    body: {
      scan_count: (Number(qr.scan_count) || 0) + 1,
      last_scan_at: new Date().toISOString()
    }
  });
}

// ── Render de contenido no-URL (estatico/dinamico sin target_url) ─────────────
function renderPayload(res, qr) {
  const payload = qr.payload && typeof qr.payload === 'object' ? qr.payload : {};

  // vCard descargable
  if (qr.type === 'vcard') {
    const vcard = String(payload.vcard || payload.raw || '').trim();
    if (vcard) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="contacto.vcf"');
      res.setHeader('Cache-Control', 'no-store');
      res.end(vcard);
      return;
    }
  }

  // WiFi: mostrar datos en una pagina simple
  if (qr.type === 'wifi') {
    const ssid = String(payload.ssid || '').replace(/[<>&]/g, '');
    const pass = String(payload.password || payload.pass || '').replace(/[<>&]/g, '');
    const enc = String(payload.encryption || payload.security || 'WPA').replace(/[<>&]/g, '');
    return renderPage(
      res, 200, 'Red WiFi',
      `Red: ${ssid || '(sin nombre)'} · Seguridad: ${enc}${pass ? ` · Clave: ${pass}` : ''}`
    );
  }

  // Texto plano u otros: mostrar contenido tal cual
  const text = String(payload.text || payload.content || qr.title || '').trim();
  return renderPage(res, 200, qr.title || 'Contenido del QR', text || 'Este QR no tiene un destino configurado.');
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Method Not Allowed');
    return;
  }

  // Param dinamico: Vercel inyecta el nombre del fichero [code] en req.query.code.
  const code = String(
    req.query?.code || req.url?.split('?')[0]?.split('/').pop() || ''
  ).trim();

  // Seguridad: validar formato antes de tocar la base de datos.
  if (!CODE_RE.test(code)) {
    return renderPage(res, 404, 'QR no encontrado', 'El enlace escaneado no es valido.');
  }

  let qr = null;
  try {
    const rows = await escaleRest('qr_codes', {
      query: `?code=eq.${encodeURIComponent(code)}&select=id,kind,type,target_url,payload,is_active,expires_at,scan_count&limit=1`
    });
    qr = Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (error) {
    console.error('[q/:code] lookup failed', error?.message);
    return renderPage(res, 500, 'Algo ha fallado', 'No hemos podido procesar este QR. Intentalo de nuevo.');
  }

  // b) Validaciones
  if (!qr) {
    return renderPage(res, 404, 'QR no encontrado', 'Este codigo QR no existe o ha sido eliminado.');
  }
  if (qr.is_active === false) {
    return renderPage(res, 410, 'QR desactivado', 'Este QR esta desactivado por su propietario.');
  }
  if (qr.expires_at && new Date(qr.expires_at).getTime() < Date.now()) {
    return renderPage(res, 410, 'QR caducado', 'Este QR ha caducado y ya no esta disponible.');
  }

  // c+d) Registrar escaneo + incrementar contador SIN bloquear la redireccion.
  try {
    await recordScan(qr, req);
  } catch (error) {
    console.error('[q/:code] recordScan failed (non-blocking)', error?.message);
  }
  try {
    await bumpCounter(qr);
  } catch (error) {
    console.error('[q/:code] bumpCounter failed (non-blocking)', error?.message);
  }

  // e) Redirigir o renderizar
  const target = String(qr.target_url || '').trim();
  if (target) {
    res.statusCode = 302;
    res.setHeader('Location', target);
    res.setHeader('Cache-Control', 'no-store');
    res.end();
    return;
  }

  // Sin target_url: contenido no-web embebido en payload.
  return renderPayload(res, qr);
};

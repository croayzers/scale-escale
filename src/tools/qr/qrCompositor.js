// qrCompositor.js — Compone QR + fondo + marco (SVG) + logos en un canvas/SVG.
//
// El "lienzo lógico" mide VIEWBOX × VIEWBOX (1000×1000). La plantilla define:
//   - qrWindow { x, y, size }: dónde y de qué tamaño va el módulo QR.
//   - logoSlot { x, y, w, h }: zona superior reservada al logo de empresa (opc).
// Aquí escalamos todo a un tamaño real (preview ~288, export ~1024).
//
// Dos salidas:
//   - composeToCanvas(...)  → dibuja en un canvas (preview o export PNG).
//   - composeToSVG(...)     → genera un SVG completo (export vectorial) con el
//     marco vectorial + el QR como SVG embebido + fondo y logos como <image>.

import { VIEWBOX, getTemplate, renderTemplateSVG } from './qrTemplates.js';

// Fracción del lado del QR que ocupa el logo central (legibilidad + ECC=H).
const CENTER_LOGO_RATIO = 0.22;

/** Carga una imagen (URL o data URL) como HTMLImageElement. */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    // Permite exportar logos servidos por CDN sin "tainted canvas" si el server
    // manda CORS; si falla, igualmente seguimos sin romper el preview.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // no abortamos la composición por un logo
    img.src = src;
  });
}

/** Convierte un fragmento SVG (sin <svg>) en una <img> rasterizable. */
function svgFragmentToImage(innerSVG, size) {
  const full = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">${innerSVG}</svg>`;
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(full);
  return loadImage(url);
}

/**
 * Pinta la composición completa en un canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 *   - qrCanvas: HTMLCanvasElement con el QR ya pintado (módulo pelado).
 *   - templateId: id de plantilla.
 *   - partsState: estado de partes { [id]: { on, stroke, fill } }.
 *   - bgColor: color de fondo del lienzo.
 *   - bgImage: HTMLImageElement|null para fondo (se dibuja con overlay).
 *   - topLogo: HTMLImageElement|null (logo de empresa arriba).
 *   - centerLogo: HTMLImageElement|null (logo dentro del QR).
 *   - size: lado del canvas en px (preview o export).
 */
export async function composeToCanvas(canvas, opts = {}) {
  const {
    qrCanvas, templateId = 'none', partsState = {},
    bgColor = '#ffffff', bgImage = null,
    topLogo = null, centerLogo = null,
    size = 1024,
  } = opts;

  const tpl = getTemplate(templateId);
  const ctx = canvas.getContext('2d');
  canvas.width = size;
  canvas.height = size;
  const scale = size / VIEWBOX;

  // 1) Fondo de color (siempre).
  ctx.fillStyle = bgColor || '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // 2) Imagen de fondo (cover) + overlay claro para no matar el contraste del QR.
  if (bgImage) {
    drawCover(ctx, bgImage, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(0, 0, size, size);
  }

  // 3) Marco vectorial (todas las partes activas), rasterizado desde SVG.
  const frameSVG = renderTemplateSVG(tpl, partsState);
  if (frameSVG) {
    const frameImg = await svgFragmentToImage(frameSVG, size);
    if (frameImg) ctx.drawImage(frameImg, 0, 0, size, size);
  }

  // 4) Logo de empresa ARRIBA (dentro del logoSlot de la plantilla).
  if (topLogo && tpl.logoSlot) {
    const s = tpl.logoSlot;
    drawContain(ctx, topLogo, s.x * scale, s.y * scale, s.w * scale, s.h * scale);
  }

  // 5) QR dentro de qrWindow. Fondo blanco bajo el QR para asegurar quiet zone.
  const w = tpl.qrWindow;
  const qx = w.x * scale, qy = w.y * scale, qs = w.size * scale;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qx, qy, qs, qs);
  if (qrCanvas) {
    ctx.imageSmoothingEnabled = false; // QR nítido (sin antialias en los módulos)
    ctx.drawImage(qrCanvas, qx, qy, qs, qs);
  }

  // 6) Logo central del QR sobre recuadro/círculo blanco (legibilidad).
  if (centerLogo) {
    const ls = qs * CENTER_LOGO_RATIO;
    const lx = qx + (qs - ls) / 2;
    const ly = qy + (qs - ls) / 2;
    const pad = ls * 0.14;
    // Recuadro blanco redondeado de respaldo.
    roundRect(ctx, lx - pad, ly - pad, ls + pad * 2, ls + pad * 2, ls * 0.18);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    drawContain(ctx, centerLogo, lx, ly, ls, ls);
  }

  return canvas;
}

/**
 * Genera el SVG completo de la composición (export vectorial).
 * @param {object} opts
 *   - qrSVGInner: contenido del <svg> del QR (de QRCode.toString type:'svg'),
 *     ya SIN su etiqueta <svg> envolvente, o el SVG completo (lo normalizamos).
 *   - resto: igual que composeToCanvas pero con data URLs en vez de <img>.
 *     bgImageUrl, topLogoUrl, centerLogoUrl son strings (data URL o URL).
 */
export function composeToSVG(opts = {}) {
  const {
    qrSVG = '', templateId = 'none', partsState = {},
    bgColor = '#ffffff', bgImageUrl = '',
    topLogoUrl = '', centerLogoUrl = '',
  } = opts;

  const tpl = getTemplate(templateId);
  const V = VIEWBOX;
  const w = tpl.qrWindow;
  const parts = [];

  // 1) Fondo de color.
  parts.push(`<rect x="0" y="0" width="${V}" height="${V}" fill="${bgColor}"/>`);

  // 2) Imagen de fondo + overlay.
  if (bgImageUrl) {
    parts.push(`<image x="0" y="0" width="${V}" height="${V}" preserveAspectRatio="xMidYMid slice" href="${bgImageUrl}"/>`);
    parts.push(`<rect x="0" y="0" width="${V}" height="${V}" fill="#ffffff" fill-opacity="0.55"/>`);
  }

  // 3) Marco vectorial.
  const frameSVG = renderTemplateSVG(tpl, partsState);
  if (frameSVG) parts.push(frameSVG);

  // 4) Logo de empresa arriba.
  if (topLogoUrl && tpl.logoSlot) {
    const s = tpl.logoSlot;
    parts.push(`<image x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" preserveAspectRatio="xMidYMid meet" href="${topLogoUrl}"/>`);
  }

  // 5) QR: fondo blanco + el SVG del QR embebido en qrWindow.
  parts.push(`<rect x="${w.x}" y="${w.y}" width="${w.size}" height="${w.size}" fill="#ffffff"/>`);
  const qrInner = extractSVGInner(qrSVG);
  const qrViewBox = extractViewBox(qrSVG) || '0 0 100 100';
  parts.push(
    `<svg x="${w.x}" y="${w.y}" width="${w.size}" height="${w.size}" viewBox="${qrViewBox}" preserveAspectRatio="xMidYMid meet">${qrInner}</svg>`
  );

  // 6) Logo central.
  if (centerLogoUrl) {
    const ls = w.size * CENTER_LOGO_RATIO;
    const lx = w.x + (w.size - ls) / 2;
    const ly = w.y + (w.size - ls) / 2;
    const pad = ls * 0.14;
    parts.push(`<rect x="${lx - pad}" y="${ly - pad}" width="${ls + pad * 2}" height="${ls + pad * 2}" rx="${ls * 0.18}" fill="#ffffff"/>`);
    parts.push(`<image x="${lx}" y="${ly}" width="${ls}" height="${ls}" preserveAspectRatio="xMidYMid meet" href="${centerLogoUrl}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${V}" height="${V}" viewBox="0 0 ${V} ${V}">${parts.join('\n')}</svg>`;
}

// ── Helpers de dibujo ─────────────────────────────────────────────────────────

// Dibuja la imagen cubriendo el área (cover), recortando lo que sobre.
function drawCover(ctx, img, w, h) {
  const ir = img.width / img.height;
  const cr = w / h;
  let dw, dh, dx, dy;
  if (ir > cr) { dh = h; dw = h * ir; dx = (w - dw) / 2; dy = 0; }
  else { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}

// Dibuja la imagen dentro del área (contain), centrada, sin deformar.
function drawContain(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const ar = w / h;
  let dw, dh;
  if (ir > ar) { dw = w; dh = w / ir; }
  else { dh = h; dw = h * ir; }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Extrae el contenido interior de un <svg>…</svg> (lo que node-qrcode devuelve).
function extractSVGInner(svg) {
  const m = String(svg || '').match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  return m ? m[1] : '';
}
function extractViewBox(svg) {
  const m = String(svg || '').match(/viewBox="([^"]+)"/i);
  return m ? m[1] : '';
}

// Exponemos helpers y carga de imágenes por si la UI los necesita.
export { loadImage, CENTER_LOGO_RATIO };

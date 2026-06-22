// qrTemplates.js — Catálogo de MARCOS/PLANTILLAS SVG MODULARES para el QR.
//
// Filosofía pedida por el usuario:
//   - Cada plantilla se compone de PARTES independientes (corners, frameBox,
//     scanLabel, phoneBody, arrow, badge…). El usuario activa/desactiva cada
//     parte por separado y personaliza su color de borde (stroke) y relleno
//     (fill) de forma independiente.
//   - Todo es SVG vectorial generado por código (paths/rects/text), NUNCA PNG.
//     Así es nítido a cualquier tamaño y recoloreable.
//
// CONTRATO DE COORDENADAS
//   Todas las partes se dibujan en un lienzo virtual de VIEWBOX × VIEWBOX
//   (1000×1000). La "ventana" central donde va el QR la define cada plantilla
//   con `qrWindow = { x, y, size }` (en esas mismas unidades). El compositor
//   (qrCompositor.js) escala ese viewBox al tamaño real de export/preview y
//   coloca el QR dentro de qrWindow. La zona superior reservada para el logo de
//   empresa la define `logoSlot = { x, y, w, h }` (opcional por plantilla).
//
// CADA PARTE expone:
//   { id, label, defaultOn, stroke (color por defecto|null), fill (color|null),
//     render(p) -> string SVG }   donde p = { stroke, fill } (colores actuales).
//   Si una parte no usa stroke o fill, su valor por defecto es null y NO se
//   muestra el control de color correspondiente.

export const VIEWBOX = 1000;

// Helper: escapar texto para incrustar en SVG.
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Plantilla "none" (solo QR, sin marco) ─────────────────────────────────────
// La ventana ocupa casi todo el lienzo con un margen mínimo.
const tplNone = {
  id: 'none',
  label: 'Sin plantilla',
  icon: 'square',
  qrWindow: { x: 60, y: 60, size: 880 },
  logoSlot: null,
  parts: [],
};

// ── Plantilla "corners" — esquinas tipo corchete + etiqueta SCAN HERE ─────────
const tplCorners = {
  id: 'corners',
  label: 'Esquinas',
  icon: 'scan',
  qrWindow: { x: 200, y: 160, size: 600 },
  logoSlot: { x: 350, y: 40, w: 300, h: 90 },
  parts: [
    {
      id: 'corners',
      label: 'Esquinas',
      defaultOn: true,
      stroke: '#0a0a0b',
      fill: null,
      render: ({ stroke }) => {
        const len = 130, sw = 22, r = 28;
        const x0 = 150, y0 = 150, x1 = 850, y1 = 850;
        const s = `stroke="${stroke}" stroke-width="${sw}" fill="none" stroke-linecap="round"`;
        return `
          <path d="M${x0} ${y0 + len} L${x0} ${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} L${x0 + len} ${y0}" ${s}/>
          <path d="M${x1 - len} ${y0} L${x1 - r} ${y0} Q${x1} ${y0} ${x1} ${y0 + r} L${x1} ${y0 + len}" ${s}/>
          <path d="M${x1} ${y1 - len} L${x1} ${y1 - r} Q${x1} ${y1} ${x1 - r} ${y1} L${x1 - len} ${y1}" ${s}/>
          <path d="M${x0 + len} ${y1} L${x0 + r} ${y1} Q${x0} ${y1} ${x0} ${y1 - r} L${x0} ${y1 - len}" ${s}/>`;
      },
    },
    {
      id: 'scanLabel',
      label: 'Etiqueta "SCAN ME"',
      defaultOn: true,
      stroke: null,
      fill: '#0a0a0b',
      render: ({ fill }) => `
        <rect x="350" y="888" width="300" height="74" rx="37" fill="${fill}"/>
        <text x="500" y="936" text-anchor="middle"
          font-family="'Inter Tight', system-ui, sans-serif" font-size="40"
          font-weight="700" letter-spacing="2" fill="#ffffff">SCAN ME</text>`,
    },
  ],
};

// ── Plantilla "frameBox" — marco completo redondeado + barra inferior ─────────
const tplFrame = {
  id: 'frame',
  label: 'Marco',
  icon: 'square-dashed',
  qrWindow: { x: 210, y: 175, size: 580 },
  logoSlot: { x: 320, y: 55, w: 360, h: 95 },
  parts: [
    {
      id: 'frameBox',
      label: 'Marco exterior',
      defaultOn: true,
      stroke: '#0a0a0b',
      fill: '#ffffff',
      render: ({ stroke, fill }) => `
        <rect x="60" y="60" width="880" height="880" rx="60"
          fill="${fill}" stroke="${stroke}" stroke-width="18"/>`,
    },
    {
      id: 'scanBar',
      label: 'Barra "SCAN HERE"',
      defaultOn: true,
      stroke: null,
      fill: '#0a0a0b',
      render: ({ fill }) => `
        <path d="M60 820 L940 820 L940 880 Q940 940 880 940 L120 940 Q60 940 60 880 Z" fill="${fill}"/>
        <text x="500" y="908" text-anchor="middle"
          font-family="'Inter Tight', system-ui, sans-serif" font-size="46"
          font-weight="700" letter-spacing="3" fill="#ffffff">SCAN HERE</text>`,
    },
  ],
};

// ── Plantilla "phone" — silueta de smartphone con el QR en pantalla ───────────
const tplPhone = {
  id: 'phone',
  label: 'Móvil',
  icon: 'smartphone',
  qrWindow: { x: 290, y: 230, size: 420 },
  logoSlot: { x: 360, y: 110, w: 280, h: 70 },
  parts: [
    {
      id: 'phoneBody',
      label: 'Cuerpo del móvil',
      defaultOn: true,
      stroke: '#0a0a0b',
      fill: '#ffffff',
      render: ({ stroke, fill }) => `
        <rect x="240" y="60" width="520" height="880" rx="80"
          fill="${fill}" stroke="${stroke}" stroke-width="20"/>
        <rect x="430" y="95" width="140" height="22" rx="11" fill="${stroke}"/>
        <circle cx="500" cy="888" r="26" fill="none" stroke="${stroke}" stroke-width="10"/>`,
    },
    {
      id: 'scanLabel',
      label: 'Texto "SCAN HERE"',
      defaultOn: true,
      stroke: null,
      fill: '#0a0a0b',
      render: ({ fill }) => `
        <text x="500" y="730" text-anchor="middle"
          font-family="'Inter Tight', system-ui, sans-serif" font-size="42"
          font-weight="700" letter-spacing="2" fill="${fill}">SCAN HERE</text>`,
    },
  ],
};

// ── Plantilla "arrow" — flecha apuntando al QR + SCAN HERE ─────────────────────
const tplArrow = {
  id: 'arrow',
  label: 'Flecha',
  icon: 'arrow-down',
  qrWindow: { x: 230, y: 240, size: 540 },
  logoSlot: { x: 340, y: 60, w: 320, h: 80 },
  parts: [
    {
      id: 'scanLabel',
      label: 'Texto "SCAN HERE"',
      defaultOn: true,
      stroke: null,
      fill: '#0a0a0b',
      render: ({ fill }) => `
        <text x="350" y="195" text-anchor="middle"
          font-family="'Inter Tight', system-ui, sans-serif" font-size="58"
          font-weight="800" letter-spacing="1" fill="${fill}">SCAN</text>
        <text x="380" y="255" text-anchor="middle"
          font-family="'Inter Tight', system-ui, sans-serif" font-size="58"
          font-weight="800" letter-spacing="1" fill="${fill}">HERE</text>`,
    },
    {
      id: 'arrow',
      label: 'Flecha',
      defaultOn: true,
      stroke: null,
      fill: '#0a0a0b',
      render: ({ fill }) => `
        <path d="M560 150
          Q700 170 720 320
          L770 300 L740 420 L630 360 L685 340
          Q670 240 555 215 Z" fill="${fill}"/>`,
    },
    {
      id: 'frameBox',
      label: 'Recuadro del QR',
      defaultOn: true,
      stroke: '#0a0a0b',
      fill: null,
      render: ({ stroke }) => `
        <rect x="200" y="210" width="600" height="600" rx="40"
          fill="none" stroke="${stroke}" stroke-width="14"/>`,
    },
  ],
};

// ── Plantilla "badge" — insignia circular con anillo y SCAN ───────────────────
const tplBadge = {
  id: 'badge',
  label: 'Insignia',
  icon: 'badge-check',
  qrWindow: { x: 290, y: 290, size: 420 },
  logoSlot: { x: 370, y: 150, w: 260, h: 60 },
  parts: [
    {
      id: 'ring',
      label: 'Anillo',
      defaultOn: true,
      stroke: '#0a0a0b',
      fill: '#ffffff',
      render: ({ stroke, fill }) => `
        <circle cx="500" cy="500" r="450" fill="${fill}" stroke="${stroke}" stroke-width="20"/>
        <circle cx="500" cy="500" r="318" fill="none" stroke="${stroke}" stroke-width="8"/>`,
    },
    {
      id: 'scanLabel',
      label: 'Texto inferior',
      defaultOn: true,
      stroke: null,
      fill: '#0a0a0b',
      render: ({ fill }) => `
        <text x="500" y="855" text-anchor="middle"
          font-family="'Inter Tight', system-ui, sans-serif" font-size="50"
          font-weight="700" letter-spacing="6" fill="${fill}">SCAN ME</text>`,
    },
  ],
};

// Catálogo ordenado (el primero es el seleccionado por defecto).
export const QR_TEMPLATES = [tplNone, tplCorners, tplFrame, tplPhone, tplArrow, tplBadge];

/** Busca una plantilla por id (cae a "none" si no existe). */
export function getTemplate(id) {
  return QR_TEMPLATES.find((t) => t.id === id) || tplNone;
}

/**
 * Construye el estado inicial de partes para una plantilla:
 * { [partId]: { on, stroke, fill } } usando los valores por defecto del catálogo.
 */
export function defaultPartsState(tpl) {
  const out = {};
  (tpl.parts || []).forEach((part) => {
    out[part.id] = {
      on: part.defaultOn !== false,
      stroke: part.stroke || null,
      fill: part.fill || null,
    };
  });
  return out;
}

/**
 * Genera el SVG (string, sin la etiqueta <svg> envolvente) de TODAS las partes
 * activas de la plantilla, con los colores actuales del estado.
 * @param {object} tpl       plantilla del catálogo
 * @param {object} partsState  { [partId]: { on, stroke, fill } }
 */
export function renderTemplateSVG(tpl, partsState) {
  if (!tpl || !tpl.parts) return '';
  return tpl.parts
    .filter((part) => {
      const st = partsState?.[part.id];
      return st ? st.on : part.defaultOn !== false;
    })
    .map((part) => {
      const st = partsState?.[part.id] || {};
      const stroke = st.stroke || part.stroke || '#0a0a0b';
      const fill = st.fill || part.fill || '#0a0a0b';
      try { return part.render({ stroke, fill }); }
      catch { return ''; }
    })
    .join('\n');
}

export { esc as escSvgText };

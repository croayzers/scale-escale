/* ─────────────────────────────────────────────────────────
   EXPORT MANAGER — Exportación a PDF (3D / Plano cenital)
   ────────────────────────────────────────────────────────
   · 3D:    captura cámara actual, A4 apaisado.
   · Plano: cambia a cenital, overlay para seleccionar área,
            recorta y exporta con cabecera + inventario.
   ───────────────────────────────────────────────────────── */

import { AppState }     from '../core/AppState.js';
import { SceneManager } from '../scene/SceneManager.js';
import { UIManager }    from '../ui/UIManager.js';

let areaSelecting = false;
let areaStart = null;
let areaEnd = null;

function init() {
  document.getElementById('btn-export')?.addEventListener('click', openModal);
  document.getElementById('export-cancel')?.addEventListener('click', closeModal);
  document.getElementById('export-choice-3d')?.addEventListener('click', export3D);
  document.getElementById('export-choice-plano')?.addEventListener('click', startPlanoSelection);

  const overlay = document.getElementById('area-overlay');
  if (overlay) {
    overlay.addEventListener('pointerdown', onAreaStart);
    overlay.addEventListener('pointermove', onAreaMove);
    overlay.addEventListener('pointerup',   onAreaEnd);
  }
  document.getElementById('area-cancel')?.addEventListener('click', cancelArea);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) cancelArea();
  });
}

function openModal()  { document.getElementById('export-modal')?.classList.add('visible'); }
function closeModal() { document.getElementById('export-modal')?.classList.remove('visible'); }

function export3D() {
  closeModal();
  SceneManager.renderer.render(SceneManager.scene, SceneManager.activeCam);
  requestAnimationFrame(() => {
    const src = SceneManager.renderer.domElement;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#f5f3ee';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);

    const dataURL = out.toDataURL('image/png');
    buildPDF(dataURL, '3D · Vista isométrica');
  });
}

function startPlanoSelection() {
  closeModal();
  SceneManager.setCamera('top');
  document.getElementById('cam-top')?.classList.add('active');
  document.getElementById('cam-iso')?.classList.remove('active');
  UIManager.hideTooltip();
  UIManager.hideDetail();
  setTimeout(() => {
    document.getElementById('area-overlay')?.classList.remove('hidden');
    areaStart = areaEnd = null;
    updateHole(0, 0, 0, 0);
  }, 150);
}

function cancelArea() {
  document.getElementById('area-overlay')?.classList.add('hidden');
  areaSelecting = false;
  areaStart = areaEnd = null;
}

function onAreaStart(e) {
  areaSelecting = true;
  areaStart = { x: e.clientX, y: e.clientY };
  areaEnd   = { x: e.clientX, y: e.clientY };
  document.getElementById('area-help').textContent = 'Suelta para confirmar';
  document.getElementById('area-dims').style.display = 'block';
}

function onAreaMove(e) {
  if (!areaSelecting) return;
  areaEnd = { x: e.clientX, y: e.clientY };
  const rect = computeRect();
  updateHole(rect.x, rect.y, rect.w, rect.h);

  const dimsEl = document.getElementById('area-dims');
  dimsEl.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)} px`;
  dimsEl.style.left = (rect.x + rect.w + 12) + 'px';
  dimsEl.style.top  = (rect.y) + 'px';
}

function onAreaEnd(e) {
  if (!areaSelecting) return;
  areaSelecting = false;
  const rect = computeRect();
  if (rect.w < 20 || rect.h < 20) {
    document.getElementById('area-help').textContent = 'Área demasiado pequeña, intenta de nuevo';
    return;
  }
  capturePlanoArea(rect);
}

function computeRect() {
  const x = Math.min(areaStart.x, areaEnd.x);
  const y = Math.min(areaStart.y, areaEnd.y);
  const w = Math.abs(areaEnd.x - areaStart.x);
  const h = Math.abs(areaEnd.y - areaStart.y);
  return { x, y, w, h };
}

function updateHole(x, y, w, h) {
  ['hole', 'select-rect'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('width', w);
    el.setAttribute('height', h);
  });
}

function capturePlanoArea(rect) {
  document.getElementById('area-overlay')?.classList.add('hidden');
  SceneManager.renderer.render(SceneManager.scene, SceneManager.activeCam);

  requestAnimationFrame(() => {
    const dpr = window.devicePixelRatio || 1;
    const src = SceneManager.renderer.domElement;

    const out = document.createElement('canvas');
    out.width  = Math.round(rect.w * dpr);
    out.height = Math.round(rect.h * dpr);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#f5f3ee';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(
      src,
      rect.x * dpr, rect.y * dpr, rect.w * dpr, rect.h * dpr,
      0, 0, out.width, out.height
    );

    const dataURL = out.toDataURL('image/png');
    buildPDF(dataURL, 'PLANO · Vista cenital');
  });
}

function buildPDF(imgDataURL, modeLabel) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const PAGE_W = 297, PAGE_H = 210;
  const MARGIN = 12;
  const company = AppState.company;

  // ═══ CABECERA ═══
  let headX = MARGIN;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('E-scale', headX, MARGIN + 6);
  headX += pdf.getTextWidth('E-scale') + 5;

  if (company.logo) {
    try {
      const fmt = company.logo.startsWith('data:image/png')  ? 'PNG'
                : company.logo.startsWith('data:image/jpeg') ? 'JPEG'
                : 'PNG';
      const tempImg = new Image();
      tempImg.src = company.logo;
      if (tempImg.complete && tempImg.naturalWidth) {
        const logoH = 9;
        const logoW = (tempImg.naturalWidth / tempImg.naturalHeight) * logoH;
        pdf.addImage(company.logo, fmt, headX, MARGIN, logoW, logoH);
        headX += logoW + 4;
      }
    } catch (e) { /* logo no válido */ }
  }

  if (company.name) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(13);
    pdf.setTextColor(60);
    pdf.text(company.name, headX, MARGIN + 6);
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  pdf.text('Planificador 3D de Eventos · ' + modeLabel, MARGIN, MARGIN + 11);

  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
                + ' · ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  pdf.setFontSize(8); pdf.setTextColor(100);
  pdf.text(dateStr, PAGE_W - MARGIN, MARGIN + 6, { align: 'right' });
  if (company.email) {
    pdf.text(company.email, PAGE_W - MARGIN, MARGIN + 11, { align: 'right' });
  }

  pdf.setDrawColor(0);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, MARGIN + 14, PAGE_W - MARGIN, MARGIN + 14);

  // ═══ INVENTARIO ═══
  const totalPax  = AppState.items.reduce((s, i) => s + (i.chairs || 0), 0);
  const numMesas  = AppState.items.filter(i => i.type === 'mesa').length;
  const numBuffets = AppState.items.filter(i => i.type === 'buffet').length;
  const numCarpas = AppState.items.filter(i => i.type === 'carpa').length;

  const RIGHT_X = PAGE_W - MARGIN - 60;
  let y = MARGIN + 22;

  pdf.setFontSize(8); pdf.setTextColor(100);
  pdf.text('INVENTARIO', RIGHT_X, y); y += 5;
  pdf.setDrawColor(180); pdf.line(RIGHT_X, y - 2, PAGE_W - MARGIN, y - 2);

  pdf.setFontSize(28); pdf.setTextColor(0); pdf.setFont('helvetica', 'bold');
  pdf.text(String(totalPax), RIGHT_X, y + 9);
  pdf.setFontSize(8); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100);
  pdf.text('PAX TOTAL', RIGHT_X + 28, y + 9);

  y += 16;
  pdf.setFontSize(9); pdf.setTextColor(0);
  pdf.text(`Mesas: ${numMesas}`, RIGHT_X, y); y += 4.5;
  pdf.text(`Buffets: ${numBuffets}`, RIGHT_X, y); y += 4.5;
  if (numCarpas > 0) {
    pdf.text(`Carpas: ${numCarpas}`, RIGHT_X, y); y += 4.5;
  }
  y += 2;

  const mesasByType = {};
  AppState.items.filter(i => i.type === 'mesa').forEach(m => {
    const k = m.subtype === 'presi'
            ? `Presi. (${m.dims.length}×${m.dims.width}m)`
            : `${m.subtype} Ø${m.dims.diameter}m`;
    mesasByType[k] = (mesasByType[k] || 0) + 1;
  });
  pdf.setFontSize(7); pdf.setTextColor(80);
  Object.entries(mesasByType).forEach(([k, n]) => {
    pdf.text(`· ${k}`, RIGHT_X, y);
    pdf.text(String(n), PAGE_W - MARGIN, y, { align: 'right' });
    y += 4;
  });

  const buffsByCat = {};
  AppState.items.filter(i => i.type === 'buffet').forEach(b => {
    buffsByCat[b.subtype] = (buffsByCat[b.subtype] || 0) + 1;
  });
  if (Object.keys(buffsByCat).length) y += 2;
  Object.entries(buffsByCat).forEach(([k, n]) => {
    pdf.text(`· Buffet ${k}`, RIGHT_X, y);
    pdf.text(String(n), PAGE_W - MARGIN, y, { align: 'right' });
    y += 4;
  });

  if (numCarpas > 0) {
    y += 2;
    const totalArea = AppState.items
      .filter(i => i.type === 'carpa')
      .reduce((s, c) => s + c.dims.length * c.dims.width, 0);
    pdf.text(`· Cobertura total`, RIGHT_X, y);
    pdf.text(`${totalArea.toFixed(1)}m²`, PAGE_W - MARGIN, y, { align: 'right' });
  }

  // ═══ IMAGEN ═══
  const imgArea = {
    x: MARGIN,
    y: MARGIN + 22,
    w: RIGHT_X - MARGIN - 8,
    h: PAGE_H - MARGIN * 2 - 22
  };

  const img = new Image();
  img.onload = () => {
    const imgRatio  = img.width / img.height;
    const areaRatio = imgArea.w / imgArea.h;
    let drawW, drawH;
    if (imgRatio > areaRatio) {
      drawW = imgArea.w;
      drawH = drawW / imgRatio;
    } else {
      drawH = imgArea.h;
      drawW = drawH * imgRatio;
    }
    const drawX = imgArea.x + (imgArea.w - drawW) / 2;
    const drawY = imgArea.y + (imgArea.h - drawH) / 2;

    pdf.setDrawColor(0); pdf.setLineWidth(0.2);
    pdf.rect(drawX - 1, drawY - 1, drawW + 2, drawH + 2);
    pdf.addImage(imgDataURL, 'PNG', drawX, drawY, drawW, drawH);

    pdf.setFontSize(7); pdf.setTextColor(120);
    const leftFoot = company.name
      ? `E-scale · ${company.name}${company.email ? ' · ' + company.email : ''}`
      : 'E-scale · planificador 3D · v3.0';
    pdf.text(leftFoot, MARGIN, PAGE_H - 5);
    pdf.text('Página 1 / 1', PAGE_W - MARGIN, PAGE_H - 5, { align: 'right' });

    const safeName = (company.name || 'escale').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `${safeName || 'escale'}_${modeLabel.toLowerCase().split(' ')[0]}_${Date.now()}.pdf`;
    pdf.save(filename);
  };
  img.src = imgDataURL;
}

export const ExportManager = { init };

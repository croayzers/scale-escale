import { AppState } from '../core/AppState.js';
import {
  getInventoryTotalItems,
  getInventoryTotalPax,
  groupInventoryLines
} from '../core/InventoryRules.js';
import { InventoryPanel } from '../ui/InventoryPanel.js';
import { DashboardSync } from './DashboardSync.js';
import { CompanyManager } from './CompanyManager.js';
import { SceneManager } from '../scene/SceneManager.js';
import { UIManager } from '../ui/UIManager.js';
import { CloudSync } from '../services/CloudSync.js';
import { AnalyticsManager } from '../services/AnalyticsManager.js';
import { SubscriptionManager } from '../services/SubscriptionManager.js';
import { PlanningRegistry } from './PlanningRegistry.js';

let areaSelecting = false;
let areaStart = null;
let areaEnd = null;
let previewState = null;
let exportIntent = {
  kind: 'pdf',
  featureKey: 'pdfExport'
};
let _ambasPlanoDataUrl = null; // guardamos el plano capturado para el flujo "Ambas"

function normalizeExportIntent(options = {}) {
  const kind = options.kind === 'inventory' ? 'inventory' : 'pdf';
  return {
    kind,
    featureKey: kind === 'inventory' ? 'companyReporting' : 'pdfExport'
  };
}

function parseColor(value, fallback) {
  const raw = String(value || '').trim();
  const hex = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const full = hex[1].length === 3
      ? hex[1].split('').map(char => char + char).join('')
      : hex[1];
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16)
    ];
  }

  const rgb = raw.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgb) {
    const parts = rgb.slice(1).map(Number);
    if (parts.every(valuePart => valuePart >= 0 && valuePart <= 255)) return parts;
  }

  return fallback;
}

function setPdfColor(pdf, rgb, mode = 'text') {
  if (mode === 'draw') pdf.setDrawColor(rgb[0], rgb[1], rgb[2]);
  else pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function getCompanyDisplayName(company) {
  const name = (company?.name || '').trim();
  if (name) return name;
  const email = company?.authEmail || '';
  const domain = email.split('@')[1] || '';
  return domain || 'E-scale';
}

function init() {
  document.getElementById('btn-export')?.addEventListener('click', openModal);
  document.getElementById('export-cancel')?.addEventListener('click', closeModal);
  document.getElementById('export-choice-3d')?.addEventListener('click', export3D);
  document.getElementById('export-choice-plano')?.addEventListener('click', startPlanoSelection);
  document.getElementById('export-choice-ambas')?.addEventListener('click', startAmbas);

  document.getElementById('export-preview-close')?.addEventListener('click', closePreview);
  document.getElementById('export-preview-cancel')?.addEventListener('click', closePreview);
  document.getElementById('export-preview-download')?.addEventListener('click', downloadPreview);

  const overlay = document.getElementById('area-overlay');
  if (overlay) {
    overlay.addEventListener('pointerdown', onAreaStart);
    overlay.addEventListener('pointermove', onAreaMove);
    overlay.addEventListener('pointerup', onAreaEnd);
  }

  document.getElementById('area-mode-toggle')?.addEventListener('click', toggleAreaMode);
  document.getElementById('area-cancel')?.addEventListener('click', cancelArea);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) cancelArea();
  });

  document.getElementById('pdf-data-close')?.addEventListener('click', closeDataModal);
  document.getElementById('pdf-data-cancel')?.addEventListener('click', closeDataModal);
  document.getElementById('pdf-data-save')?.addEventListener('click', saveDataModal);

  syncExportModalCopy();
}

function syncExportModalCopy() {
  const modalTitle = document.getElementById('export-modal-title');
  const modalCopy = document.getElementById('export-modal-copy');
  const downloadLabel = document.getElementById('export-preview-download-label');

  if (modalTitle) {
    modalTitle.textContent = exportIntent.kind === 'inventory'
      ? 'Elige la vista del inventario'
      : 'Elige el tipo';
  }

  if (modalCopy) {
    modalCopy.textContent = exportIntent.kind === 'inventory'
      ? 'Se generara el PDF del planning y un CSV del inventario con los datos de la empresa.'
      : 'Escoge si quieres una exportacion cenital o isometrica antes de descargar el PDF.';
  }

  if (downloadLabel) {
    downloadLabel.textContent = exportIntent.kind === 'inventory'
      ? 'Descargar PDF + CSV'
      : 'Descargar PDF';
  }
}

function openModal(options = {}) {
  exportIntent = normalizeExportIntent(options);
  syncExportModalCopy();

  if (!SubscriptionManager.ensureFeature(exportIntent.featureKey)) return;

  // Gate: si faltan datos de empresa, abrimos primero ese modal
  CompanyManager.requireReady(() => {
    void AnalyticsManager.track('export_modal_opened', {
      planCode: SubscriptionManager.currentPlanCode(),
      exportKind: exportIntent.kind
    });
    document.getElementById('export-modal')?.classList.add('visible');
  }, { hint: '⚡ Para exportar el documento correctamente rellena los campos obligatorios: Nombre de empresa y Lugar del evento.' });
}

function closeModal() {
  document.getElementById('export-modal')?.classList.remove('visible');
}

/* ─── Datos del documento (campos que rellenan los PDF) ─── */
const PDF_DATA_FIELDS = [
  { id: 'pdf-data-name',    key: 'name',      required: true },
  { id: 'pdf-data-venue',   key: 'venueName', required: true },
  { id: 'pdf-data-email',   key: 'email',     required: false },
  { id: 'pdf-data-cliente', key: 'cliente',   required: false }
];

function _markPdfField(input, required) {
  const missing = required && !input.value.trim();
  input.classList.toggle('pdf-field-missing', missing);
  return missing;
}

function openDataModal() {
  const company = AppState.company || {};
  PDF_DATA_FIELDS.forEach(({ id, key, required }) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = company[key] || (key === 'email' ? (company.authEmail || '') : '');
    _markPdfField(input, required);
    if (!input._pdfBound) {
      input.addEventListener('input', () => _markPdfField(input, required));
      input._pdfBound = true;
    }
  });
  const logoStatus = document.getElementById('pdf-data-logo-status');
  if (logoStatus) logoStatus.textContent = company.logo ? 'Logo: cargado' : 'Logo: sin logo';
  document.getElementById('pdf-data-hint')?.classList.add('hidden');
  document.getElementById('pdf-data-modal')?.classList.add('visible');
  if (window.lucide) lucide.createIcons();
}

function closeDataModal() {
  document.getElementById('pdf-data-modal')?.classList.remove('visible');
}

function saveDataModal() {
  let firstMissing = null;
  const patch = {};
  PDF_DATA_FIELDS.forEach(({ id, key, required }) => {
    const input = document.getElementById(id);
    if (!input) return;
    if (_markPdfField(input, required) && !firstMissing) firstMissing = input;
    patch[key] = input.value.trim();
  });
  if (firstMissing) {
    const hint = document.getElementById('pdf-data-hint');
    if (hint) { hint.textContent = 'Rellena los campos obligatorios marcados en rojo.'; hint.classList.remove('hidden'); }
    firstMissing.focus();
    return;
  }
  CompanyManager.saveDocumentData(patch);
  closeDataModal();
}

function openPreviewShell(message = 'Preparando vista previa...') {
  const modal = document.getElementById('export-preview-modal');
  const pages = document.getElementById('export-preview-pages');
  const meta = document.getElementById('export-preview-meta');

  if (!modal || !pages || !meta) return;

  modal.classList.add('visible');
  pages.innerHTML = `<div class="export-preview-loading mono text-[11px] tracking-widest uppercase">${message}</div>`;
  meta.textContent = exportIntent.kind === 'inventory'
    ? 'Generando PDF y CSV de inventario para revisión previa.'
    : 'Generando PDF para revisión previa.';
}

async function export3D() {
  closeModal();
  setExportCamera('3d');
  UIManager.hideDetail?.();
  UIManager.hideTooltip?.();
  showPhotoModeOverlay();
}

function showPhotoModeOverlay() {
  const overlay = document.getElementById('photo-mode-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  document.getElementById('photo-capture-btn')?.addEventListener('click', capturePhoto, { once: true });
  document.getElementById('photo-cancel-btn')?.addEventListener('click', hidePhotoModeOverlay, { once: true });
}

function hidePhotoModeOverlay() {
  document.getElementById('photo-mode-overlay')?.classList.add('hidden');
}

async function capturePhoto() {
  hidePhotoModeOverlay();
  openPreviewShell();
  try {
    const imageDataUrl = await captureHighResSceneDataUrl('3d');
    await buildAndPreview(imageDataUrl, buildModeLabel('3D', 'Vista isometrica'));
  } catch (error) {
    handlePreviewError(error);
  }
}

let _areaModeSelecting = false; // false = navegar, true = seleccionar

function _setAreaMode(selecting) {
  _areaModeSelecting = selecting;
  const overlay  = document.getElementById('area-overlay');
  const label    = document.getElementById('area-mode-label');
  const helpSpan = document.getElementById('area-help');
  const svg      = document.getElementById('area-svg');
  if (!overlay) return;

  if (selecting) {
    overlay.style.pointerEvents = '';
    overlay.style.cursor = 'crosshair';
    if (svg) svg.style.display = '';
    if (label) label.innerHTML = '&#9654; Seleccionar area';
    if (helpSpan) helpSpan.textContent = 'Click y arrastra para seleccionar';
  } else {
    overlay.style.pointerEvents = 'none';
    overlay.style.cursor = 'default';
    if (svg) svg.style.display = 'none';
    // Resetear selección anterior al volver a modo navegar
    areaStart = null; areaEnd = null; areaSelecting = false;
    updateHole(0, 0, 0, 0);
    if (label) label.innerHTML = '&#9654; Seleccionar area';
    if (helpSpan) helpSpan.textContent = 'Ajusta la vista, luego selecciona el area';
  }
  // La barra superior siempre recibe eventos
  overlay.querySelector('.glass-dark').style.pointerEvents = 'auto';
}

function toggleAreaMode() {
  _setAreaMode(!_areaModeSelecting);
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
    areaStart = null;
    areaEnd = null;
    updateHole(0, 0, 0, 0);
    _setAreaMode(false); // empieza en modo navegar
  }, 150);
}

function cancelArea() {
  document.getElementById('area-overlay')?.classList.add('hidden');
  areaSelecting = false;
  areaStart = null;
  areaEnd = null;
  _setAreaMode(false);
}

function onAreaStart(event) {
  if (!_areaModeSelecting) return;
  areaSelecting = true;
  areaStart = { x: event.clientX, y: event.clientY };
  areaEnd = { x: event.clientX, y: event.clientY };
  document.getElementById('area-help').textContent = 'Suelta para confirmar';
  document.getElementById('area-dims').style.display = 'block';
}

function onAreaMove(event) {
  if (!areaSelecting) return;

  areaEnd = { x: event.clientX, y: event.clientY };
  const rect = computeRect();

  updateHole(rect.x, rect.y, rect.w, rect.h);

  const dims = document.getElementById('area-dims');
  dims.textContent = `${Math.round(rect.w)} x ${Math.round(rect.h)} px`;
  dims.style.left = `${rect.x + rect.w + 12}px`;
  dims.style.top = `${rect.y}px`;
}

function onAreaEnd() {
  if (!areaSelecting) return;

  areaSelecting = false;
  const rect = computeRect();

  if (rect.w < 20 || rect.h < 20) {
    document.getElementById('area-help').textContent = 'Area demasiado pequena, intenta de nuevo';
    return;
  }

  const areaOverlay = document.getElementById('area-overlay');
  const mode = areaOverlay?.dataset.mode;
  if (mode === 'ambas') {
    delete areaOverlay.dataset.mode;
    capturePlanoAreaForAmbas(rect);
  } else {
    capturePlanoArea(rect);
  }
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
    const element = document.getElementById(id);
    if (!element) return;
    element.setAttribute('x', x);
    element.setAttribute('y', y);
    element.setAttribute('width', w);
    element.setAttribute('height', h);
  });
}

async function capturePlanoAreaForAmbas(rect) {
  document.getElementById('area-overlay')?.classList.add('hidden');
  const renderer = SceneManager.renderer;
  const origPR = renderer.getPixelRatio();
  const origW  = renderer.domElement.width  / origPR;
  const origH  = renderer.domElement.height / origPR;
  try {
    renderer.setPixelRatio(EXPORT_SCALE);
    renderer.setSize(origW, origH, false);
    await waitFrame();
    renderer.render(SceneManager.scene, SceneManager.activeCam);
    await waitFrame();

    const src = renderer.domElement;
    const out = document.createElement('canvas');
    out.width  = Math.round(rect.w * EXPORT_SCALE);
    out.height = Math.round(rect.h * EXPORT_SCALE);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#f5f3ee';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, rect.x * EXPORT_SCALE, rect.y * EXPORT_SCALE, rect.w * EXPORT_SCALE, rect.h * EXPORT_SCALE, 0, 0, out.width, out.height);
    _ambasPlanoDataUrl = out.toDataURL('image/png');
  } finally {
    renderer.setPixelRatio(origPR);
    renderer.setSize(origW, origH, false);
    renderer.render(SceneManager.scene, SceneManager.activeCam);
  }
  await captureAmbasIso();
}

async function capturePlanoArea(rect) {
  document.getElementById('area-overlay')?.classList.add('hidden');
  openPreviewShell();
  SceneManager.renderer.render(SceneManager.scene, SceneManager.activeCam);

  try {
    // Renderizar la escena a alta resolución y luego recortar el área seleccionada
    const renderer = SceneManager.renderer;
    const origPR = renderer.getPixelRatio();
    const origW  = renderer.domElement.width  / origPR;
    const origH  = renderer.domElement.height / origPR;

    let imageDataUrl;
    try {
      renderer.setPixelRatio(EXPORT_SCALE);
      renderer.setSize(origW, origH, false);
      await waitFrame();
      renderer.render(SceneManager.scene, SceneManager.activeCam);
      await waitFrame();

      const src = renderer.domElement;
      const out = document.createElement('canvas');
      out.width  = Math.round(rect.w * EXPORT_SCALE);
      out.height = Math.round(rect.h * EXPORT_SCALE);

      const ctx = out.getContext('2d');
      ctx.fillStyle = '#f5f3ee';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(
        src,
        rect.x * EXPORT_SCALE,
        rect.y * EXPORT_SCALE,
        rect.w * EXPORT_SCALE,
        rect.h * EXPORT_SCALE,
        0, 0,
        out.width,
        out.height
      );
      imageDataUrl = out.toDataURL('image/png');
    } finally {
      renderer.setPixelRatio(origPR);
      renderer.setSize(origW, origH, false);
      renderer.render(SceneManager.scene, SceneManager.activeCam);
    }

    await buildAndPreview(imageDataUrl, buildModeLabel('Plano', 'Vista cenital'));
  } catch (error) {
    handlePreviewError(error);
  }
}

function buildModeLabel(viewLabel, cameraLabel) {
  if (exportIntent.kind === 'inventory') {
    return `${viewLabel.toUpperCase()} · ${cameraLabel} + inventario`;
  }
  return `${viewLabel.toUpperCase()} · ${cameraLabel}`;
}

async function buildAndPreview(imageDataUrl, modeLabel) {
  PlanningRegistry.record('export');
  const pdfResult = await buildPdfBlob(imageDataUrl, modeLabel);
  const result = exportIntent.kind === 'inventory'
    ? attachInventoryDownload(pdfResult, modeLabel)
    : pdfResult;
  const syncPromise = persistExport(modeLabel, result);
  await renderPreview(result, modeLabel);
  await syncPromise;
}

function attachInventoryDownload(result, modeLabel) {
  const csv = buildInventoryCsvDownload(modeLabel);
  return {
    ...result,
    extraDownloads: [csv]
  };
}

async function persistExport(modeLabel, result) {
  try {
    await DashboardSync.recordExport({ modeLabel, filename: result.filename });
  } catch (error) {
    console.warn('No se pudo registrar la exportacion en el dashboard local:', error);
  }
  try {
    await CloudSync.recordExport({
      modeLabel,
      filename: result.filename,
      blob: result.blob
    });
  } catch (error) {
    console.warn('No se pudo registrar la exportacion en cloud:', error);
  }

  if (SubscriptionManager.hasFeature('emailPdfToOwner')) {
    try {
      const delivery = await CloudSync.sendOwnerExportEmail({
        blob: result.blob,
        filename: result.filename,
        modeLabel
      });
      if (delivery?.ok) {
        alert(`PDF enviado por email a ${AppState.company.email}.`);
      }
    } catch (error) {
      console.warn('No se pudo enviar el PDF al email del usuario:', error);
    }
  }
}

function handlePreviewError(error) {
  console.error(error);
  closePreview();
  alert('No se pudo generar la vista previa del PDF.');
}

function closePreview() {
  document.getElementById('export-preview-modal')?.classList.remove('visible');
  document.getElementById('export-preview-pages').innerHTML = '';
  document.getElementById('export-preview-meta').textContent = '';

  if (previewState?.url) URL.revokeObjectURL(previewState.url);
  previewState = null;
}

function downloadPreview() {
  if (!previewState?.url || !previewState?.filename) return;

  const link = document.createElement('a');
  link.href = previewState.url;
  link.download = previewState.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  (previewState.extraDownloads || []).forEach(file => {
    const extraLink = document.createElement('a');
    extraLink.href = URL.createObjectURL(file.blob);
    extraLink.download = file.filename;
    document.body.appendChild(extraLink);
    extraLink.click();
    document.body.removeChild(extraLink);
    setTimeout(() => URL.revokeObjectURL(extraLink.href), 0);
  });

  document.dispatchEvent(new CustomEvent('escale:export-done'));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function waitFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function setExportCamera(view) {
  const mode = view === '3d' ? 'iso' : 'top';
  SceneManager.setCamera(mode);
  document.getElementById('cam-top')?.classList.toggle('active', mode === 'top');
  document.getElementById('cam-iso')?.classList.toggle('active', mode === 'iso');
}

function enableExportCotas() {
  AppState.showCotas = true;
  const toggle = document.getElementById('cotas-toggle');
  if (toggle) toggle.checked = true;
  SceneManager.drawCotas();
}

async function captureSceneDataUrl(view) {
  setExportCamera(view);
  enableExportCotas();
  await waitFrame();
  SceneManager.renderer.render(SceneManager.scene, SceneManager.activeCam);
  await waitFrame();

  const src = SceneManager.renderer.domElement;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#f5f3ee';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  return out.toDataURL('image/png');
}

/**
 * Versión alta resolución para PDF.
 * Renderiza temporalmente el scene a EXPORT_SCALE × la resolución CSS del canvas,
 * captura el buffer, y restaura la resolución original.
 */
const EXPORT_SCALE = 3; // 3× → ~300 DPI en A4

async function captureHighResSceneDataUrl(view) {
  setExportCamera(view);
  enableExportCotas();

  const renderer = SceneManager.renderer;
  const cam      = SceneManager.activeCam;

  // Guardar estado actual
  const origPR  = renderer.getPixelRatio();
  const origW   = renderer.domElement.width  / origPR;
  const origH   = renderer.domElement.height / origPR;

  let dataUrl;
  try {
    // Renderizar a resolución alta (false = no tocar el CSS del canvas)
    renderer.setPixelRatio(EXPORT_SCALE);
    renderer.setSize(origW, origH, false);
    await waitFrame();
    renderer.render(SceneManager.scene, cam);
    await waitFrame();

    const src = renderer.domElement;
    const out = document.createElement('canvas');
    out.width  = src.width;
    out.height = src.height;
    const ctx  = out.getContext('2d');
    ctx.fillStyle = '#f5f3ee';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    dataUrl = out.toDataURL('image/png');
  } finally {
    // Restaurar siempre, aunque haya error
    renderer.setPixelRatio(origPR);
    renderer.setSize(origW, origH, false);
    renderer.render(SceneManager.scene, cam);
  }
  return dataUrl;
}

async function composePrintCanvas(imageDataUrl, view) {
  const image = await loadImage(imageDataUrl);
  const company = AppState.company || {};
  const now = new Date();
  const eventName = document.getElementById('inventory-event-name')?.value?.trim() || '';

  const out = document.createElement('canvas');
  out.width = 1800;
  out.height = 1200;
  const ctx = out.getContext('2d');

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, out.width, out.height);

  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.filter = 'blur(1.2px)';
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(-Math.PI / 10);
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 170px Inter Tight, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('E_scale', 0, 28);
  ctx.restore();

  const margin = 58;
  const headerH = 116;
  const footerH = 70;
  const brandPrimary = company.colorPrimary || '#2563EB';
  const brandSecondary = '#000000';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, headerH);
  ctx.fillStyle = brandPrimary;
  ctx.fillRect(0, headerH - 4, out.width, 4);

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 34px Inter Tight, Arial, sans-serif';
  ctx.fillText(getCompanyDisplayName(company), margin, 48);
  ctx.font = '500 18px Inter Tight, Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  const info = [
    eventName ? `Evento: ${eventName}` : '',
    company.venueName ? `Lugar: ${company.venueName}` : '',
    company.email || ''
  ].filter(Boolean).join('  ·  ');
  ctx.fillText(info || 'Planificador de espacios profesional', margin, 82);

  ctx.textAlign = 'right';
  ctx.fillStyle = brandSecondary;
  ctx.font = '800 24px Inter Tight, Arial, sans-serif';
  ctx.fillText(view === '3d' ? 'Captura 3D' : 'Captura 2D', out.width - margin, 45);
  ctx.font = '500 16px Inter Tight, Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(now.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }), out.width - margin, 76);

  const imageArea = {
    x: margin,
    y: headerH + 34,
    w: out.width - margin * 2,
    h: out.height - headerH - footerH - 58
  };
  const imageRatio = image.width / image.height;
  const areaRatio = imageArea.w / imageArea.h;
  const drawW = imageRatio > areaRatio ? imageArea.w : imageArea.h * imageRatio;
  const drawH = imageRatio > areaRatio ? imageArea.w / imageRatio : imageArea.h;
  const drawX = imageArea.x + (imageArea.w - drawW) / 2;
  const drawY = imageArea.y + (imageArea.h - drawH) / 2;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(imageArea.x - 1, imageArea.y - 1, imageArea.w + 2, imageArea.h + 2);
  ctx.drawImage(image, drawX, drawY, drawW, drawH);

  if (SubscriptionManager.currentPlanCode() === 'free_lite') {
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(-Math.PI / 8);
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 110px Inter Tight, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Escale3D.com', 0, 0);
    ctx.restore();
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, out.height - footerH, out.width, footerH);
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'left';
  ctx.font = '600 16px Inter Tight, Arial, sans-serif';
  ctx.fillText('E-scale', margin, out.height - 30);
  ctx.textAlign = 'right';
  ctx.fillText(`${getInventoryTotalItems(AppState.items)} elementos · ${getInventoryTotalPax(AppState.items)} PAX`, out.width - margin, out.height - 30);

  return out;
}

function printPng({ view = '2d' } = {}) {
  CompanyManager.requireReady(
    () => _startPrintPngWithOverlay({ view }),
    { hint: '⚡ Para exportar el documento correctamente rellena los campos obligatorios: Nombre de empresa y Lugar del evento.' }
  );
}

function _startPrintPngWithOverlay({ view = '2d' } = {}) {
  const normalizedView = String(view).toLowerCase() === '3d' ? '3d' : '2d';
  document.dispatchEvent(new CustomEvent('escale:inventory-close'));

  // Poner la cámara en la vista correcta
  setExportCamera(normalizedView === '3d' ? '3d' : 'top');
  UIManager.hideDetail?.();
  UIManager.hideTooltip?.();

  const label    = document.getElementById('photo-mode-label');
  const btnLabel = document.getElementById('photo-capture-label');
  const hint     = normalizedView === '3d'
    ? 'Ajusta la vista 3D y pulsa <strong>Capturar</strong>'
    : 'Ajusta la vista 2D y pulsa <strong>Capturar</strong>';
  if (label)    label.innerHTML = `IMPRIMIR PNG · ${hint}`;
  if (btnLabel) btnLabel.textContent = 'CAPTURAR';

  document.getElementById('photo-mode-overlay')?.classList.remove('hidden');

  document.getElementById('photo-capture-btn').addEventListener('click', async () => {
    if (label)    label.innerHTML = 'MODO FOTO · Ajusta la vista ISO y pulsa <strong>Foto</strong>';
    if (btnLabel) btnLabel.textContent = 'FOTO';
    hidePhotoModeOverlay();
    try {
      const imageDataUrl = await captureSceneDataUrl(normalizedView);
      const canvas = await composePrintCanvas(imageDataUrl, normalizedView);
      const company = AppState.company || {};
      const safeName = getCompanyDisplayName(company)
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      canvas.toBlob(blob => {
        if (!blob) return;
        downloadBlob(blob, `${safeName || 'escale'}_captura_${normalizedView}_${Date.now()}.png`);
      }, 'image/png');
    } catch (error) {
      console.error(error);
      alert('No se pudo generar la captura PNG.');
    }
  }, { once: true });

  document.getElementById('photo-cancel-btn').addEventListener('click', () => {
    if (label)    label.innerHTML = 'MODO FOTO · Ajusta la vista ISO y pulsa <strong>Foto</strong>';
    if (btnLabel) btnLabel.textContent = 'FOTO';
  }, { once: true });
}

async function renderPreview(result, modeLabel) {
  if (previewState?.url) URL.revokeObjectURL(previewState.url);

  previewState = {
    ...result,
    url: URL.createObjectURL(result.blob)
  };

  const pagesHost = document.getElementById('export-preview-pages');
  const meta = document.getElementById('export-preview-meta');
  if (!pagesHost || !meta) return;

  meta.textContent = result.extraDownloads?.length
    ? `${modeLabel} · ${result.filename} · incluye ${result.extraDownloads.length} archivo adicional`
    : `${modeLabel} · ${result.filename}`;
  pagesHost.innerHTML = '';
  void AnalyticsManager.track('export_preview_ready', {
    modeLabel,
    filename: result.filename,
    exportKind: exportIntent.kind
  });

  const pdfData = await result.blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({ canvasContext: context, viewport }).promise;

    const wrapper = document.createElement('div');
    wrapper.className = 'export-preview-page';
    wrapper.innerHTML = `<div class="export-preview-caption">Pagina ${pageNumber} de ${pdf.numPages}</div>`;
    wrapper.appendChild(canvas);
    pagesHost.appendChild(wrapper);
  }
}

async function loadImage(source) {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function truncateLabel(pdf, label, maxWidth) {
  let output = label;
  while (pdf.getTextWidth(output) > maxWidth && output.length > 8) {
    output = output.slice(0, -1);
  }
  return output === label ? output : `${output}...`;
}

async function buildPdfBlob(imageDataUrl, modeLabel) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 12;
  const company = AppState.company;
  const eventName = document.getElementById('inventory-event-name')?.value?.trim() || '';
  const brandPrimary = parseColor(company.colorPrimary, [37, 99, 235]);
  const brandSecondary = [0, 0, 0];

  let headX = margin;
  if (company.logo) {
    try {
      const logoImage = await loadImage(company.logo);
      const logoHeight = 9;
      const logoWidth = (logoImage.naturalWidth / logoImage.naturalHeight) * logoHeight;
      const format = company.logo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      pdf.addImage(company.logo, format, headX, margin, logoWidth, logoHeight);
      headX += logoWidth + 4;
    } catch (error) {
      console.warn('No se pudo cargar el logo para el PDF:', error);
    }
  }

  const displayName = getCompanyDisplayName(company);
  if (displayName) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    setPdfColor(pdf, brandPrimary);
    pdf.text(displayName, headX, margin + 6);
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  pdf.text(`Planificador 3D · ${modeLabel}`, margin, margin + 11);

  let infoY = margin + 15;
  if (eventName) {
    pdf.text(`Evento: ${eventName}`, margin, infoY);
    infoY += 4;
  }
  if (company.venueName) {
    pdf.text(`Lugar: ${company.venueName}`, margin, infoY);
    infoY += 4;
  }

  const now = new Date();
  const dateText = `${now.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })} · ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;

  pdf.text(dateText, pageWidth - margin, margin + 6, { align: 'right' });
  if (company.email) pdf.text(company.email, pageWidth - margin, margin + 11, { align: 'right' });

  const separatorY = Math.max(margin + 18, infoY + 1);
  setPdfColor(pdf, brandPrimary, 'draw');
  pdf.setLineWidth(0.3);
  pdf.line(margin, separatorY, pageWidth - margin, separatorY);

  const inventoryX = pageWidth - margin - 68;
  let inventoryY = separatorY + 6;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  setPdfColor(pdf, brandPrimary);
  pdf.text('INVENTARIO', inventoryX, inventoryY);
  inventoryY += 3;

  setPdfColor(pdf, brandSecondary, 'draw');
  pdf.setLineWidth(0.2);
  pdf.line(inventoryX, inventoryY, pageWidth - margin, inventoryY);
  inventoryY += 4;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(26);
  setPdfColor(pdf, brandPrimary);
  pdf.text(String(getInventoryTotalPax(AppState.items)), inventoryX, inventoryY + 8);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100);
  pdf.text('PAX TOTAL', inventoryX + 22, inventoryY + 8);
  inventoryY += 14;

  groupInventoryLines(AppState.items).forEach(group => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    setPdfColor(pdf, brandSecondary);
    pdf.text(group.label.toUpperCase(), inventoryX, inventoryY);
    setPdfColor(pdf, brandSecondary, 'draw');
    pdf.setLineWidth(0.1);
    pdf.line(inventoryX, inventoryY + 0.8, pageWidth - margin, inventoryY + 0.8);
    inventoryY += 4;

    group.lines.forEach(line => {
      if (inventoryY > pageHeight - 24) return;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      setPdfColor(pdf, brandPrimary);
      pdf.text(`${line.count}x`, inventoryX, inventoryY);
      pdf.text(truncateLabel(pdf, line.label, 44), inventoryX + 6, inventoryY);

      setPdfColor(pdf, brandSecondary);
      pdf.text(line.pax > 0 ? `${line.pax}p` : '-', pageWidth - margin, inventoryY, { align: 'right' });
      inventoryY += 3.8;
    });

    inventoryY += 1.5;
  });

  inventoryY += 1;
  setPdfColor(pdf, brandPrimary, 'draw');
  pdf.setLineWidth(0.2);
  pdf.line(inventoryX, inventoryY, pageWidth - margin, inventoryY);
  inventoryY += 3.5;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7);
  setPdfColor(pdf, brandPrimary);
  pdf.text(`Total elementos: ${getInventoryTotalItems(AppState.items)}`, inventoryX, inventoryY);
  inventoryY += 4;
  pdf.text('Precio total:', inventoryX, inventoryY);
  setPdfColor(pdf, brandSecondary);
  pdf.text('-', pageWidth - margin, inventoryY, { align: 'right' });

  inventoryY += 5;
  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(6);
  pdf.setTextColor(160);
  pdf.text('* Ambiente y estructuras se mantienen fuera del inventario.', inventoryX, inventoryY);
  pdf.text('Conecta tu tarifa despues para completar presupuesto.', inventoryX, inventoryY + 3.5);

  const imageArea = {
    x: margin,
    y: separatorY + 8,
    w: inventoryX - margin - 8,
    h: pageHeight - margin * 2 - (separatorY - margin) - 8
  };

  const image = await loadImage(imageDataUrl);
  const imageRatio = image.width / image.height;
  const areaRatio = imageArea.w / imageArea.h;
  let drawWidth;
  let drawHeight;

  if (imageRatio > areaRatio) {
    drawWidth = imageArea.w;
    drawHeight = drawWidth / imageRatio;
  } else {
    drawHeight = imageArea.h;
    drawWidth = drawHeight * imageRatio;
  }

  const drawX = imageArea.x + (imageArea.w - drawWidth) / 2;
  const drawY = imageArea.y + (imageArea.h - drawHeight) / 2;

  setPdfColor(pdf, brandPrimary, 'draw');
  pdf.setLineWidth(0.2);
  pdf.rect(drawX - 1, drawY - 1, drawWidth + 2, drawHeight + 2);
  pdf.addImage(imageDataUrl, 'PNG', drawX, drawY, drawWidth, drawHeight, undefined, 'NONE');

  if (SubscriptionManager.currentPlanCode() === 'free_lite') {
    const PX = 4;
    const wmCanvas = document.createElement('canvas');
    wmCanvas.width  = Math.round(pageWidth  * PX);
    wmCanvas.height = Math.round(pageHeight * PX);
    const wmCtx = wmCanvas.getContext('2d');
    wmCtx.save();
    wmCtx.globalAlpha = 0.15;
    wmCtx.translate(wmCanvas.width / 2, wmCanvas.height / 2);
    wmCtx.rotate(-Math.PI / 8);
    wmCtx.fillStyle = '#0f172a';
    wmCtx.font = `bold ${Math.round(wmCanvas.width / 9)}px Inter Tight, Arial, sans-serif`;
    wmCtx.textAlign = 'center';
    wmCtx.textBaseline = 'middle';
    wmCtx.fillText('Escale3D.com', 0, 0);
    wmCtx.restore();
    pdf.addImage(wmCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'NONE');
  }

  pdf.setFontSize(7);
  setPdfColor(pdf, brandSecondary);
  const footerBits = ['Powered by E-scale.com'];
  if (company.venueName) footerBits.push(company.venueName);
  if (company.email) footerBits.push(company.email);
  pdf.text(footerBits.join(' · '), margin, pageHeight - 5);
  pdf.text('Pagina 1 / 1', pageWidth - margin, pageHeight - 5, { align: 'right' });

  const safeName = (company.name || 'escale')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const filename = `${safeName || 'escale'}_${modeLabel.toLowerCase().split(' ')[0]}_${Date.now()}.pdf`;
  const blob = pdf.output('blob');

  return { blob, filename };
}

function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",;\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildInventoryCsvDownload(modeLabel) {
  const company = AppState.company || {};
  const eventName = document.getElementById('inventory-event-name')?.value?.trim() || '';
  const rows = [
    ['Empresa', company.name || ''],
    ['Email', company.email || ''],
    ['Lugar', company.venueName || ''],
    ['Evento', eventName],
    ['Plan', SubscriptionManager.currentPlanCode()],
    ['Logo', company.logoFileName || company.logoRelativePath || (company.logo ? 'logo_cargado' : 'sin_logo')],
    ['Exportacion', modeLabel],
    [],
    ['Grupo', 'Elemento', 'Cantidad', 'PAX', 'Precio unitario (EUR)', 'Subtotal (EUR)']
  ];

  const fmtNum = n => (n > 0 ? n.toFixed(2).replace('.', ',') : '');
  groupInventoryLines(AppState.items).forEach(group => {
    group.lines.forEach(line => {
      const unit = InventoryPanel.getUnitPrice(line.label);
      const subtotal = unit * line.count;
      rows.push([
        group.label, line.label, line.count, line.pax > 0 ? line.pax : '',
        fmtNum(unit), fmtNum(subtotal)
      ]);
    });
  });

  rows.push([]);
  rows.push(['Total elementos', getInventoryTotalItems(AppState.items)]);
  rows.push(['Total PAX', getInventoryTotalPax(AppState.items)]);
  // El total de coste base se exporta; el margen comercial NUNCA se incluye.
  const subtotalCoste = InventoryPanel.getInventorySubtotal(AppState.items);
  if (subtotalCoste > 0) rows.push(['Total coste (EUR)', subtotalCoste.toFixed(2).replace('.', ',')]);

  const csv = `\uFEFF${rows.map(columns => columns.map(csvCell).join(';')).join('\n')}`;
  const safeName = (company.name || 'escale')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return {
    blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    filename: `${safeName || 'escale'}_inventario_${Date.now()}.csv`
  };
}

function downloadInventoryCsv() {
  const csv = buildInventoryCsvDownload('CSV');
  downloadBlob(csv.blob, csv.filename);
}

/* ═══════════════════════════════════════════════════════════
   AMBAS: Plano → 3D → PDF de 2 páginas
   ═══════════════════════════════════════════════════════════ */

function startAmbas() {
  closeModal();
  _ambasPlanoDataUrl = null;

  // Fase 1: igual que startPlanoSelection pero al capturar el área
  // guardamos la imagen y pasamos a la fase ISO
  SceneManager.setCamera('top');
  document.getElementById('cam-top')?.classList.add('active');
  document.getElementById('cam-iso')?.classList.remove('active');
  UIManager.hideTooltip();
  UIManager.hideDetail();

  setTimeout(() => {
    const ov = document.getElementById('area-overlay');
    ov?.classList.remove('hidden');
    ov.dataset.mode = 'ambas';
    areaStart = null;
    areaEnd = null;
    updateHole(0, 0, 0, 0);
    _setAreaMode(false); // empieza en modo navegar
  }, 150);
}

async function captureAmbasIso() {
  // Fase 2: cambiar a ISO, mostrar overlay con texto "Listo"
  setExportCamera('3d');
  UIManager.hideDetail?.();
  UIManager.hideTooltip?.();

  const overlay  = document.getElementById('photo-mode-overlay');
  const label    = document.getElementById('photo-mode-label');
  const btnLabel = document.getElementById('photo-capture-label');
  if (label)    label.innerHTML = 'AMBAS · Ajusta la vista 3D y pulsa <strong>Listo</strong>';
  if (btnLabel) btnLabel.textContent = 'LISTO';

  overlay?.classList.remove('hidden');

  document.getElementById('photo-capture-btn').addEventListener('click', async () => {
    // Restaurar etiquetas para próximos usos normales
    if (label)    label.innerHTML = 'MODO FOTO · Ajusta la vista ISO y pulsa <strong>Foto</strong>';
    if (btnLabel) btnLabel.textContent = 'FOTO';
    hidePhotoModeOverlay();
    openPreviewShell('Generando PDF con Plano + 3D...');

    try {
      const isoDataUrl = await captureHighResSceneDataUrl('3d');
      await buildAndPreviewDual(_ambasPlanoDataUrl, isoDataUrl);
    } catch (error) {
      handlePreviewError(error);
    } finally {
      _ambasPlanoDataUrl = null;
    }
  }, { once: true });

  document.getElementById('photo-cancel-btn').addEventListener('click', () => {
    if (label)    label.innerHTML = 'MODO FOTO · Ajusta la vista ISO y pulsa <strong>Foto</strong>';
    if (btnLabel) btnLabel.textContent = 'FOTO';
    _ambasPlanoDataUrl = null;
  }, { once: true });
}

async function buildAndPreviewDual(planoDataUrl, isoDataUrl) {
  PlanningRegistry.record('export');
  const modeLabel = 'AMBAS · Plano + 3D';
  const pdfResult = await buildPdfBlobDual(planoDataUrl, isoDataUrl, modeLabel);
  const result = exportIntent.kind === 'inventory'
    ? attachInventoryDownload(pdfResult, modeLabel)
    : pdfResult;
  const syncPromise = persistExport(modeLabel, result);
  await renderPreview(result, modeLabel);
  await syncPromise;
}

async function buildPdfBlobDual(planoDataUrl, isoDataUrl, modeLabel) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const total = 3;

  await _addPdfPage(pdf, planoDataUrl, 'Plano', 'Vista cenital', modeLabel, 1, total);
  pdf.addPage();
  await _addPdfPage(pdf, isoDataUrl, '3D', 'Vista isometrica', modeLabel, 2, total);
  pdf.addPage();
  _addInventoryPage(pdf, modeLabel, 3, total);

  const company = AppState.company || {};
  const safeName = (company.name || 'escale')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const filename = `${safeName || 'escale'}_ambas_${Date.now()}.pdf`;
  const blob = pdf.output('blob');
  return { blob, filename };
}

async function _addPdfPage(pdf, imageDataUrl, viewLabel, cameraLabel, modeLabel, pageNum, totalPages) {
  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 12;
  const company = AppState.company || {};
  const eventName = document.getElementById('inventory-event-name')?.value?.trim() || '';
  const brandPrimary   = parseColor(company.colorPrimary,   [37, 99, 235]);
  const brandSecondary = [0, 0, 0];

  let headX = margin;
  if (company.logo) {
    try {
      const logoImage = await loadImage(company.logo);
      const logoHeight = 9;
      const logoWidth  = (logoImage.naturalWidth / logoImage.naturalHeight) * logoHeight;
      const format     = company.logo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      pdf.addImage(company.logo, format, headX, margin, logoWidth, logoHeight);
      headX += logoWidth + 4;
    } catch (_) {}
  }

  const displayName = getCompanyDisplayName(company);
  if (displayName) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    setPdfColor(pdf, brandPrimary);
    pdf.text(displayName, headX, margin + 6);
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  pdf.text(`Planificador 3D · ${modeLabel}`, margin, margin + 11);

  let infoY = margin + 15;
  if (eventName) { pdf.text(`Evento: ${eventName}`, margin, infoY); infoY += 4; }
  if (company.venueName) { pdf.text(`Lugar: ${company.venueName}`, margin, infoY); infoY += 4; }

  const now = new Date();
  const dateText = `${now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  pdf.text(dateText, pageWidth - margin, margin + 6, { align: 'right' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  setPdfColor(pdf, brandSecondary);
  pdf.text(viewLabel, pageWidth - margin, margin + 13, { align: 'right' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  pdf.text(cameraLabel, pageWidth - margin, margin + 18, { align: 'right' });

  const separatorY = Math.max(margin + 18, infoY + 1);
  setPdfColor(pdf, brandPrimary, 'draw');
  pdf.setLineWidth(0.3);
  pdf.line(margin, separatorY, pageWidth - margin, separatorY);

  const imageArea = { x: margin, y: separatorY + 6, w: pageWidth - margin * 2, h: pageHeight - separatorY - margin - 12 };
  const image = await loadImage(imageDataUrl);
  const imageRatio = image.width / image.height;
  const areaRatio  = imageArea.w / imageArea.h;
  const drawW = imageRatio > areaRatio ? imageArea.w : imageArea.h * imageRatio;
  const drawH = imageRatio > areaRatio ? imageArea.w / imageRatio : imageArea.h;
  const drawX = imageArea.x + (imageArea.w - drawW) / 2;
  const drawY = imageArea.y + (imageArea.h - drawH) / 2;

  setPdfColor(pdf, brandPrimary, 'draw');
  pdf.setLineWidth(0.2);
  pdf.rect(drawX - 1, drawY - 1, drawW + 2, drawH + 2);
  pdf.addImage(imageDataUrl, 'PNG', drawX, drawY, drawW, drawH, undefined, 'NONE');

  if (SubscriptionManager.currentPlanCode() === 'free_lite') {
    const PX = 4;
    const wmCanvas = document.createElement('canvas');
    wmCanvas.width  = Math.round(pageWidth  * PX);
    wmCanvas.height = Math.round(pageHeight * PX);
    const wmCtx = wmCanvas.getContext('2d');
    wmCtx.save();
    wmCtx.globalAlpha = 0.15;
    wmCtx.translate(wmCanvas.width / 2, wmCanvas.height / 2);
    wmCtx.rotate(-Math.PI / 8);
    wmCtx.fillStyle = '#0f172a';
    wmCtx.font = `bold ${Math.round(wmCanvas.width / 9)}px Inter Tight, Arial, sans-serif`;
    wmCtx.textAlign = 'center';
    wmCtx.textBaseline = 'middle';
    wmCtx.fillText('Escale3D.com', 0, 0);
    wmCtx.restore();
    pdf.addImage(wmCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'NONE');
  }

  pdf.setFontSize(7);
  setPdfColor(pdf, brandSecondary);
  const footerBits = ['Powered by E-scale.com'];
  if (company.venueName) footerBits.push(company.venueName);
  if (company.email) footerBits.push(company.email);
  pdf.text(footerBits.join(' · '), margin, pageHeight - 5);
  pdf.text(`Pagina ${pageNum} / ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
}

function _addInventoryPage(pdf, modeLabel, pageNum, totalPages) {
  const pageWidth  = 297;
  const pageHeight = 210;
  const margin     = 12;
  const company    = AppState.company || {};
  const eventName  = document.getElementById('inventory-event-name')?.value?.trim() || '';
  const brandPrimary   = parseColor(company.colorPrimary,   [37, 99, 235]);
  const brandSecondary = [0, 0, 0];

  // Header
  let headX = margin;
  // (logo se omite aquí para evitar async — ya cargado en páginas anteriores)
  const displayName = getCompanyDisplayName(company);
  if (displayName) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    setPdfColor(pdf, brandPrimary);
    pdf.text(displayName, headX, margin + 6);
  }
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  pdf.text(`Planificador 3D · ${modeLabel}`, margin, margin + 11);

  let infoY = margin + 15;
  if (eventName) { pdf.text(`Evento: ${eventName}`, margin, infoY); infoY += 4; }
  if (company.venueName) { pdf.text(`Lugar: ${company.venueName}`, margin, infoY); infoY += 4; }

  const now = new Date();
  const dateText = `${now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  pdf.text(dateText, pageWidth - margin, margin + 6, { align: 'right' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  setPdfColor(pdf, brandSecondary);
  pdf.text('Inventario', pageWidth - margin, margin + 13, { align: 'right' });

  const separatorY = Math.max(margin + 18, infoY + 1);
  setPdfColor(pdf, brandPrimary, 'draw');
  pdf.setLineWidth(0.3);
  pdf.line(margin, separatorY, pageWidth - margin, separatorY);

  // Inventario en dos columnas
  const col1X = margin;
  const col2X = margin + (pageWidth - margin * 2) / 2 + 4;
  const cols  = [col1X, col2X];
  let colIdx  = 0;
  let invY    = separatorY + 8;
  const bottomLimit = pageHeight - 16;

  // PAX total
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  setPdfColor(pdf, brandPrimary);
  pdf.text(String(getInventoryTotalPax(AppState.items)), col1X, invY + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(100);
  pdf.text('PAX TOTAL', col1X + 18, invY + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text(`${getInventoryTotalItems(AppState.items)} elementos`, col1X + 18, invY + 10);
  invY += 16;

  groupInventoryLines(AppState.items).forEach(group => {
    // Si no cabe la cabecera en la columna actual, saltar a la siguiente
    if (invY + 10 > bottomLimit && colIdx === 0) {
      colIdx = 1;
      invY   = separatorY + 8;
    }
    const cx = cols[colIdx];

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    setPdfColor(pdf, brandSecondary);
    pdf.text(group.label.toUpperCase(), cx, invY);
    setPdfColor(pdf, brandSecondary, 'draw');
    pdf.setLineWidth(0.1);
    pdf.line(cx, invY + 0.8, cx + (pageWidth - margin * 2) / 2 - 8, invY + 0.8);
    invY += 4;

    group.lines.forEach(line => {
      if (invY > bottomLimit) return;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      setPdfColor(pdf, brandPrimary);
      pdf.text(`${line.count}x`, cx, invY);
      pdf.text(truncateLabel(pdf, line.label, 52), cx + 6, invY);
      setPdfColor(pdf, brandSecondary);
      pdf.text(line.pax > 0 ? `${line.pax}p` : '-', cx + (pageWidth - margin * 2) / 2 - 10, invY, { align: 'right' });
      invY += 3.8;
    });
    invY += 2;
  });

  // Footer
  pdf.setFontSize(7);
  setPdfColor(pdf, brandSecondary);
  const footerBits = ['Powered by E-scale.com'];
  if (company.venueName) footerBits.push(company.venueName);
  if (company.email) footerBits.push(company.email);
  pdf.text(footerBits.join(' · '), margin, pageHeight - 5);
  pdf.text(`Pagina ${pageNum} / ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
}

export const ExportManager = {
  init,
  openModal,
  openDataModal,
  printPng,
  downloadInventoryCsv
};

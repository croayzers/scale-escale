import { AppState } from '../core/AppState.js';
import { SceneManager } from '../scene/SceneManager.js';
import { SubscriptionManager } from '../services/SubscriptionManager.js';
import { ServiceConfig } from '../services/ServiceConfig.js';
import { CloudSync } from '../services/CloudSync.js';
import { AnalyticsManager } from '../services/AnalyticsManager.js';
import { CompanyManager } from './CompanyManager.js';

const TABLE_TYPES = ['mesa', 'mesaRect', 'mesaImperial', 'mesaCurva', 'mesaSerpentina'];

let invitation = null;
let previewState = null;
let lastOptions = null;

function init() {
  document.addEventListener('escale:share-planning', openModal);

  document.getElementById('share-close')?.addEventListener('click', closeModal);
  document.getElementById('share-cancel')?.addEventListener('click', closeModal);
  document.getElementById('share-send')?.addEventListener('click', buildAndPreviewShare);

  document.getElementById('share-invite-load')?.addEventListener('click', () => {
    document.getElementById('share-invite-file')?.click();
  });
  document.getElementById('share-invite-file')?.addEventListener('change', handleInvitationFile);
  document.getElementById('share-invite-clear')?.addEventListener('click', clearInvitation);

  document.getElementById('share-preview-close')?.addEventListener('click', closePreview);
  document.getElementById('share-preview-cancel')?.addEventListener('click', closePreview);
  document.getElementById('share-preview-download')?.addEventListener('click', downloadPreview);
  document.getElementById('share-preview-accept')?.addEventListener('click', prepareEmails);

  document.getElementById('share-modal')?.addEventListener('click', event => {
    if (event.target.id === 'share-modal') closeModal();
  });
  document.getElementById('share-preview-modal')?.addEventListener('click', event => {
    if (event.target.id === 'share-preview-modal') closePreview();
  });
}

function openModal() {
  // Gate: si faltan datos de empresa, abrimos primero ese modal
  CompanyManager.requireReady(_showShareModal);
}

function _showShareModal() {
  updateRecipientSummary();
  document.getElementById('share-modal')?.classList.add('visible');
  if (window.lucide) lucide.createIcons();
}

function closeModal() {
  document.getElementById('share-modal')?.classList.remove('visible');
}

function openPreviewShell(message = 'Preparando PDF...') {
  const modal = document.getElementById('share-preview-modal');
  const pages = document.getElementById('share-preview-pages');
  const meta = document.getElementById('share-preview-meta');
  if (!modal || !pages || !meta) return;

  modal.classList.add('visible');
  pages.innerHTML = `<div class="export-preview-loading mono text-[11px] tracking-widest uppercase">${message}</div>`;
  meta.textContent = 'Generando PDF de invitaciones.';
}

function closePreview() {
  document.getElementById('share-preview-modal')?.classList.remove('visible');
  document.getElementById('share-preview-pages').innerHTML = '';
  document.getElementById('share-preview-meta').textContent = '';
  if (previewState?.url) URL.revokeObjectURL(previewState.url);
  previewState = null;
}

function getShareOptions() {
  return {
    showGuests: document.getElementById('share-show-guests')?.checked !== false,
    showTables: document.getElementById('share-show-tables')?.checked !== false,
    publicLink: document.getElementById('share-public-link')?.value?.trim() || ''
  };
}

async function handleInvitationFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  try {
    const dataUrl = await fileToImageDataUrl(file);
    invitation = { name: file.name, dataUrl };
    document.getElementById('share-invite-status').textContent = file.name;
    document.getElementById('share-invite-clear')?.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    alert('No se pudo cargar la invitacion.');
  }
}

function clearInvitation() {
  invitation = null;
  document.getElementById('share-invite-status').textContent = 'Sin invitacion cargada';
  document.getElementById('share-invite-clear')?.classList.add('hidden');
}

async function fileToImageDataUrl(file) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    if (!window.pdfjsLib) throw new Error('PDF.js no esta disponible.');
    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function tableItems() {
  return AppState.items.filter(item => TABLE_TYPES.includes(item.type));
}

function assignedGuests() {
  return tableItems().flatMap(table => {
    const guests = Array.isArray(table.guests) ? table.guests : [];
    return guests.map((guest, index) => ({
      ...guest,
      seatIndex: index,
      tableId: table.id,
      tableName: table.tableName || `Mesa ${table.id}`
    }));
  });
}

function updateRecipientSummary() {
  const guests = assignedGuests();
  const withEmail = guests.filter(guest => guest.email);
  const label = `${withEmail.length} invitados con email · ${guests.length} nombres asignados`;
  const el = document.getElementById('share-recipient-summary');
  if (el) el.textContent = label;
}

async function buildAndPreviewShare() {
  closeModal();
  openPreviewShell();
  lastOptions = getShareOptions();

  try {
    const planImage = await capturePlanWithLabels(lastOptions);
    const result = await buildSharePdfBlob(planImage, lastOptions);
    await renderPreview(result);
  } catch (error) {
    console.error(error);
    closePreview();
    alert('No se pudo generar el PDF de invitaciones.');
  }
}

async function capturePlanWithLabels(options) {
  const previousCamera = AppState.camera;
  SceneManager.setCamera('top');
  document.getElementById('cam-top')?.classList.add('active');
  document.getElementById('cam-iso')?.classList.remove('active');

  await nextFrame();
  SceneManager.renderer.render(SceneManager.scene, SceneManager.activeCam);

  const src = SceneManager.renderer.domElement;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#f5f3ee';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);

  if (options.showTables || options.showGuests) drawSeatLabels(ctx, out, options);

  if (previousCamera && previousCamera !== 'top') {
    SceneManager.setCamera(previousCamera);
    document.getElementById('cam-iso')?.classList.toggle('active', previousCamera === 'iso');
    document.getElementById('cam-top')?.classList.toggle('active', previousCamera === 'top');
  }

  return out.toDataURL('image/png');
}

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function drawSeatLabels(ctx, canvas, options) {
  tableItems().forEach(table => {
    if (options.showTables && table.tableName) {
      drawLabel(ctx, worldToCanvas(table.x, table.z, canvas), table.tableName, {
        size: 24,
        weight: 700,
        align: 'center'
      });
    }

    if (!options.showGuests) return;

    const guests = Array.isArray(table.guests) ? table.guests : [];
    if (!guests.length) return;

    const seats = getSeatPositions(table);
    guests.slice(0, seats.length).forEach((guest, index) => {
      if (!guest?.name) return;
      const point = worldToCanvas(seats[index].x, seats[index].z, canvas);
      drawLabel(ctx, point, guest.name, { size: 22, weight: 600, align: 'center' });
    });
  });
}

function worldToCanvas(x, z, canvas) {
  const vec = new THREE.Vector3(x, 0, z);
  vec.project(SceneManager.activeCam);
  return {
    x: (vec.x * 0.5 + 0.5) * canvas.width,
    y: (-vec.y * 0.5 + 0.5) * canvas.height
  };
}

function drawLabel(ctx, point, text, opts = {}) {
  const label = String(text || '').trim();
  if (!label) return;
  ctx.save();
  ctx.font = `${opts.weight || 600} ${opts.size || 20}px Georgia, serif`;
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.92)';
  ctx.shadowColor = 'rgba(255,255,255,0.85)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillText(label, point.x, point.y);
  ctx.restore();
}

function rotateLocal(item, lx, lz) {
  const rot = item.rotY || 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    x: item.x + lx * c - lz * s,
    z: item.z + lx * s + lz * c
  };
}

function getSeatPositions(item) {
  if (item.type === 'mesa') {
    if (item.subtype === 'presi') return getPresiSeats(item);
    const chairs = Math.max(0, item.chairs || 0);
    const radius = (item.dims?.diameter || 1.8) / 2 + 0.35;
    return Array.from({ length: chairs }, (_, index) => {
      const angle = (index / chairs) * Math.PI * 2;
      return rotateLocal(item, Math.cos(angle) * radius, Math.sin(angle) * radius);
    });
  }

  if (item.type === 'mesaRect' || item.type === 'mesaImperial') return getRectSeats(item);
  if (item.type === 'mesaCurva') return getCurveSeats(item);
  if (item.type === 'mesaSerpentina') return getSerpentineSeats(item);
  return [];
}

function getPresiSeats(item) {
  const seats = [];
  const L = item.dims?.length || 2.0;
  const W = item.dims?.width || 1.2;
  const sideChairs = 4;
  const sideOffsetZ = W / 2 + 0.32;

  for (let i = 0; i < sideChairs; i += 1) {
    const t = (i + 0.5) / sideChairs;
    const x = -L / 2 + t * L;
    seats.push(rotateLocal(item, x, sideOffsetZ));
    seats.push(rotateLocal(item, x, -sideOffsetZ));
  }

  const endOffsetX = L / 2 + 0.32;
  if (item.endHead !== false) seats.push(rotateLocal(item, endOffsetX, 0));
  if (item.endFoot !== false) seats.push(rotateLocal(item, -endOffsetX, 0));
  return seats;
}

function getRectSeats(item) {
  const seats = [];
  const L = item.dims?.length || 1.8;
  const W = item.dims?.width || 0.9;
  const sep = item.chairSep || 0.6;
  const sideChairs = Math.max(1, Math.floor(L / sep));
  const offsetZ = W / 2 + 0.32;

  for (let i = 0; i < sideChairs; i += 1) {
    const t = (i + 0.5) / sideChairs;
    const x = -L / 2 + t * L;
    seats.push(rotateLocal(item, x, offsetZ));
    seats.push(rotateLocal(item, x, -offsetZ));
  }
  return seats;
}

function getCurveSeats(item, localOffset = { x: 0, z: 0 }, extraRot = 0) {
  const rIn = item.dims?.radioInt || 2.0;
  const width = item.dims?.anchoTab || 0.7;
  const angleDeg = item.dims?.anguloDeg || 90;
  const sep = item.chairSep || 0.6;
  const dist = item.distrib || 'externa';
  const rOut = rIn + width;
  const angle = angleDeg * Math.PI / 180;
  const arcLen = ((rIn + rOut) / 2) * angle;
  const nChairs = Math.max(1, Math.floor(arcLen / sep));
  const seats = [];

  const addArc = radius => {
    for (let i = 0; i < nChairs; i += 1) {
      const t = (i + 0.5) / nChairs;
      const a = -angle / 2 + t * angle + extraRot;
      const lx = localOffset.x + Math.cos(a) * radius;
      const lz = localOffset.z + Math.sin(a) * radius;
      seats.push(rotateLocal(item, lx, lz));
    }
  };

  if (dist === 'externa' || dist === 'ambas') addArc(rOut + 0.32);
  if (dist === 'interna' || dist === 'ambas') addArc(rIn - 0.32);
  return seats;
}

function getSerpentineSeats(item) {
  const first = getCurveSeats(item);
  const angle = (item.dims?.anguloDeg || 60) * Math.PI / 180;
  const r = (item.dims?.radioInt || 2.0) + (item.dims?.anchoTab || 0.7) / 2;
  const xOff = 4 * r * Math.sin(angle / 2);
  const secondCfg = {
    ...item,
    distrib: item.distrib === 'interna' ? 'externa' : item.distrib === 'externa' ? 'interna' : item.distrib
  };
  const second = getCurveSeats(secondCfg, { x: xOff, z: 0 }, Math.PI);
  return [...first, ...second];
}

async function buildSharePdfBlob(planImageDataUrl, options) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 12;
  const company = AppState.company || {};
  const eventName = document.getElementById('inventory-event-name')?.value?.trim() || 'Evento';

  if (invitation?.dataUrl) {
    await addImagePage(pdf, invitation.dataUrl, pageWidth, pageHeight, margin, false);
    pdf.addPage();
  }

  await addHeader(pdf, 'Invitaciones · Plano de mesas', eventName, margin, pageWidth);
  const imageArea = { x: margin, y: 32, w: 206, h: 164 };
  await addImageIntoRect(pdf, planImageDataUrl, imageArea, true);

  const sideX = 232;
  let y = 42;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 0, 0);
  pdf.text('INVITADOS', sideX, y);
  y += 6;

  const guests = assignedGuests();
  const withEmail = guests.filter(guest => guest.email);
  pdf.setFontSize(24);
  pdf.text(String(guests.length), sideX, y + 8);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(90);
  pdf.text('NOMBRES ASIGNADOS', sideX + 22, y + 8);
  y += 18;

  tableItems().forEach(table => {
    const names = Array.isArray(table.guests) ? table.guests.filter(guest => guest.name) : [];
    if (!names.length || y > 186) return;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(120, 0, 0);
    pdf.text(table.tableName || `Mesa ${table.id}`, sideX, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(90);
    pdf.text(`${names.length}p`, pageWidth - margin, y, { align: 'right' });
    y += 4;
    names.slice(0, 8).forEach(guest => {
      if (y > 190) return;
      pdf.setFontSize(6.5);
      pdf.setTextColor(70);
      pdf.text(truncateText(pdf, guest.name, 45), sideX + 2, y);
      y += 3.3;
    });
    y += 2;
  });

  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(6);
  pdf.setTextColor(150);
  const note = options.publicLink
    ? 'El email incluira el link publico configurado.'
    : 'PDF generado localmente. Adjuntalo o subelo para obtener un link publico.';
  pdf.text(note, sideX, 198, { maxWidth: 52 });

  const safeName = eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'evento';
  return {
    blob: pdf.output('blob'),
    filename: `escale_invitaciones_${safeName}_${Date.now()}.pdf`,
    recipients: withEmail
  };
}

async function addHeader(pdf, label, eventName, margin, pageWidth) {
  const company = AppState.company || {};
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(120, 0, 0);
  pdf.text('E-scale', margin, margin + 6);

  let headX = margin + pdf.getTextWidth('E-scale') + 5;
  if (company.logo) {
    try {
      const logoImage = await loadImage(company.logo);
      const logoHeight = 9;
      const logoWidth = (logoImage.naturalWidth / logoImage.naturalHeight) * logoHeight;
      const format = company.logo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      pdf.addImage(company.logo, format, headX, margin, logoWidth, logoHeight);
      headX += logoWidth + 4;
    } catch (error) {
      console.warn('No se pudo cargar logo en invitacion:', error);
    }
  }

  if (company.name) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(13);
    pdf.text(company.name, headX, margin + 6);
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  pdf.text(`Planificador 3D · ${label}`, margin, margin + 11);
  pdf.text(`Evento: ${eventName}`, margin, margin + 15);
  if (company.venue) pdf.text(`Lugar: ${company.venue}`, margin, margin + 19);

  const now = new Date();
  const dateText = `${now.toLocaleDateString('es-ES')} · ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  pdf.text(dateText, pageWidth - margin, margin + 6, { align: 'right' });
  if (company.email) pdf.text(company.email, pageWidth - margin, margin + 11, { align: 'right' });

  pdf.setDrawColor(120, 0, 0);
  pdf.setLineWidth(0.3);
  pdf.line(margin, 28, pageWidth - margin, 28);
}

async function addImagePage(pdf, dataUrl, pageWidth, pageHeight, margin) {
  await addImageIntoRect(pdf, dataUrl, {
    x: margin,
    y: margin,
    w: pageWidth - margin * 2,
    h: pageHeight - margin * 2
  }, false);
}

async function addImageIntoRect(pdf, dataUrl, area, border) {
  const image = await loadImage(dataUrl);
  const imageRatio = image.width / image.height;
  const areaRatio = area.w / area.h;
  let drawW;
  let drawH;

  if (imageRatio > areaRatio) {
    drawW = area.w;
    drawH = drawW / imageRatio;
  } else {
    drawH = area.h;
    drawW = drawH * imageRatio;
  }

  const drawX = area.x + (area.w - drawW) / 2;
  const drawY = area.y + (area.h - drawH) / 2;
  if (border) {
    pdf.setDrawColor(120, 0, 0);
    pdf.setLineWidth(0.2);
    pdf.rect(drawX - 1, drawY - 1, drawW + 2, drawH + 2);
  }
  pdf.addImage(dataUrl, imageFormat(dataUrl), drawX, drawY, drawW, drawH);
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function imageFormat(dataUrl) {
  if (String(dataUrl).startsWith('data:image/jpeg')) return 'JPEG';
  if (String(dataUrl).startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

function truncateText(pdf, text, maxWidth) {
  let output = String(text || '');
  while (pdf.getTextWidth(output) > maxWidth && output.length > 8) output = output.slice(0, -1);
  return output === text ? output : `${output}...`;
}

async function renderPreview(result) {
  if (previewState?.url) URL.revokeObjectURL(previewState.url);
  previewState = { ...result, url: URL.createObjectURL(result.blob) };

  const pagesHost = document.getElementById('share-preview-pages');
  const meta = document.getElementById('share-preview-meta');
  if (!pagesHost || !meta) return;

  meta.textContent = `${result.filename} · ${result.recipients.length} destinatarios`;
  pagesHost.innerHTML = '';

  const pdfData = await result.blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.35 });
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

function downloadPreview() {
  if (!previewState?.url || !previewState?.filename) return;
  const link = document.createElement('a');
  link.href = previewState.url;
  link.download = previewState.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function prepareEmails() {
  if (!previewState) return;
  downloadPreview();

  if (!SubscriptionManager.ensureFeature('emailPdfToClient')) return;

  const recipients = previewState.recipients.map(guest => guest.email).filter(Boolean);
  if (!recipients.length) {
    alert('PDF descargado. No hay invitados con email asignado.');
    return;
  }

  const eventName = document.getElementById('inventory-event-name')?.value?.trim() || 'evento';
  const company = AppState.company || {};
  const subject = `Invitacion ${eventName} · Planning de mesas`;
  const link = lastOptions?.publicLink || '';
  const bodyText = link
    ? `Hola,\n\nTe compartimos el planning de mesas del evento ${eventName}.\n\nPDF: ${link}\n\nEn el plano podras localizar tu mesa, tu silla y las personas con las que compartes mesa.\n\n${company.name || 'E-scale'}`
    : `Hola,\n\nTe compartimos el planning de mesas del evento ${eventName}.\n\nAdjuntamos el PDF generado con la ubicacion de sillas y nombres.\n\nEn el plano podras localizar tu mesa, tu silla y las personas con las que compartes mesa.\n\n${company.name || 'E-scale'}`;

  if (ServiceConfig.hasFeature('emailDelivery')) {
    void CloudSync.sendGuestPlanningEmail({
      blob: previewState.blob,
      filename: previewState.filename,
      recipients,
      eventName,
      publicLink: link
    }).then(response => {
      if (response?.ok) {
        alert(`Emails enviados a ${recipients.length} destinatarios.`);
      }
    }).catch(error => {
      console.warn('No se pudo enviar el planning por email desde cloud, se usa fallback mailto:', error);
      fallbackMailto(recipients, subject, bodyText);
    });
    void AnalyticsManager.track('share_email_requested', {
      recipientCount: recipients.length,
      cloudDelivery: true
    });
    return;
  }

  void AnalyticsManager.track('share_email_requested', {
    recipientCount: recipients.length,
    cloudDelivery: false
  });
  fallbackMailto(recipients, subject, bodyText);
}

function fallbackMailto(recipients, subject, bodyText) {
  const chunks = chunk(recipients, 30);
  chunks.forEach((emails, index) => {
    const mailto = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    setTimeout(() => window.open(mailto, '_blank'), index * 400);
  });
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export const ShareManager = { init };

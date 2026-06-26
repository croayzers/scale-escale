/* ─────────────────────────────────────────────────────────
   FILE LIBRARY PANEL — Biblioteca de archivos de la org.
   Soporta PDFs e imágenes. Slide-in desde la derecha.
   ───────────────────────────────────────────────────────── */

import { FileLibrary } from '../services/FileLibrary.js';

let _panel = null;
let _grid = null;
let _pdfModal = null;
let _imgModal = null;
let _files = [];
let _open = false;

function _toast(msg, kind = 'info') {
  document.dispatchEvent(new CustomEvent('escale:toast', { detail: { msg, kind } }));
}

function _spinner() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin .8s linear infinite;display:block;margin:0 auto"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
}

export function init() {
  _panel = document.getElementById('file-library-panel');
  _grid  = document.getElementById('file-library-grid');
  _pdfModal = document.getElementById('file-pdf-modal');
  _imgModal = document.getElementById('file-img-modal');
  if (!_panel || !_grid) return;

  // Botón abrir
  const btnOpen = document.getElementById('btn-file-library');
  if (btnOpen) btnOpen.addEventListener('click', toggle);

  // Cerrar panel
  document.getElementById('file-library-close')?.addEventListener('click', close);

  // Upload via click
  document.getElementById('file-upload-input')?.addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) _handleUpload(files);
  });

  // Drag & drop en la zona
  const dropZone = document.getElementById('file-upload-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('fl-drop-active'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('fl-drop-active'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('fl-drop-active');
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) _handleUpload(files);
    });
  }

  // Cerrar modales
  document.getElementById('file-pdf-close')?.addEventListener('click', _closePdfModal);
  document.getElementById('file-img-close')?.addEventListener('click', _closeImgModal);
  _pdfModal?.addEventListener('click', e => { if (e.target === _pdfModal) _closePdfModal(); });
  _imgModal?.addEventListener('click', e => { if (e.target === _imgModal) _closeImgModal(); });
}

export function toggle() { _open ? close() : open(); }

export async function open() {
  if (!_panel) return;
  _open = true;
  _panel.style.display = 'flex';
  requestAnimationFrame(() => _panel.classList.add('fl-panel-open'));
  await _loadFiles();
}

export function close() {
  if (!_panel) return;
  _open = false;
  _panel.classList.remove('fl-panel-open');
  setTimeout(() => { if (!_open) _panel.style.display = 'none'; }, 260);
}

async function _loadFiles() {
  if (!_grid) return;
  if (!FileLibrary.canSync()) {
    _grid.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:24px">Inicia sesión para ver tus archivos.</div>';
    return;
  }
  _grid.innerHTML = `<div style="padding:24px;text-align:center">${_spinner()}</div>`;
  try {
    _files = await FileLibrary.listFiles();
    _renderGrid();
  } catch (err) {
    _grid.innerHTML = `<div style="color:#ef4444;font-size:13px;text-align:center;padding:24px">Error cargando archivos: ${err.message}</div>`;
  }
}

function _renderGrid() {
  if (!_grid) return;
  if (!_files.length) {
    _grid.innerHTML = `<div style="color:var(--muted);font-size:13px;text-align:center;padding:32px">
      <div style="font-size:28px;margin-bottom:8px">📁</div>
      Ningún archivo todavía. Sube PDFs o imágenes.</div>`;
    return;
  }
  _grid.innerHTML = _files.map((f, idx) => {
    const type = FileLibrary.getFileType(f);
    const name = FileLibrary.getFilename(f);
    const size = FileLibrary.formatSize(f.metadata?.size);
    const icon = type === 'pdf'
      ? `<div style="font-size:32px;line-height:1">📄</div>`
      : `<div class="fl-thumb-wrap"><div class="fl-thumb-loading">${_spinner()}</div></div>`;
    return `<div class="fl-card" data-idx="${idx}" data-type="${type}" data-path="${f.name}">
      <div class="fl-card-preview">${icon}</div>
      <div class="fl-card-info">
        <div class="fl-card-name" title="${name}">${name}</div>
        ${size ? `<div class="fl-card-size">${size}</div>` : ''}
      </div>
      <button class="fl-card-del" data-idx="${idx}" title="Eliminar">✕</button>
    </div>`;
  }).join('');

  // Cargar thumbnails de imágenes
  _grid.querySelectorAll('.fl-card[data-type="image"]').forEach(card => {
    const idx = parseInt(card.dataset.idx);
    const file = _files[idx];
    const wrap = card.querySelector('.fl-thumb-wrap');
    if (!wrap || !file?.name) return;
    FileLibrary.getViewUrl(file.name).then(url => {
      if (!url) return;
      const img = document.createElement('img');
      img.src = url;
      img.className = 'fl-thumb-img';
      img.alt = FileLibrary.getFilename(file);
      img.onload = () => { wrap.innerHTML = ''; wrap.appendChild(img); };
      img.onerror = () => { wrap.innerHTML = '<div style="font-size:24px">🖼️</div>'; };
    }).catch(() => {
      wrap.innerHTML = '<div style="font-size:24px">🖼️</div>';
    });
  });

  // Click para ver
  _grid.querySelectorAll('.fl-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('fl-card-del')) return;
      const idx = parseInt(card.dataset.idx);
      const type = card.dataset.type;
      const file = _files[idx];
      if (!file?.name) return;
      if (type === 'pdf') _openPdf(file);
      else _openImage(file);
    });
  });

  // Click borrar
  _grid.querySelectorAll('.fl-card-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const file = _files[idx];
      if (!file?.name) return;
      if (!confirm(`¿Eliminar "${FileLibrary.getFilename(file)}"?`)) return;
      _deleteFile(file, idx);
    });
  });
}

async function _handleUpload(files) {
  for (const file of files) {
    const zone = document.getElementById('file-upload-zone');
    if (zone) zone.innerHTML = `<div style="color:var(--muted);font-size:12px;text-align:center">${_spinner()}<span style="margin-top:6px;display:block">Subiendo ${file.name}…</span></div>`;
    try {
      await FileLibrary.uploadFile(file);
      _toast(`"${file.name}" subido correctamente`, 'ok');
    } catch (err) {
      _toast(`Error subiendo "${file.name}": ${err.message}`, 'error');
    }
  }
  // Restaurar zona y recargar
  const zone = document.getElementById('file-upload-zone');
  if (zone) zone.innerHTML = _uploadZoneHTML();
  if (window.lucide) lucide.createIcons({ nodes: [zone] });
  await _loadFiles();
}

async function _deleteFile(file, idx) {
  try {
    await FileLibrary.deleteFile(file.name);
    _files.splice(idx, 1);
    _renderGrid();
    _toast('Archivo eliminado', 'ok');
  } catch (err) {
    _toast(`Error eliminando: ${err.message}`, 'error');
  }
}

async function _openPdf(file) {
  if (!_pdfModal || typeof pdfjsLib === 'undefined') {
    const url = await FileLibrary.getViewUrl(file.name);
    if (url) window.open(url, '_blank');
    return;
  }
  const canvas = document.getElementById('file-pdf-canvas');
  const pageInfo = document.getElementById('file-pdf-page');
  if (!canvas) return;
  _pdfModal.style.display = 'flex';
  canvas.style.display = 'none';
  document.getElementById('file-pdf-spinner').style.display = 'block';
  try {
    const url = await FileLibrary.getViewUrl(file.name);
    if (!url) throw new Error('No se obtuvo URL');
    const pdf = await pdfjsLib.getDocument(url).promise;
    let currentPage = 1;
    const totalPages = pdf.numPages;

    async function renderPage(n) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      canvas.style.display = 'block';
      if (pageInfo) pageInfo.textContent = `Pág. ${n} / ${totalPages}`;
    }

    document.getElementById('file-pdf-spinner').style.display = 'none';
    document.getElementById('file-pdf-title').textContent = FileLibrary.getFilename(file);
    await renderPage(currentPage);

    document.getElementById('file-pdf-prev')?.addEventListener('click', async () => {
      if (currentPage > 1) { currentPage--; await renderPage(currentPage); }
    });
    document.getElementById('file-pdf-next')?.addEventListener('click', async () => {
      if (currentPage < totalPages) { currentPage++; await renderPage(currentPage); }
    });
    // Abrir en nueva pestaña
    document.getElementById('file-pdf-open')?.addEventListener('click', () => window.open(url, '_blank'));
  } catch (err) {
    document.getElementById('file-pdf-spinner').style.display = 'none';
    canvas.style.display = 'block';
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    _toast(`Error abriendo PDF: ${err.message}`, 'error');
  }
}

function _closePdfModal() {
  if (_pdfModal) _pdfModal.style.display = 'none';
}

async function _openImage(file) {
  if (!_imgModal) return;
  const img = document.getElementById('file-img-viewer');
  if (!img) return;
  img.src = '';
  _imgModal.style.display = 'flex';
  document.getElementById('file-img-title').textContent = FileLibrary.getFilename(file);
  try {
    const url = await FileLibrary.getViewUrl(file.name);
    if (!url) throw new Error('Sin URL');
    img.src = url;
  } catch (err) {
    _toast(`Error abriendo imagen: ${err.message}`, 'error');
    _closeImgModal();
  }
}

function _closeImgModal() {
  if (_imgModal) _imgModal.style.display = 'none';
}

function _uploadZoneHTML() {
  return `<i data-lucide="upload-cloud" style="width:24px;height:24px;display:block;margin:0 auto 8px;opacity:.5"></i>
    <span style="font-size:12px;color:var(--muted)">Arrastra o <label for="file-upload-input" style="cursor:pointer;color:var(--brand-primary,#7c3aed);text-decoration:underline">elige archivos</label></span>
    <span style="font-size:11px;color:var(--muted);display:block;margin-top:4px">PDF, PNG, JPG, WebP · máx 20 MB</span>`;
}

export const FileLibraryPanel = { init, open, close, toggle };
window.FileLibraryPanel = FileLibraryPanel;

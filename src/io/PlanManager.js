/* ─────────────────────────────────────────────────────────
   PLAN MANAGER — Carga de plano base + Calibración
   ────────────────────────────────────────────────────────
   Formatos:
     · IMG  (PNG/JPG/WEBP): textura directa
     · PDF  (PDF.js):       rasteriza página 1
     · DXF  (dxf-parser):   vectorial con auto-fit de dimensiones
     · DWG  (binario):      intenta extraer thumbnail BMP embebido
   ───────────────────────────────────────────────────────── */

import { AppState }     from '../core/AppState.js';
import { SceneManager } from '../scene/SceneManager.js';

function init() {
  // ── Botón cargar plano → desplegable ──────────────────────────────────────
  document.getElementById('btn-upload-plan')?.addEventListener('click', e => {
    e.stopPropagation();
    togglePlanDropdown();
  });
  document.getElementById('plan-drop-upload')?.addEventListener('click', () => {
    closePlanDropdown();
    openFormatModal();
  });
  document.getElementById('plan-drop-search')?.addEventListener('click', () => {
    closePlanDropdown();
    openSearchModal();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#upload-plan-dropdown') && !e.target.closest('#btn-upload-plan')) {
      closePlanDropdown();
    }
  });

  document.getElementById('file-plan-img')?.addEventListener('change', handleImageFile);
  document.getElementById('file-plan-pdf')?.addEventListener('change', handlePdfFile);
  document.getElementById('file-plan-dwg')?.addEventListener('change', handleDwgFile);

  document.getElementById('plan-fmt-img')?.addEventListener('click', () => {
    closeFormatModal();
    document.getElementById('file-plan-img').click();
  });
  document.getElementById('plan-fmt-pdf')?.addEventListener('click', () => {
    closeFormatModal();
    document.getElementById('file-plan-pdf').click();
  });
  document.getElementById('plan-fmt-dwg')?.addEventListener('click', () => {
    closeFormatModal();
    showDwgInfo();
  });
  document.getElementById('plan-fmt-cancel')?.addEventListener('click', closeFormatModal);
  document.getElementById('dwg-info-close')?.addEventListener('click', () => {
    document.getElementById('dwg-info-modal').classList.remove('visible');
    document.getElementById('file-plan-dwg').click();
  });

  // ── Búsqueda de planos ────────────────────────────────────────────────────
  document.getElementById('plan-search-close')?.addEventListener('click', closeSearchModal);
  document.getElementById('plan-search-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('plan-search-modal')) closeSearchModal();
  });

  const searchInput = document.getElementById('plan-search-input');
  const clearBtn = document.getElementById('plan-search-clear');

  searchInput?.addEventListener('input', e => {
    clearBtn?.classList.toggle('hidden', !e.target.value.trim());
    scheduleSearch();
  });
  clearBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    clearBtn.classList.add('hidden');
    scheduleSearch();
    searchInput?.focus();
  });
  document.getElementById('plan-filter-city')?.addEventListener('change', scheduleSearch);
  document.getElementById('plan-filter-type')?.addEventListener('change', scheduleSearch);
  document.getElementById('plan-search-none-upload')?.addEventListener('click', () => {
    closeSearchModal();
    openFormatModal();
  });

  // Inputs de dimensiones (sidebar)
  document.getElementById('plan-width')?.addEventListener('input', e => {
    AppState.plan.widthM = Math.max(1, parseFloat(e.target.value) || 1);
    SceneManager.updatePlanSize();
  });
  document.getElementById('plan-length')?.addEventListener('input', e => {
    AppState.plan.lengthM = Math.max(1, parseFloat(e.target.value) || 1);
    SceneManager.updatePlanSize();
  });
  document.getElementById('plan-opacity')?.addEventListener('input', e => {
    AppState.plan.opacity = parseFloat(e.target.value);
    SceneManager.updatePlanOpacity(AppState.plan.opacity);
  });

  // Calibración
  document.getElementById('btn-calibrate')?.addEventListener('click', toggleCalibration);
  document.getElementById('cancel-calibration')?.addEventListener('click', cancelCalibration);
  emitCalibrationProgress();
}

// ── Plan dropdown ─────────────────────────────────────────────────────────────
function togglePlanDropdown() {
  const dropdown = document.getElementById('upload-plan-dropdown');
  if (!dropdown) return;
  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    const btn = document.getElementById('btn-upload-plan');
    const rect = btn.getBoundingClientRect();
    dropdown.style.top  = `${rect.bottom + 6}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
  }
}
function closePlanDropdown() {
  document.getElementById('upload-plan-dropdown')?.classList.add('hidden');
}

function openFormatModal() {
  document.getElementById('plan-format-modal')?.classList.add('visible');
}
function closeFormatModal() {
  document.getElementById('plan-format-modal')?.classList.remove('visible');
}
function showDwgInfo() {
  document.getElementById('dwg-info-modal')?.classList.add('visible');
}

// ── Plan search modal ─────────────────────────────────────────────────────────
let _searchTimer = null;

function openSearchModal() {
  const modal = document.getElementById('plan-search-modal');
  if (!modal) return;
  modal.classList.add('visible');
  showSearchState('empty');
  loadSearchFilters();
  setTimeout(() => document.getElementById('plan-search-input')?.focus(), 80);
}

function closeSearchModal() {
  const modal = document.getElementById('plan-search-modal');
  if (!modal) return;
  modal.classList.remove('visible');
  const inp = document.getElementById('plan-search-input');
  if (inp) inp.value = '';
  document.getElementById('plan-search-clear')?.classList.add('hidden');
  const cityEl = document.getElementById('plan-filter-city');
  const typeEl = document.getElementById('plan-filter-type');
  if (cityEl) cityEl.value = '';
  if (typeEl) typeEl.value = '';
  showSearchState('empty');
}

function showSearchState(state) {
  ['empty', 'loading', 'none', 'no-service', 'grid'].forEach(s => {
    document.getElementById(`plan-search-${s}`)?.classList.toggle('hidden', s !== state);
  });
}

function getSearchParams() {
  const q    = (document.getElementById('plan-search-input')?.value || '').trim();
  const city = document.getElementById('plan-filter-city')?.value  || '';
  const type = document.getElementById('plan-filter-type')?.value  || '';
  return { q, city, type };
}

function scheduleSearch() {
  clearTimeout(_searchTimer);
  const { q, city, type } = getSearchParams();
  if (!q && !city && !type) { showSearchState('empty'); return; }
  showSearchState('loading');
  _searchTimer = setTimeout(() => fetchPlans(q, city, type), 320);
}

async function fetchPlans(q, city, type) {
  const params = new URLSearchParams();
  if (q)    params.set('q',    q);
  if (city) params.set('city', city);
  if (type) params.set('type', type);

  try {
    const res = await fetch(`/api/plans/search?${params}`, {
      headers: { Accept: 'application/json' }
    });

    if (res.status === 404 || res.status === 503) {
      showSearchState('no-service');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const results = data.results ?? [];

    if (results.length === 0) {
      const term = document.getElementById('plan-search-term');
      if (term) term.textContent = q || city || type;
      showSearchState('none');
      return;
    }

    renderSearchResults(results);
  } catch {
    showSearchState('no-service');
  }
}

async function loadSearchFilters() {
  try {
    const res = await fetch('/api/plans/search?mode=filters', { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const data = await res.json();

    const cityEl = document.getElementById('plan-filter-city');
    const typeEl = document.getElementById('plan-filter-type');

    if (cityEl && data.cities?.length) {
      const prev = cityEl.value;
      cityEl.innerHTML = '<option value="">Ciudad…</option>';
      data.cities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        cityEl.appendChild(opt);
      });
      if (prev) cityEl.value = prev;
    }

    if (typeEl && data.types?.length) {
      const prev = typeEl.value;
      typeEl.innerHTML = '<option value="">Tipo…</option>';
      data.types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        typeEl.appendChild(opt);
      });
      if (prev) typeEl.value = prev;
    }
  } catch { /* filtros opcionales */ }
}

function renderSearchResults(results) {
  const grid = document.getElementById('plan-search-grid');
  if (!grid) return;
  grid.innerHTML = '';

  results.forEach(plan => {
    const card = document.createElement('button');
    card.className = 'plan-search-card';
    card.type = 'button';
    card.title = plan.venue_name;

    const thumb = plan.thumbnail_url || plan.image_url;
    card.innerHTML = `
      <div class="plan-search-thumb">
        ${thumb
          ? `<img src="${thumb}" alt="${plan.venue_name}" loading="lazy" onerror="this.parentElement.innerHTML='<i data-lucide=\\"map\\" class=\\"w-8 h-8 opacity-20\\"></i>'">`
          : '<i data-lucide="map" class="w-8 h-8 opacity-20"></i>'}
      </div>
      <div class="plan-search-card-info">
        <div class="plan-search-card-name">${plan.venue_name}</div>
        ${plan.zone ? `<div class="plan-search-card-zone">${plan.zone}</div>` : ''}
        ${plan.city ? `<div class="plan-search-card-city">${plan.city}</div>` : ''}
      </div>
    `;
    const label = plan.zone ? `${plan.venue_name} · ${plan.zone}` : plan.venue_name;
    card.addEventListener('click', () => loadPlanFromUrl(plan.image_url, label));
    grid.appendChild(card);
  });

  showSearchState('grid');
  if (window.lucide) lucide.createIcons({ nodes: [grid] });
}

async function loadPlanFromUrl(url, label) {
  closeSearchModal();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    applyImageToPlan(objectUrl, label ?? 'Biblioteca');
  } catch (err) {
    alert(`No se pudo cargar el plano: ${err.message}`);
  }
}

/* ── Aplicar imagen como textura ── */
function applyImageToPlan(imgSrc, formatLabel) {
  const img = new Image();
  img.onload = () => {
    const texture = new THREE.Texture(img);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.sRGBEncoding;
    SceneManager.setPlanTexture(texture);
    document.getElementById('plan-status').textContent = formatLabel;
  };
  img.onerror = () => alert('No se pudo cargar la imagen del plano.');
  img.src = imgSrc;
}

function hasExistingPlan() {
  return Boolean(AppState.plan.texture?.image);
}

function confirmOverwrite() {
  if (!hasExistingPlan()) return true;
  return confirm('Ya hay un plano cargado.\n\n¿Deseas reemplazarlo con el nuevo archivo?');
}

/* ── Handler IMG ── */
function handleImageFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirmOverwrite()) { e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = ev => applyImageToPlan(ev.target.result, 'IMG');
  reader.readAsDataURL(file);
  e.target.value = '';
}

/* ── Handler PDF ── */
async function handlePdfFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirmOverwrite()) { e.target.value = ''; return; }
  e.target.value = '';

  if (!window.pdfjsLib) {
    alert('PDF.js no se cargó correctamente. Revisa tu conexión.');
    return;
  }

  document.getElementById('plan-status').textContent = 'Procesando…';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const baseViewport = page.getViewport({ scale: 1 });
    const MAX_SIDE = 2400;
    const longSide = Math.max(baseViewport.width, baseViewport.height);
    const scale = Math.min(2.5, MAX_SIDE / longSide);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    applyImageToPlan(canvas.toDataURL('image/png'),
      `PDF · p.1 (${pdf.numPages} pág${pdf.numPages > 1 ? 's' : ''})`);
  } catch (err) {
    console.error(err);
    document.getElementById('plan-status').textContent = 'Vacío';
    alert('No se pudo procesar el PDF:\n' + (err.message || err));
  }
}

/* ── Handler DXF/DWG ── */
function handleDwgFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirmOverwrite()) { e.target.value = ''; return; }
  e.target.value = '';

  document.getElementById('plan-status').textContent = 'Procesando…';
  const isDxf = file.name.toLowerCase().endsWith('.dxf');

  if (isDxf) {
    file.text().then(text => parseDxfText(text)).catch(err => {
      console.error(err);
      document.getElementById('plan-status').textContent = 'Vacío';
      alert('No se pudo leer el archivo DXF:\n' + (err.message || err));
    });
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    const buffer = new Uint8Array(ev.target.result);
    const bmp = extractDwgThumbnail(buffer);
    if (bmp) {
      const blob = new Blob([bmp], { type: 'image/bmp' });
      const url = URL.createObjectURL(blob);
      applyImageToPlan(url, 'DWG · preview');
    } else {
      document.getElementById('plan-status').textContent = 'Vacío';
      alert(
        'El archivo DWG no contiene un preview interpretable.\n\n' +
        'Soluciones recomendadas:\n' +
        '  1. En AutoCAD: Archivo → Guardar como → DXF.\n' +
        '  2. CloudConvert.com (DWG → DXF online, gratis).\n' +
        '  3. Autodesk Viewer (viewer.autodesk.com) → exportar como PNG.\n\n' +
        'E-scale lee DXF vectorialmente con dimensiones reales.'
      );
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseDxfText(text) {
  if (!window.DxfParser) {
    alert('dxf-parser no se cargó correctamente. Revisa tu conexión.');
    return;
  }

  let dxf;
  try {
    const parser = new DxfParser();
    dxf = parser.parseSync(text);
  } catch (err) {
    console.error('DXF parse error:', err);
    alert('El DXF tiene errores de formato o no se puede parsear.');
    return;
  }

  if (!dxf || !dxf.entities || dxf.entities.length === 0) {
    alert('El archivo DXF no contiene entidades dibujables.');
    return;
  }

  const bbox = computeDxfBounds(dxf.entities);
  if (!isFinite(bbox.minX) || bbox.maxX === bbox.minX) {
    alert('No se pudieron calcular las dimensiones del DXF.');
    return;
  }

  const realWidth  = bbox.maxX - bbox.minX;
  const realHeight = bbox.maxY - bbox.minY;
  const dataURL = renderDxfToCanvas(dxf.entities, bbox);

  const img = new Image();
  img.onload = () => {
    const texture = new THREE.Texture(img);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.sRGBEncoding;
    AppState.plan.widthM  = Math.max(1, realWidth);
    AppState.plan.lengthM = Math.max(1, realHeight);
    document.getElementById('plan-width').value  = AppState.plan.widthM.toFixed(2);
    document.getElementById('plan-length').value = AppState.plan.lengthM.toFixed(2);
    SceneManager.setPlanTexture(texture);
    document.getElementById('plan-status').textContent =
      `DXF · ${dxf.entities.length} entidades · ${realWidth.toFixed(1)}×${realHeight.toFixed(1)}m`;
  };
  img.src = dataURL;
}

function computeDxfBounds(entities) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const expand = (x, y) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  entities.forEach(e => {
    if (e.vertices) {
      e.vertices.forEach(v => expand(v.x, v.y));
    } else if (e.center && typeof e.radius === 'number') {
      expand(e.center.x - e.radius, e.center.y - e.radius);
      expand(e.center.x + e.radius, e.center.y + e.radius);
    } else if (e.position) {
      expand(e.position.x, e.position.y);
    } else if (e.startPoint && e.endPoint) {
      expand(e.startPoint.x, e.startPoint.y);
      expand(e.endPoint.x, e.endPoint.y);
    }
  });
  return { minX, minY, maxX, maxY };
}

function renderDxfToCanvas(entities, bbox) {
  const W = 2400, H = 1600, PADDING = 60;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const dxfW = bbox.maxX - bbox.minX;
  const dxfH = bbox.maxY - bbox.minY;
  const scale = Math.min(
    (W - PADDING * 2) / dxfW,
    (H - PADDING * 2) / dxfH
  );
  const offsetX = PADDING - bbox.minX * scale + ((W - PADDING * 2) - dxfW * scale) / 2;
  const offsetY = H - PADDING + bbox.minY * scale - ((H - PADDING * 2) - dxfH * scale) / 2;
  const toScreen = (x, y) => [x * scale + offsetX, offsetY - y * scale];

  ctx.strokeStyle = '#1a1a1c';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  entities.forEach(e => {
    try {
      switch (e.type) {
        case 'LINE': {
          if (!e.vertices || e.vertices.length < 2) break;
          const [x1, y1] = toScreen(e.vertices[0].x, e.vertices[0].y);
          const [x2, y2] = toScreen(e.vertices[1].x, e.vertices[1].y);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          break;
        }
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          if (!e.vertices || e.vertices.length < 2) break;
          ctx.beginPath();
          e.vertices.forEach((v, i) => {
            const [x, y] = toScreen(v.x, v.y);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          if (e.shape || e.closed) ctx.closePath();
          ctx.stroke();
          break;
        }
        case 'CIRCLE': {
          if (!e.center || typeof e.radius !== 'number') break;
          const [cx, cy] = toScreen(e.center.x, e.center.y);
          ctx.beginPath();
          ctx.arc(cx, cy, e.radius * scale, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'ARC': {
          if (!e.center || typeof e.radius !== 'number') break;
          const [cx, cy] = toScreen(e.center.x, e.center.y);
          const startA = -e.endAngle   * Math.PI / 180;
          const endA   = -e.startAngle * Math.PI / 180;
          ctx.beginPath();
          ctx.arc(cx, cy, e.radius * scale, startA, endA);
          ctx.stroke();
          break;
        }
        case 'ELLIPSE': {
          if (!e.center) break;
          const [cx, cy] = toScreen(e.center.x, e.center.y);
          const rx = Math.hypot(e.majorAxisEndPoint.x, e.majorAxisEndPoint.y) * scale;
          const ry = rx * (e.axisRatio || 1);
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'TEXT':
        case 'MTEXT': {
          if (!e.position || !e.text) break;
          const [tx, ty] = toScreen(e.position.x, e.position.y);
          const fontSize = (e.height || 10) * scale * 0.8;
          if (fontSize > 4) {
            ctx.save();
            ctx.fillStyle = '#1a1a1c';
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillText(e.text, tx, ty);
            ctx.restore();
          }
          break;
        }
      }
    } catch (err) { /* entidad mal formada, la saltamos */ }
  });

  return canvas.toDataURL('image/png');
}

function extractDwgThumbnail(buf) {
  const LIMIT = Math.min(buf.length, 200_000);
  for (let i = 0; i < LIMIT - 14; i++) {
    if (buf[i] === 0x42 && buf[i+1] === 0x4D) {     // 'B' 'M'
      const size = buf[i+2] | (buf[i+3] << 8) | (buf[i+4] << 16) | (buf[i+5] << 24);
      if (size > 100 && size < 5_000_000 && (i + size) <= buf.length) {
        return buf.subarray(i, i + size);
      }
    }
  }
  return null;
}

/* ── Calibración ── */
function emitCalibrationProgress(detail = {}) {
  document.dispatchEvent(new CustomEvent('escale:plan-calibration-progress', {
    detail: {
      point1: 'Pendiente',
      point2: 'Pendiente',
      result: 'Sin calibrar',
      ...detail
    }
  }));
}

function toggleCalibration() {
  if (!AppState.plan.texture) {
    alert('Carga un plano base primero (botón superior).');
    return;
  }
  AppState.calibration.active = true;
  AppState.calibration.p1 = null;
  AppState.calibration.p2 = null;
  document.body.classList.add('cursor-cal');
  emitCalibrationProgress({
    point1: 'Activo',
    point2: 'Pendiente',
    result: 'Esperando referencia'
  });
}

function cancelCalibration(resetProgress = true) {
  AppState.calibration.active = false;
  AppState.calibration.p1 = null;
  AppState.calibration.p2 = null;
  document.body.classList.remove('cursor-cal');
  if (resetProgress) emitCalibrationProgress();
}

function handleCalibrationClick(point) {
  if (!AppState.calibration.p1) {
    AppState.calibration.p1 = { x: point.x, z: point.z };
    emitCalibrationProgress({
      point1: 'Marcado',
      point2: 'Activo',
      result: 'Marca el segundo punto'
    });
  } else {
    AppState.calibration.p2 = { x: point.x, z: point.z };
    const dx = AppState.calibration.p2.x - AppState.calibration.p1.x;
    const dz = AppState.calibration.p2.z - AppState.calibration.p1.z;
    const sceneDist = Math.sqrt(dx*dx + dz*dz);
    emitCalibrationProgress({
      point1: 'Marcado',
      point2: 'Marcado',
      result: 'Introduce la distancia real'
    });
    askRealDistance(sceneDist);
  }
}

function askRealDistance(sceneDist) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-title').textContent = '¿Cuánto mide esta distancia?';
  document.getElementById('modal-desc').innerHTML =
    `Distancia en el plano: ${sceneDist.toFixed(2)} uds.<br>Introduce el valor real y selecciona la unidad.`;
  const input = document.getElementById('modal-input');
  input.value = '';
  input.placeholder = 'Ej: 12.5';

  // Añadir selector de unidad si no existe
  let unitSelect = document.getElementById('modal-unit-select');
  if (!unitSelect) {
    unitSelect = document.createElement('select');
    unitSelect.id = 'modal-unit-select';
    unitSelect.style.cssText = `
      margin-left:8px; padding:6px 10px; border-radius:8px;
      border:1px solid rgba(0,0,0,0.15); background:#fff;
      font-family:'JetBrains Mono',monospace; font-size:12px;
    `;
    unitSelect.innerHTML = '<option value="m">Metros (m)</option><option value="cm">Centímetros (cm)</option>';
    input.parentElement.appendChild(unitSelect);
  }
  unitSelect.value = 'm';
  unitSelect.style.display = '';

  modal.classList.add('visible');
  setTimeout(() => input.focus(), 80);

  const confirm = document.getElementById('modal-confirm');
  const cancel  = document.getElementById('modal-cancel');

  const onConfirm = () => {
    let real = parseFloat(input.value);
    if (!real || real <= 0) {
      input.style.borderColor = '#b91c1c';
      return;
    }
    const unit = unitSelect.value;
    if (unit === 'cm') real = real / 100;

    applyScale(sceneDist, real);
    modal.classList.remove('visible');
    unitSelect.style.display = 'none';

    // Toast informativo
    const label = unit === 'cm'
      ? `${input.value} cm → ${real.toFixed(2)} m`
      : `${real.toFixed(2)} m`;
    showCalibrationToast(`Calibrado: ${label}`);
    cleanup();
  };
  const onCancel = () => {
    modal.classList.remove('visible');
    unitSelect.style.display = 'none';
    cancelCalibration();
    cleanup();
  };
  const onKey = (e) => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel(); };

  function cleanup() {
    confirm.removeEventListener('click', onConfirm);
    cancel.removeEventListener('click', onCancel);
    input.removeEventListener('keydown', onKey);
  }
  confirm.addEventListener('click', onConfirm);
  cancel.addEventListener('click', onCancel);
  input.addEventListener('keydown', onKey);
}

function showCalibrationToast(msg) {
  // Usa TemplateManager.showToast si existe, sino crea uno básico
  if (window.TemplateManager?.showToast) {
    window.TemplateManager.showToast(msg);
    return;
  }
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:300;
    background:rgba(10,10,11,0.92);color:#f5f3ee;padding:10px 20px;border-radius:10px;
    font-family:'JetBrains Mono',monospace;font-size:11px;backdrop-filter:blur(12px);
    border:1px solid rgba(255,255,255,0.12);
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function askRealDistanceLegacy(sceneDist) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-title').textContent = '¿Cuánto mide esta distancia?';
  document.getElementById('modal-desc').textContent =
    `Distancia actual en el plano: ${sceneDist.toFixed(2)} unidades. Introduce el valor real en metros para escalar el plano.`;
  const input = document.getElementById('modal-input');
  input.value = '';
  modal.classList.add('visible');
  setTimeout(() => input.focus(), 80);

  const confirm = document.getElementById('modal-confirm');
  const cancel  = document.getElementById('modal-cancel');

  const onConfirm = () => {
    const real = parseFloat(input.value);
    if (!real || real <= 0) {
      input.style.borderColor = '#b91c1c';
      return;
    }
    applyScale(sceneDist, real);
    modal.classList.remove('visible');
    cleanup();
  };
  const onCancel = () => {
    modal.classList.remove('visible');
    cancelCalibration();
    cleanup();
  };
  const onKey = (e) => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel(); };

  function cleanup() {
    confirm.removeEventListener('click', onConfirm);
    cancel.removeEventListener('click', onCancel);
    input.removeEventListener('keydown', onKey);
  }
  confirm.addEventListener('click', onConfirm);
  cancel.addEventListener('click', onCancel);
  input.addEventListener('keydown', onKey);
}

function applyScale(sceneDist, realMeters) {
  if (!AppState.plan.mesh) { cancelCalibration(); return; }
  const factor = realMeters / sceneDist;
  AppState.plan.widthM *= factor;
  AppState.plan.lengthM *= factor;
  document.getElementById('plan-width').value = AppState.plan.widthM.toFixed(2);
  document.getElementById('plan-length').value = AppState.plan.lengthM.toFixed(2);
  SceneManager.updatePlanSize();
  emitCalibrationProgress({
    point1: 'Marcado',
    point2: 'Marcado',
    result: `${realMeters.toFixed(2)} m aplicados`
  });
  document.dispatchEvent(new CustomEvent('escale:plan-calibrated'));
  cancelCalibration(false);
}

export const PlanManager = { init, handleCalibrationClick, cancelCalibration };

// Exponemos en window para que InteractionManager (que ya está cargado) lo encuentre.
window.PlanManager = PlanManager;

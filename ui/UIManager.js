/* ─────────────────────────────────────────────────────────
   UI MANAGER — Stats, tooltip, panel detalle, desgloses
   ───────────────────────────────────────────────────────── */

let _appState, _sceneManager;
async function bindDeps() {
  if (!_appState)     ({ AppState:     _appState     } = await import('../core/AppState.js'));
  if (!_sceneManager) ({ SceneManager: _sceneManager } = await import('../scene/SceneManager.js'));
}
const dynamic = {
  get AppState()     { return _appState; },
  get SceneManager() { return _sceneManager; }
};

/* ─── Stats e inventario ─── */
function refresh() {
  const A = dynamic.AppState;
  if (!A) return;

  const totalPax = A.items.reduce((s, i) => s + (i.chairs || 0), 0);
  const elPax  = document.getElementById('stat-pax');
  const elElms = document.getElementById('stat-elements');
  if (elPax)  elPax.textContent  = totalPax;
  if (elElms) elElms.textContent = A.items.length;

  // Desglose mesas por diámetro (sólo redondas, no Presi)
  const mesasByDiameter = {};
  A.items.filter(i => i.type === 'mesa' && i.subtype !== 'presi').forEach(m => {
    const k = m.dims.diameter.toFixed(1);
    mesasByDiameter[k] = (mesasByDiameter[k] || 0) + 1;
  });
  const mesaContainer = document.getElementById('breakdown-mesas');
  if (mesaContainer) {
    if (Object.keys(mesasByDiameter).length === 0) {
      mesaContainer.innerHTML = `<div class="text-xs" style="color:var(--muted)">—</div>`;
    } else {
      mesaContainer.innerHTML = Object.entries(mesasByDiameter)
        .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
        .map(([d, n]) => `
          <div class="flex items-center justify-between text-[11.5px]">
            <span class="flex items-center gap-2"><span class="chip">Ø ${d}m</span></span>
            <span class="mono font-medium">${n}</span>
          </div>
        `).join('');
    }
  }

  // Desglose buffets por categoría
  const buffetsByCat = {};
  A.items.filter(i => i.type === 'buffet').forEach(b => {
    buffetsByCat[b.subtype] = (buffetsByCat[b.subtype] || 0) + 1;
  });
  const buffetContainer = document.getElementById('breakdown-buffets');
  if (buffetContainer) {
    if (Object.keys(buffetsByCat).length === 0) {
      buffetContainer.innerHTML = `<div class="text-xs" style="color:var(--muted)">—</div>`;
    } else {
      buffetContainer.innerHTML = Object.entries(buffetsByCat)
        .map(([cat, n]) => `
          <div class="flex items-center justify-between text-[11.5px]">
            <span class="chip">${(cat || '—').toUpperCase()}</span>
            <span class="mono font-medium">${n}</span>
          </div>
        `).join('');
    }
  }

  // Desglose carpas
  const carpas = A.items.filter(i => i.type === 'carpa');
  const carpaContainer = document.getElementById('breakdown-carpas');
  if (carpaContainer) {
    if (carpas.length === 0) {
      carpaContainer.innerHTML = `<div class="text-xs" style="color:var(--muted)">—</div>`;
    } else {
      const totalArea = carpas.reduce((s, c) => s + c.dims.length * c.dims.width, 0);
      const totalPosts = carpas.reduce((s, c) => {
        if (c.posts?.enabled === false) return s;
        return s + (window.computePostPositions?.(c.dims.length, c.dims.width, c.posts.spacing).length || 0);
      }, 0);
      carpaContainer.innerHTML = `
        <div class="flex items-center justify-between text-[11.5px]">
          <span class="chip" style="background:rgba(107,68,35,0.15);color:#6b4423">${carpas.length} CARPA${carpas.length>1?'S':''}</span>
          <span class="mono font-medium">${totalArea.toFixed(1)}m²</span>
        </div>
        <div class="flex items-center justify-between text-[10.5px] pt-1" style="color:var(--muted)">
          <span>Postes totales</span>
          <span class="mono">${totalPosts}</span>
        </div>
      `;
    }
  }
}

/* ─── Tooltip ─── */
function showTooltip(item) {
  const tip = document.getElementById('tooltip');
  const content = document.getElementById('tooltip-content');
  if (!tip || !content) return;

  if (item.type === 'mesa') {
    const dimText = item.subtype === 'presi'
      ? `${item.dims.length.toFixed(1)}×${item.dims.width.toFixed(1)}m · ${item.chairs} pax`
      : `Ø ${item.dims.diameter.toFixed(2)}m · ${item.chairs} pax`;
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase">Mesa · ${item.subtype}</div>
      <div class="text-sm">${dimText}</div>
      <div class="text-[10px] opacity-50 mt-1">ID #${item.id}</div>
    `;
  } else if (item.type === 'carpa') {
    const postCount = item.posts?.enabled !== false
      ? (window.computePostPositions?.(item.dims.length, item.dims.width, item.posts.spacing).length || 0)
      : 0;
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase" style="color:#d4a574">Carpa</div>
      <div class="text-sm">${item.dims.length.toFixed(1)} × ${item.dims.width.toFixed(1)}m</div>
      <div class="text-[10.5px] opacity-70 mt-0.5">${postCount} postes · ${(item.dims.length*item.dims.width).toFixed(1)}m²</div>
      <div class="text-[10px] opacity-50 mt-1">ID #${item.id}</div>
    `;
  } else {
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase">Buffet · ${item.subtype || '—'}</div>
      <div class="text-sm">${item.dims.length.toFixed(2)}m</div>
      <div class="text-[10px] opacity-50 mt-1">ID #${item.id}</div>
    `;
  }
  tip.classList.add('visible');
}

function hideTooltip() {
  document.getElementById('tooltip')?.classList.remove('visible');
}

function updateTooltipPosition() {
  const A = dynamic.AppState;
  const S = dynamic.SceneManager;
  if (!A || !S) return;
  if (A.selectedId === null) { hideTooltip(); return; }
  const item = A.items.find(i => i.id === A.selectedId);
  if (!item) { hideTooltip(); return; }
  const mesh = S.meshes.get(item.id);
  if (!mesh) return;

  const yHeight = item.type === 'mesa' ? 1.2
                : item.type === 'carpa' ? (A.camera === 'top' ? 0.3 : 4.5)
                : 2.4;
  const vec = new THREE.Vector3(item.x, yHeight, item.z);
  vec.project(S.activeCam);
  const x = (vec.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-vec.y * 0.5 + 0.5) * window.innerHeight;

  const tip = document.getElementById('tooltip');
  if (!tip) return;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';

  if (!tip.classList.contains('visible')) showTooltip(item);
}

/* ─── Panel detalle (editable completo) ─── */
function showDetail(item) {
  const A = dynamic.AppState;
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  if (!panel || !content || !A) return;

  if (item.type === 'mesa') {
    const isPresi = item.subtype === 'presi';
    const dimRow = isPresi
      ? `<div class="flex justify-between"><span style="color:var(--muted)">Dimensiones</span><span class="mono">${item.dims.length.toFixed(2)} × ${item.dims.width.toFixed(2)}m</span></div>`
      : `<div class="flex justify-between"><span style="color:var(--muted)">Diámetro</span><span class="mono">${item.dims.diameter.toFixed(2)}m</span></div>`;

    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">Mesa</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">${item.subtype} · ID #${item.id}</div>
      <div class="space-y-2 text-[12px]">
        ${dimRow}
        <div class="flex justify-between"><span style="color:var(--muted)">Sillas</span><span class="mono">${item.chairs}p</span></div>
        <div class="flex justify-between"><span style="color:var(--muted)">Posición X</span><span class="mono">${item.x.toFixed(2)}m</span></div>
        <div class="flex justify-between"><span style="color:var(--muted)">Posición Z</span><span class="mono">${item.z.toFixed(2)}m</span></div>
      </div>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
  } else if (item.type === 'carpa') {
    const postsOn = item.posts?.enabled !== false;
    if (!item.columns) {
      item.columns = { enabled: false, rows: 1, cols: 2, diameter: 0.15 };
    }
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight" style="color:#6b4423">Carpa</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">Estructura · ID #${item.id}</div>

      <div class="mono text-[9.5px] uppercase tracking-widest mb-2" style="color:var(--muted)">Dimensiones</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Largo X (m)</span>
          <input data-carpa-input="length" type="number" min="1" max="50" step="0.5" value="${item.dims.length}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho Z (m)</span>
          <input data-carpa-input="width" type="number" min="1" max="50" step="0.5" value="${item.dims.width}" class="input-field"/>
        </label>
      </div>

      <div class="rule"></div>

      <label class="flex items-center justify-between mb-3 cursor-pointer">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Postes habilitados</span>
        <input data-carpa-input="postsEnabled" type="checkbox" ${postsOn ? 'checked' : ''}/>
      </label>

      <div id="carpa-posts-config" style="${postsOn ? '' : 'display:none;opacity:0.4;pointer-events:none'}">
        <div class="grid grid-cols-2 gap-2 mb-3">
          <label class="block">
            <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ø Poste (m)</span>
            <input data-carpa-input="postDiameter" type="number" min="0.04" max="0.5" step="0.01" value="${item.posts.diameter}" class="input-field"/>
          </label>
          <label class="block">
            <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Distrib. (m)</span>
            <input data-carpa-input="postSpacing" type="number" min="0.5" max="20" step="0.25" value="${item.posts.spacing}" class="input-field"/>
          </label>
        </div>
        <div class="text-[10.5px] mb-3 px-2 py-1.5" style="color:var(--muted);background:rgba(10,10,11,0.04)">
          Postes calculados: <span id="carpa-posts-count" class="mono">—</span>
        </div>
      </div>

      <div class="rule"></div>

      <label class="flex items-center justify-between mb-3 cursor-pointer">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Columnas internas</span>
        <input data-carpa-input="colsEnabled" type="checkbox" ${item.columns.enabled === true ? 'checked' : ''}/>
      </label>

      <div id="carpa-cols-config" style="${item.columns.enabled === true ? '' : 'display:none;opacity:0.4;pointer-events:none'}">
        <div class="grid grid-cols-2 gap-2 mb-2">
          <label class="block">
            <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Filas (Z)</span>
            <input data-carpa-input="colRows" type="number" min="1" max="10" step="1" value="${item.columns.rows ?? 1}" class="input-field"/>
          </label>
          <label class="block">
            <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Columnas (X)</span>
            <input data-carpa-input="colCols" type="number" min="1" max="10" step="1" value="${item.columns.cols ?? 2}" class="input-field"/>
          </label>
        </div>
        <label class="block mb-2">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ø Columna (m)</span>
          <input data-carpa-input="colDiameter" type="number" min="0.05" max="1" step="0.01" value="${item.columns.diameter ?? 0.15}" class="input-field"/>
        </label>
        <div class="text-[10.5px] mb-3 px-2 py-1.5" style="color:var(--muted);background:rgba(10,10,11,0.04)">
          Total columnas: <span id="carpa-cols-count" class="mono">${(item.columns.rows ?? 1) * (item.columns.cols ?? 2)}</span>
        </div>
      </div>

      <div class="space-y-2 text-[12px] mb-3">
        <div class="flex justify-between"><span style="color:var(--muted)">Posición X</span><span class="mono">${item.x.toFixed(2)}m</span></div>
        <div class="flex justify-between"><span style="color:var(--muted)">Posición Z</span><span class="mono">${item.z.toFixed(2)}m</span></div>
        <div class="flex justify-between"><span style="color:var(--muted)">Área</span><span class="mono">${(item.dims.length * item.dims.width).toFixed(1)} m²</span></div>
      </div>

      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;

    // Wire inputs de carpa
    const wire = (selector, handler) => {
      const el = panel.querySelector(`[data-carpa-input="${selector}"]`);
      if (!el) return;
      el.addEventListener('change', () => handler(el));
    };
    wire('length', el => {
      const v = Math.max(1, parseFloat(el.value) || 1);
      A.update(item.id, { dims: { ...item.dims, length: v } }, { skipDetailRebuild: true });
    });
    wire('width', el => {
      const v = Math.max(1, parseFloat(el.value) || 1);
      A.update(item.id, { dims: { ...item.dims, width: v } }, { skipDetailRebuild: true });
    });
    wire('postsEnabled', el => {
      A.update(item.id, { posts: { ...item.posts, enabled: el.checked } });
    });
    wire('postDiameter', el => {
      const v = Math.max(0.04, parseFloat(el.value) || 0.10);
      A.update(item.id, { posts: { ...item.posts, diameter: v } }, { skipDetailRebuild: true });
    });
    wire('postSpacing', el => {
      const v = Math.max(0.5, parseFloat(el.value) || 2.0);
      A.update(item.id, { posts: { ...item.posts, spacing: v } }, { skipDetailRebuild: true });
    });
    wire('colsEnabled', el => {
      A.update(item.id, { columns: { ...item.columns, enabled: el.checked } });
    });
    wire('colRows', el => {
      const v = Math.max(1, Math.min(10, parseInt(el.value, 10) || 1));
      A.update(item.id, { columns: { ...item.columns, rows: v } }, { skipDetailRebuild: true });
    });
    wire('colCols', el => {
      const v = Math.max(1, Math.min(10, parseInt(el.value, 10) || 2));
      A.update(item.id, { columns: { ...item.columns, cols: v } }, { skipDetailRebuild: true });
    });
    wire('colDiameter', el => {
      const v = Math.max(0.05, parseFloat(el.value) || 0.15);
      A.update(item.id, { columns: { ...item.columns, diameter: v } }, { skipDetailRebuild: true });
    });

    updateCarpaPostsCount(item);
  } else {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">Buffet</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">${item.subtype || 'sin categoría'} · ID #${item.id}</div>
      <div class="space-y-2 text-[12px]">
        <div class="flex justify-between"><span style="color:var(--muted)">Longitud</span><span class="mono">${item.dims.length.toFixed(2)}m</span></div>
        <div class="flex justify-between"><span style="color:var(--muted)">Categoría</span><span class="mono">${item.subtype || '—'}</span></div>
        <div class="flex justify-between"><span style="color:var(--muted)">Posición X</span><span class="mono">${item.x.toFixed(2)}m</span></div>
        <div class="flex justify-between"><span style="color:var(--muted)">Posición Z</span><span class="mono">${item.z.toFixed(2)}m</span></div>
      </div>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
  }

  panel.style.display = 'block';
  if (window.lucide) lucide.createIcons();

  panel.querySelector('[data-act="dup"]')?.addEventListener('click', () => A.duplicate(item.id));
  panel.querySelector('[data-act="del"]')?.addEventListener('click', () => A.remove(item.id));
}

function updateCarpaPostsCount(item) {
  const elPosts = document.getElementById('carpa-posts-count');
  if (elPosts) {
    if (item.posts?.enabled === false) {
      elPosts.textContent = '0 (deshabilitados)';
    } else {
      const positions = window.computePostPositions?.(item.dims.length, item.dims.width, item.posts.spacing) || [];
      elPosts.textContent = `${positions.length} postes`;
    }
  }
  const elCols = document.getElementById('carpa-cols-count');
  if (elCols) {
    const r = item.columns?.rows ?? 1;
    const c = item.columns?.cols ?? 2;
    elCols.textContent = item.columns?.enabled ? String(r * c) : '0 (deshabilitadas)';
  }
}

function hideDetail() {
  const p = document.getElementById('detail-panel');
  if (p) p.style.display = 'none';
}

function refreshUndoBadge() {
  const A = dynamic.AppState;
  const badge = document.getElementById('undo-badge');
  if (!badge || !A) return;
  const n = A.history.length;
  badge.textContent = `(${n}/${A.HISTORY_LIMIT})`;
  badge.style.opacity = n === 0 ? '0.4' : '1';
  badge.style.color = n > 0 ? 'var(--ink)' : '';
}

export const UIManager = {
  async init() { await bindDeps(); },
  refresh,
  showTooltip, hideTooltip, updateTooltipPosition,
  showDetail, hideDetail,
  refreshUndoBadge,
  updateCarpaPostsCount
};

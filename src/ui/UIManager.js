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

  // Desglose estructuras
  const STRUCT_TYPES = ['arbusto', 'arbol', 'cableLuces', 'room'];
  const structCounts = {};
  A.items.filter(i => STRUCT_TYPES.includes(i.type)).forEach(s => {
    structCounts[s.type] = (structCounts[s.type] || 0) + 1;
  });
  const structContainer = document.getElementById('breakdown-structures');
  if (structContainer) {
    if (Object.keys(structCounts).length === 0) {
      structContainer.innerHTML = `<div class="text-xs" style="color:var(--muted)">—</div>`;
    } else {
      const STRUCT_LABELS = {
        arbusto:    'Arbustos',
        arbol:      'Árboles',
        cableLuces: 'Cables con luces',
        room:       '4 Paredes'
      };
      const STRUCT_COLORS = {
        arbusto:    'rgba(62,122,58,0.18)',
        arbol:      'rgba(47,106,63,0.18)',
        cableLuces: 'rgba(200,144,0,0.18)',
        room:       'rgba(10,10,11,0.06)'
      };
      structContainer.innerHTML = Object.entries(structCounts).map(([t, n]) => `
        <div class="flex items-center justify-between text-[11.5px]">
          <span class="chip" style="background:${STRUCT_COLORS[t]}">${STRUCT_LABELS[t]}</span>
          <span class="mono font-medium">${n}</span>
        </div>
      `).join('');
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
  } else if (item.type === 'arbusto') {
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase" style="color:#3e7a3a">Arbusto</div>
      <div class="text-sm">${item.dims.width.toFixed(1)} × ${item.dims.height.toFixed(1)}m</div>
      <div class="text-[10px] opacity-50 mt-1">ID #${item.id}</div>
    `;
  } else if (item.type === 'arbol') {
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase" style="color:#2f6a3f">Árbol</div>
      <div class="text-sm">H ${item.dims.height.toFixed(1)}m · Ø copa ${item.dims.crownWidth.toFixed(1)}m</div>
      <div class="text-[10px] opacity-50 mt-1">ID #${item.id}</div>
    `;
  } else if (item.type === 'cableLuces') {
    const total = (item.count * item.spacing).toFixed(2);
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase" style="color:#c89000">Cable con Luces</div>
      <div class="text-sm">${item.count} luces · ${total}m</div>
      <div class="text-[10.5px] opacity-70 mt-0.5">altura ${item.height}m · separación ${item.spacing}m</div>
      <div class="text-[10px] opacity-50 mt-1">ID #${item.id}</div>
    `;
  } else if (item.type === 'room') {
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase">4 Paredes</div>
      <div class="text-sm">${item.dims.length.toFixed(1)} × ${item.dims.width.toFixed(1)} × ${item.dims.height.toFixed(1)}m</div>
      <div class="text-[10.5px] opacity-70 mt-0.5">grosor ${(item.dims.thickness * 100).toFixed(0)}cm</div>
      <div class="text-[10px] opacity-50 mt-1">ID #${item.id}</div>
    `;
  } else if (item.type === 'mesaRect' || item.type === 'mesaImperial') {
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase">Mesa · ${item.type === 'mesaImperial' ? 'imperial' : 'rectangular'}</div>
      <div class="text-sm">${item.dims.length.toFixed(2)} × ${item.dims.width.toFixed(2)}m · ${item.chairs} pax</div>
      <div class="text-[10px] opacity-50 mt-1">ID #${item.id}</div>
    `;
  } else if (item.type === 'mesaCocktail') {
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase">Mesa cocktail</div>
      <div class="text-sm">Ø ${item.dims.diameter.toFixed(2)}m · H ${item.dims.height.toFixed(2)}m</div>
      <div class="text-[10px] opacity-50 mt-1">ID #${item.id}</div>
    `;
  } else if (item.type === 'mesaCurva' || item.type === 'mesaSerpentina') {
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase">${item.type === 'mesaCurva' ? 'Curva' : 'Serpentina'}</div>
      <div class="text-sm">R ${item.dims.radioInt}m · ${item.dims.anguloDeg}° · ${item.chairs} pax</div>
      <div class="text-[10px] opacity-50 mt-1">ID #${item.id}</div>
    `;
  } else if (item.type === 'sillaCatering') {
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase">Silla · ${item.subtype}</div>
      <div class="text-sm">${(item.dims?.width ?? 0.44).toFixed(2)} × ${(item.dims?.depth ?? 0.44).toFixed(2)}m</div>
      <div class="text-[10px] opacity-50 mt-1">ID #${item.id}</div>
    `;
  } else if (item.type === 'sillaLineal') {
    const n = item.count ?? 6;
    const span = (n - 1) * (item.gap ?? 0.55);
    content.innerHTML = `
      <div class="mb-1 opacity-70 text-[9.5px] tracking-widest uppercase">Lineal · ${item.subtype}</div>
      <div class="text-sm">${n} sillas · ${span.toFixed(2)}m</div>
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

  const yHeight = item.type === 'mesa'  ? 1.2
                : item.type === 'carpa' ? (A.camera === 'top' ? 0.3 : 4.5)
                : item.type === 'arbusto'    ? (item.dims.height || 1) + 0.4
                : item.type === 'arbol'      ? (item.dims.height || 5) + 0.4
                : item.type === 'cableLuces' ? (item.height || 4) + 0.4
                : item.type === 'room'       ? (item.dims.height || 3) + 0.4
                : item.type === 'sillaCatering' ? (item.dims?.totalHeight || 0.9) + 0.3
                : item.type === 'sillaLineal'   ? (item.dims?.totalHeight || 0.9) + 0.3
                : item.type === 'mesaCocktail'  ? (item.dims?.height || 1.1) + 0.4
                : item.type === 'mesaRect' || item.type === 'mesaImperial' ? 1.2
                : item.type === 'mesaCurva' || item.type === 'mesaSerpentina' ? 1.2
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
  } else if (item.type === 'arbusto') {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight" style="color:#3e7a3a">Arbusto</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">Vegetación · ID #${item.id}</div>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho (m)</span>
          <input data-input="width" type="number" min="0.3" max="6" step="0.1" value="${item.dims.width}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Alto (m)</span>
          <input data-input="height" type="number" min="0.3" max="6" step="0.1" value="${item.dims.height}" class="input-field"/>
        </label>
      </div>

      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color</span>
        <input data-input="color" type="color" value="${item.color}" class="input-field" style="padding:2px; height:36px"/>
      </label>

      <div class="space-y-2 text-[12px] mb-3">
        <div class="flex justify-between"><span style="color:var(--muted)">Posición X</span><span class="mono">${item.x.toFixed(2)}m</span></div>
        <div class="flex justify-between"><span style="color:var(--muted)">Posición Z</span><span class="mono">${item.z.toFixed(2)}m</span></div>
      </div>

      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      width:  v => ({ dims: { ...item.dims, width:  clampNum(v, 0.3, 6) } }),
      height: v => ({ dims: { ...item.dims, height: clampNum(v, 0.3, 6) } }),
      color:  v => ({ color: v }),
    });

  } else if (item.type === 'arbol') {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight" style="color:#2f6a3f">Árbol</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">Vegetación · ID #${item.id}</div>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Altura (m)</span>
          <input data-input="height" type="number" min="1" max="15" step="0.5" value="${item.dims.height}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho copa (m)</span>
          <input data-input="crownWidth" type="number" min="0.5" max="8" step="0.25" value="${item.dims.crownWidth}" class="input-field"/>
        </label>
      </div>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color copa</span>
          <input data-input="crownColor" type="color" value="${item.crownColor}" class="input-field" style="padding:2px; height:36px"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color tronco</span>
          <input data-input="trunkColor" type="color" value="${item.trunkColor}" class="input-field" style="padding:2px; height:36px"/>
        </label>
      </div>

      <div class="space-y-2 text-[12px] mb-3">
        <div class="flex justify-between"><span style="color:var(--muted)">Posición X</span><span class="mono">${item.x.toFixed(2)}m</span></div>
        <div class="flex justify-between"><span style="color:var(--muted)">Posición Z</span><span class="mono">${item.z.toFixed(2)}m</span></div>
      </div>

      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      height:     v => ({ dims: { ...item.dims, height:     clampNum(v, 1,   15) } }),
      crownWidth: v => ({ dims: { ...item.dims, crownWidth: clampNum(v, 0.5, 8) } }),
      crownColor: v => ({ crownColor: v }),
      trunkColor: v => ({ trunkColor: v }),
    });

  } else if (item.type === 'cableLuces') {
    const totalLength = (item.count ?? 8) * (item.spacing ?? 1.0);
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight" style="color:#c89000">Cable con Luces</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">Iluminación · ID #${item.id}</div>

      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Altura (m)</span>
        <input data-input="height" type="number" min="2" max="10" step="0.25" value="${item.height}" class="input-field"/>
      </label>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Nº luces</span>
          <input data-input="count" type="number" min="2" max="60" step="1" value="${item.count}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Separación (m)</span>
          <input data-input="spacing" type="number" min="0.2" max="5" step="0.1" value="${item.spacing}" class="input-field"/>
        </label>
      </div>

      <div class="text-[10.5px] mb-3 px-2 py-1.5" style="color:var(--muted);background:rgba(10,10,11,0.04)">
        Largo total: <span class="mono">${totalLength.toFixed(2)}m</span> (${item.count} × ${item.spacing}m)
      </div>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color luz</span>
          <input data-input="lightColor" type="color" value="${item.lightColor}" class="input-field" style="padding:2px; height:36px"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color cable</span>
          <input data-input="cableColor" type="color" value="${item.cableColor}" class="input-field" style="padding:2px; height:36px"/>
        </label>
      </div>

      <div class="space-y-2 text-[12px] mb-3">
        <div class="flex justify-between"><span style="color:var(--muted)">Posición X</span><span class="mono">${item.x.toFixed(2)}m</span></div>
        <div class="flex justify-between"><span style="color:var(--muted)">Posición Z</span><span class="mono">${item.z.toFixed(2)}m</span></div>
      </div>

      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      height:     v => ({ height:     clampNum(v, 2,    10) }),
      count:      v => ({ count:      Math.round(clampNum(v, 2, 60)) }),
      spacing:    v => ({ spacing:    clampNum(v, 0.2, 5) }),
      lightColor: v => ({ lightColor: v }),
      cableColor: v => ({ cableColor: v }),
    });

  } else if (item.type === 'room') {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">4 Paredes</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">Estructura · ID #${item.id}</div>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Largo X (m)</span>
          <input data-input="length" type="number" min="1" max="50" step="0.25" value="${item.dims.length}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho Z (m)</span>
          <input data-input="width" type="number" min="1" max="50" step="0.25" value="${item.dims.width}" class="input-field"/>
        </label>
      </div>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Alto (m)</span>
          <input data-input="height" type="number" min="1" max="10" step="0.1" value="${item.dims.height}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Grosor (m)</span>
          <input data-input="thickness" type="number" min="0.04" max="0.5" step="0.01" value="${item.dims.thickness}" class="input-field"/>
        </label>
      </div>

      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color paredes</span>
        <input data-input="color" type="color" value="${item.color}" class="input-field" style="padding:2px; height:36px"/>
      </label>

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
    wireSimpleInputs(panel, item, A, {
      length:    v => ({ dims: { ...item.dims, length:    clampNum(v, 1,    50) } }),
      width:     v => ({ dims: { ...item.dims, width:     clampNum(v, 1,    50) } }),
      height:    v => ({ dims: { ...item.dims, height:    clampNum(v, 1,    10) } }),
      thickness: v => ({ dims: { ...item.dims, thickness: clampNum(v, 0.04, 0.5) } }),
      color:     v => ({ color: v }),
    });

} else if (item.type === 'mesaRect' || item.type === 'mesaImperial') {
    const label = item.type === 'mesaImperial' ? 'Mesa Imperial' : 'Mesa Rectangular';
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">${label}</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Largo (m)</span>
          <input data-input="length" type="number" min="1" max="20" step="0.1" value="${item.dims.length}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho (m)</span>
          <input data-input="width" type="number" min="0.5" max="2" step="0.05" value="${item.dims.width}" class="input-field"/>
        </label>
      </div>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Separación sillas (m)</span>
        <input data-input="chairSep" type="number" min="0.45" max="1.0" step="0.05" value="${item.chairSep ?? 0.60}" class="input-field"/>
      </label>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color</span>
        <input data-input="color" type="color" value="${item.color || '#4a4744'}" class="input-field" style="padding:2px;height:36px"/>
      </label>
      <div class="text-[12px] mb-3 flex justify-between"><span style="color:var(--muted)">Sillas calculadas</span><span class="mono">${item.chairs}p</span></div>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      length:   v => ({ dims: { ...item.dims, length: clampNum(v, 1, 20) } }),
      width:    v => ({ dims: { ...item.dims, width:  clampNum(v, 0.5, 2) } }),
      chairSep: v => ({ chairSep: clampNum(v, 0.45, 1.0) }),
      color:    v => ({ color: v }),
    });

  } else if (item.type === 'mesaCocktail') {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">Mesa Cocktail</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Diámetro (m)</span>
          <input data-input="diameter" type="number" min="0.5" max="1.5" step="0.05" value="${item.dims.diameter}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Altura (m)</span>
          <input data-input="height" type="number" min="0.7" max="1.3" step="0.05" value="${item.dims.height}" class="input-field"/>
        </label>
      </div>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color falda</span>
        <input data-input="color" type="color" value="${item.color || '#ffffff'}" class="input-field" style="padding:2px;height:36px"/>
      </label>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      diameter: v => ({ dims: { ...item.dims, diameter: clampNum(v, 0.5, 1.5) } }),
      height:   v => ({ dims: { ...item.dims, height:   clampNum(v, 0.7, 1.3) } }),
      color:    v => ({ color: v }),
    });

  } else if (item.type === 'mesaCurva' || item.type === 'mesaSerpentina') {
    const label = item.type === 'mesaCurva' ? 'Mesa Curva' : 'Mesa Serpentina';
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">${label}</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Radio interno (m)</span>
          <input data-input="radioInt" type="number" min="0.5" max="8" step="0.1" value="${item.dims.radioInt}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho tablero (m)</span>
          <input data-input="anchoTab" type="number" min="0.4" max="1.5" step="0.05" value="${item.dims.anchoTab}" class="input-field"/>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ángulo (°)</span>
          <input data-input="anguloDeg" type="number" min="15" max="180" step="5" value="${item.dims.anguloDeg}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Sep. sillas (m)</span>
          <input data-input="chairSep" type="number" min="0.45" max="1.0" step="0.05" value="${item.chairSep ?? 0.60}" class="input-field"/>
        </label>
      </div>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Distribución sillas</span>
        <select data-input="distrib" class="input-field">
          <option value="interna" ${item.distrib==='interna'?'selected':''}>Interna</option>
          <option value="externa" ${item.distrib==='externa'?'selected':''}>Externa</option>
          <option value="ambas"   ${item.distrib==='ambas'  ?'selected':''}>Ambas</option>
        </select>
      </label>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color</span>
        <input data-input="color" type="color" value="${item.color || '#4a4744'}" class="input-field" style="padding:2px;height:36px"/>
      </label>
      <div class="text-[12px] mb-3 flex justify-between"><span style="color:var(--muted)">Sillas calculadas</span><span class="mono">${item.chairs}p</span></div>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      radioInt:  v => ({ dims: { ...item.dims, radioInt:  clampNum(v, 0.5, 8) } }),
      anchoTab:  v => ({ dims: { ...item.dims, anchoTab:  clampNum(v, 0.4, 1.5) } }),
      anguloDeg: v => ({ dims: { ...item.dims, anguloDeg: clampNum(v, 15, 180) } }),
      chairSep:  v => ({ chairSep: clampNum(v, 0.45, 1.0) }),
      distrib:   v => ({ distrib: v }),
      color:     v => ({ color: v }),
    });

} else if (item.type === 'sillaCatering') {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">Silla</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">${item.subtype} · ID #${item.id}</div>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho (m)</span>
          <input data-input="width" type="number" min="0.3" max="0.8" step="0.01" value="${item.dims.width}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Fondo (m)</span>
          <input data-input="depth" type="number" min="0.3" max="0.8" step="0.01" value="${item.dims.depth}" class="input-field"/>
        </label>
      </div>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Asiento (m)</span>
          <input data-input="seatHeight" type="number" min="0.30" max="0.85" step="0.01" value="${item.dims.seatHeight}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Alto total (m)</span>
          <input data-input="totalHeight" type="number" min="0.50" max="1.30" step="0.01" value="${item.dims.totalHeight}" class="input-field"/>
        </label>
      </div>

      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color</span>
        <input data-input="color" type="color" value="${item.color}" class="input-field" style="padding:2px;height:36px"/>
      </label>

      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      width:       v => ({ dims: { ...item.dims, width:       clampNum(v, 0.3, 0.8) } }),
      depth:       v => ({ dims: { ...item.dims, depth:       clampNum(v, 0.3, 0.8) } }),
      seatHeight:  v => ({ dims: { ...item.dims, seatHeight:  clampNum(v, 0.30, 0.85) } }),
      totalHeight: v => ({ dims: { ...item.dims, totalHeight: clampNum(v, 0.50, 1.30) } }),
      color:       v => ({ color: v }),
    });

  } else if (item.type === 'sillaLineal') {
    const span = ((item.count - 1) * item.gap).toFixed(2);
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">Lineal de sillas</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">${item.subtype} · ID #${item.id}</div>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Nº sillas</span>
          <input data-input="count" type="number" min="2" max="40" step="1" value="${item.count}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Separación (m)</span>
          <input data-input="gap" type="number" min="0.35" max="2" step="0.05" value="${item.gap}" class="input-field"/>
        </label>
      </div>

      <div class="text-[10.5px] mb-3 px-2 py-1.5" style="color:var(--muted);background:rgba(10,10,11,0.04)">
        Largo total: <span class="mono">${span}m</span>
      </div>

      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color</span>
        <input data-input="color" type="color" value="${item.color}" class="input-field" style="padding:2px;height:36px"/>
      </label>

      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      count: v => ({ count: Math.round(clampNum(v, 2, 40)), chairs: Math.round(clampNum(v, 2, 40)) }),
      gap:   v => ({ gap:   clampNum(v, 0.35, 2) }),
      color: v => ({ color: v }),
    });

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

/* ─── Helpers ─── */

function clampNum(v, min, max) {
  const n = parseFloat(v);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Conecta inputs simples (data-input="key") a AppState.update().
 * `recipes` mapea cada key a una función que recibe el valor crudo y
 * devuelve el patch a aplicar al item. La rama lee el value adecuado
 * según el tipo de input (color → string, number → parseFloat).
 */
function wireSimpleInputs(panel, item, A, recipes) {
  Object.entries(recipes).forEach(([key, recipe]) => {
    const el = panel.querySelector(`[data-input="${key}"]`);
    if (!el) return;
    const eventName = el.type === 'color' ? 'input' : 'change';
    el.addEventListener(eventName, () => {
      const raw = el.type === 'color' ? el.value : el.value;
      const patch = recipe(raw);
      A.update(item.id, patch, { skipDetailRebuild: el.type === 'color' });
    });
  });
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

function showMultiDetail(ids) {
  const A = dynamic.AppState;
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  if (!panel || !content || !A) return;
  const items = ids.map(id => A.items.find(i => i.id === id)).filter(Boolean);
  const totalPax = items.reduce((s, i) => s + (i.chairs || 0), 0);
  const lockedCount = items.filter(i => i.locked).length;

  content.innerHTML = `
    <div class="display-font text-2xl mb-1 leading-tight">${items.length} elementos</div>
    <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">Selección múltiple</div>
    <div class="space-y-2 text-[12px] mb-3">
      <div class="flex justify-between"><span style="color:var(--muted)">Pax suma</span><span class="mono">${totalPax}p</span></div>
      <div class="flex justify-between"><span style="color:var(--muted)">Bloqueados</span><span class="mono">${lockedCount}/${items.length}</span></div>
    </div>
    <div class="rule"></div>
    <div class="space-y-2">
      <button data-multi-act="lock-all" class="btn ghost w-full justify-center"><i data-lucide="lock" class="w-3.5 h-3.5"></i>Bloquear todos</button>
      <button data-multi-act="unlock-all" class="btn ghost w-full justify-center"><i data-lucide="unlock" class="w-3.5 h-3.5"></i>Desbloquear todos</button>
      <button data-multi-act="delete-all" class="btn danger ghost w-full justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar todos</button>
    </div>
  `;
  panel.style.display = 'block';
  if (window.lucide) lucide.createIcons();

  panel.querySelector('[data-multi-act="lock-all"]')?.addEventListener('click', () => {
    ids.forEach(id => { const it = A.items.find(i => i.id === id); if (it && !it.locked) A.toggleLock(id); });
  });
  panel.querySelector('[data-multi-act="unlock-all"]')?.addEventListener('click', () => {
    ids.forEach(id => { const it = A.items.find(i => i.id === id); if (it && it.locked) A.toggleLock(id); });
  });
  panel.querySelector('[data-multi-act="delete-all"]')?.addEventListener('click', () => {
    if (!confirm(`¿Eliminar ${ids.length} elementos?`)) return;
    ids.forEach(id => { const it = A.items.find(i => i.id === id); if (it && !it.locked) A.remove(id); });
  });
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
  showDetail, showMultiDetail, hideDetail,
  refreshUndoBadge,
  updateCarpaPostsCount
};

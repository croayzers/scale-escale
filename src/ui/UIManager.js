/* ─────────────────────────────────────────────────────────
   UI MANAGER — Stats, tooltip, panel detalle, desgloses
   ───────────────────────────────────────────────────────── */

let _appState, _sceneManager, _collabManager;
let itemSettingsHandle;

// Cached DOM refs populated on first use (DOM guaranteed ready after UIManager.init)
let _domEls = null;
function _els() {
  if (!_domEls) _domEls = {
    pax:     document.getElementById('stat-pax'),
    elms:    document.getElementById('stat-elements'),
    mesas:   document.getElementById('breakdown-mesas'),
    buffets: document.getElementById('breakdown-buffets'),
    carpas:  document.getElementById('breakdown-carpas'),
    structs: document.getElementById('breakdown-structures'),
    undo:    document.getElementById('undo-badge'),
    tooltip: document.getElementById('tooltip'),
  };
  return _domEls;
}
async function bindDeps() {
  if (!_appState)      ({ AppState:      _appState      } = await import('../core/AppState.js'));
  if (!_sceneManager)  ({ SceneManager:  _sceneManager  } = await import('../scene/SceneManager.js'));
  if (!_collabManager) ({ CollabManager: _collabManager } = await import('../services/CollabManager.js'));
}
const dynamic = {
  get AppState()       { return _appState; },
  get SceneManager()   { return _sceneManager; },
  get CollabManager()  { return _collabManager; }
};

/* ─── Stats e inventario ─── */
function refresh() {
  const A = dynamic.AppState;
  if (!A) return;

  const totalPax = A.items.reduce((s, i) => s + (i.chairs || 0), 0);
  const e = _els();
  if (e.pax)  e.pax.textContent  = totalPax;
  if (e.elms) e.elms.textContent = A.items.length;

  // Desglose mesas por diámetro (sólo redondas, no Presi)
  const mesasByDiameter = {};
  A.items.filter(i => i.type === 'mesa' && i.subtype !== 'presi').forEach(m => {
    const k = m.dims.diameter.toFixed(1);
    mesasByDiameter[k] = (mesasByDiameter[k] || 0) + 1;
  });
  const mesaContainer = e.mesas;
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
  const buffetContainer = e.buffets;
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
  const carpaContainer = e.carpas;
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
  const structContainer = e.structs;
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
function hideTooltip() {
  _els().tooltip?.classList.remove('visible');
}

function updateTooltipPosition() {
  const A = dynamic.AppState;
  const S = dynamic.SceneManager;
  if (!A || !S) return;
  if (A.selectedId === null) { hideTooltip(); hideItemSettingsHandle(); return; }
  const item = A.items.find(i => i.id === A.selectedId);
  if (!item) { hideTooltip(); hideItemSettingsHandle(); return; }
  const mesh = S.meshes.get(item.id);
  if (!mesh) { hideItemSettingsHandle(); return; }

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
                : item.type === 'carpaCuadrada'    ? (A.camera === 'top' ? 0.3 : (item.dims.height + item.dims.ridgeRise + 0.5))
                : item.type === 'carpaStar'        ? (A.camera === 'top' ? 0.3 : (item.dims.height + item.dims.peakRise + 0.5))
                : item.type === 'carpaPabellon'    ? (A.camera === 'top' ? 0.3 : (item.dims.height + item.dims.ridgeRise + 0.5))
                : item.type === 'carpaTransparente'? (A.camera === 'top' ? 0.3 : (item.dims.height + item.dims.ridgeRise + 0.5))
                : item.type === 'carpaBeduina'     ? (A.camera === 'top' ? 0.3 : (item.dims.peakHeight + 0.5))
                : item.type === 'carpaSailcloth'   ? (A.camera === 'top' ? 0.3 : (item.dims.peakHeight + 0.5))
                : item.type === 'carpaTipi'        ? (A.camera === 'top' ? 0.3 : (item.dims.height + 0.5))
                : item.type === 'carpaDomo'        ? (A.camera === 'top' ? 0.3 : (item.dims.height + 0.5))
                : item.type === 'poste' ? item.dims.height + 0.4
				: item.type === 'barraLibre' ? (item.dims.height ?? 0.9) + 0.5
                : item.type === 'ambiente'   ? (item.subtype === 'alfombra' ? 0.4 : (item.dims.height ?? 1) + 0.4)
                : 2.4;

  const vec = new THREE.Vector3(item.x, yHeight, item.z);
  vec.project(S.activeCam);
  const x = (vec.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-vec.y * 0.5 + 0.5) * window.innerHeight;

  const tip = _els().tooltip;
  updateItemSettingsHandle(item, mesh);
  if (!tip) return;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

function ensureItemSettingsHandle() {
  if (itemSettingsHandle) return itemSettingsHandle;
  itemSettingsHandle = document.createElement('button');
  itemSettingsHandle.id = 'item-settings-handle';
  itemSettingsHandle.type = 'button';
  itemSettingsHandle.className = 'item-settings-handle hidden';
  itemSettingsHandle.title = 'Modificar item';
  itemSettingsHandle.innerHTML = '<i data-lucide="settings-2" class="w-4 h-4"></i>';
  itemSettingsHandle.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
  });
  itemSettingsHandle.addEventListener('mousedown', event => {
    event.preventDefault();
    event.stopPropagation();
  });
  itemSettingsHandle.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const A = dynamic.AppState;
    const id = Number(itemSettingsHandle.dataset.itemId || 0);
    const item = A?.items.find(entry => entry.id === id);
    if (item) {
      if (!A.selectedIds?.has?.(item.id) || A.selectedIds.size !== 1) {
        A.select?.(item.id);
      }
      const rect = itemSettingsHandle.getBoundingClientRect();
      document.dispatchEvent(new CustomEvent('escale:item-settings-menu', {
        detail: {
          itemId: item.id,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        }
      }));
    }
  });
  document.body.appendChild(itemSettingsHandle);
  if (window.lucide) lucide.createIcons();
  return itemSettingsHandle;
}

function hideItemSettingsHandle() {
  if (!itemSettingsHandle) return;
  itemSettingsHandle.classList.add('hidden');
}

function updateItemSettingsHandle(item, mesh) {
  const A = dynamic.AppState;
  const S = dynamic.SceneManager;
  if (!A || !S || A.selectedIds.size !== 1 || !item || !mesh) {
    hideItemSettingsHandle();
    return;
  }
  if (dynamic.CollabManager?.localRole === 'viewer') {
    hideItemSettingsHandle();
    return;
  }
  // Ocultar durante cualquier modo de colocación (catalog, grupo, zona)
  if (document.body.classList.contains('placement-pending')) {
    hideItemSettingsHandle();
    return;
  }

  const handle = ensureItemSettingsHandle();
  const bounds = new THREE.Box3().setFromObject(mesh);
  const anchor = new THREE.Vector3(
    bounds.max.x,
    Math.max(0.04, bounds.min.y + 0.06),
    bounds.max.z
  );
  anchor.project(S.activeCam);

  const x = (anchor.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-anchor.y * 0.5 + 0.5) * window.innerHeight;
  handle.dataset.itemId = String(item.id);
  handle.style.left = `${x + 6}px`;
  handle.style.top = `${y + 6}px`;
  handle.classList.remove('hidden');
}

/* ─── Panel detalle (editable completo) ─── */
function showDetail(item) {
  const A = dynamic.AppState;
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  if (!panel || !content || !A) return;

  if (PropertyRenderer.canRender(item) && PropertyRenderer.render({ item, panel, content, AppState: A })) {
    return;
  }

  if (item.type === 'zone') {
    const fillOpacity = Math.round((item.fillOpacity ?? item.visual?.opacity ?? 0.18) * 100);
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">Zona</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">2D · ID #${item.id}</div>

      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Nombre de zona</span>
        <input id="zone-detail-name" type="text" value="${item.labelText || ''}" class="input-field"/>
      </label>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Largo X (m)</span>
          <input id="zone-detail-length" type="number" min="0.5" max="120" step="0.1" value="${item.dims?.length ?? 4}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho Z (m)</span>
          <input id="zone-detail-width" type="number" min="0.5" max="120" step="0.1" value="${item.dims?.width ?? 4}" class="input-field"/>
        </label>
      </div>

      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color borde</span>
          <input id="zone-detail-border" type="color" value="${item.borderColor || '#22c55e'}" class="input-field" style="padding:2px;height:36px"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color fondo</span>
          <input id="zone-detail-fill" type="color" value="${item.color || '#22c55e'}" class="input-field" style="padding:2px;height:36px"/>
        </label>
      </div>

      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Visibilidad fondo</span>
        <div class="flex items-center gap-2">
          <input id="zone-detail-opacity" type="range" min="5" max="60" step="1" value="${fillOpacity}" class="flex-1"/>
          <span class="mono text-[10px]" style="min-width:42px">${fillOpacity}%</span>
        </div>
      </label>

      <label class="flex items-center justify-between mb-3 cursor-pointer">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Desactivar color fondo</span>
        <input id="zone-detail-fill-disabled" type="checkbox" ${item.fillEnabled === false ? 'checked' : ''}/>
      </label>

      <label class="flex items-center justify-between mb-3 cursor-pointer">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Bloquear zona</span>
        <input id="zone-detail-lock" type="checkbox" ${item.locked ? 'checked' : ''}/>
      </label>

      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color texto</span>
        <input id="zone-detail-text-color" type="color" value="${item.textColor || '#000000'}" class="input-field" style="padding:2px;height:36px"/>
      </label>

      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Tamaño texto</span>
        <div class="flex items-center gap-2">
          <input id="zone-detail-font-size" type="range" min="20" max="120" step="4" value="${item.fontSize ?? 120}" class="flex-1"/>
          <span class="mono text-[10px]" id="zone-font-size-val">${item.fontSize ?? 120}px</span>
        </div>
      </label>

      <label class="flex items-center justify-between mb-4 cursor-pointer">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Mostrar texto</span>
        <input id="zone-detail-show-label" type="checkbox" ${item.showLabel !== false ? 'checked' : ''}/>
      </label>

      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;

    panel.style.display = 'block';
    panel.classList.add('is-open');
    if (window.lucide) lucide.createIcons();

    const updateZone = patch => A.update(item.id, patch, { skipDetailRebuild: true });
    content.querySelector('#zone-detail-name')?.addEventListener('input', event => {
      updateZone({ labelText: String(event.target.value || '').trim() || `Zona ${item.id}` });
    });
    content.querySelector('#zone-detail-length')?.addEventListener('input', event => {
      updateZone({
        dims: { ...(item.dims || {}), length: Math.max(0.5, parseFloat(event.target.value) || item.dims?.length || 4) }
      });
    });
    content.querySelector('#zone-detail-width')?.addEventListener('input', event => {
      updateZone({
        dims: { ...(item.dims || {}), width: Math.max(0.5, parseFloat(event.target.value) || item.dims?.width || 4) }
      });
    });
    content.querySelector('#zone-detail-border')?.addEventListener('input', event => {
      updateZone({ borderColor: event.target.value });
    });
    content.querySelector('#zone-detail-fill')?.addEventListener('input', event => {
      updateZone({ color: event.target.value });
    });
    content.querySelector('#zone-detail-opacity')?.addEventListener('input', event => {
      const opacity = Math.max(0.05, Math.min(0.6, (parseFloat(event.target.value) || 18) / 100));
      updateZone({
        fillOpacity: opacity,
        visual: { ...(item.visual || {}), opacity: item.fillEnabled === false ? 0.001 : opacity, shadows: false }
      });
    });
    content.querySelector('#zone-detail-fill-disabled')?.addEventListener('change', event => {
      const fillEnabled = !event.target.checked;
      updateZone({
        fillEnabled,
        visual: {
          ...(item.visual || {}),
          opacity: fillEnabled ? (item.fillOpacity ?? item.visual?.opacity ?? 0.18) : 0.001,
          shadows: false
        }
      });
    });
    content.querySelector('#zone-detail-lock')?.addEventListener('change', event => {
      if (Boolean(item.locked) !== Boolean(event.target.checked)) A.toggleLock(item.id);
    });
    content.querySelector('#zone-detail-text-color')?.addEventListener('input', event => {
      updateZone({ textColor: event.target.value });
    });
    content.querySelector('#zone-detail-font-size')?.addEventListener('input', event => {
      const v = parseInt(event.target.value);
      const lbl = content.querySelector('#zone-font-size-val');
      if (lbl) lbl.textContent = v + 'px';
      updateZone({ fontSize: v });
    });
    content.querySelector('#zone-detail-show-label')?.addEventListener('change', event => {
      updateZone({ showLabel: event.target.checked });
    });
    panel.querySelector('[data-act="dup"]')?.addEventListener('click', () => A.duplicate(item.id));
    panel.querySelector('[data-act="del"]')?.addEventListener('click', () => A.remove(item.id));
    return;
  }

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

      <label class="flex items-center justify-between mb-3 cursor-pointer">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Mostrar medidas</span>
        <input data-input="showLabel" type="checkbox" ${item.showLabel ? 'checked' : ''}/>
      </label>

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
    const cbLabel = panel.querySelector('[data-input="showLabel"]');
    cbLabel?.addEventListener('change', () => { A.update(item.id, { showLabel: cbLabel.checked }); });

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

      <label class="flex items-center justify-between mb-3 cursor-pointer">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Mostrar medidas</span>
        <input data-input="showLabel" type="checkbox" ${item.showLabel ? 'checked' : ''}/>
      </label>

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
    const cbLabel = panel.querySelector('[data-input="showLabel"]');
    cbLabel?.addEventListener('change', () => { A.update(item.id, { showLabel: cbLabel.checked }); });

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

      <label class="flex items-center justify-between mb-3 cursor-pointer">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Mostrar medidas</span>
        <input data-input="showLabel" type="checkbox" ${item.showLabel ? 'checked' : ''}/>
      </label>

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
    const cbLabel = panel.querySelector('[data-input="showLabel"]');
    cbLabel?.addEventListener('change', () => { A.update(item.id, { showLabel: cbLabel.checked }); });

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

      <label class="flex items-center justify-between mb-3 cursor-pointer">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Mostrar medidas</span>
        <input data-input="showLabel" type="checkbox" ${item.showLabel ? 'checked' : ''}/>
      </label>

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
    const cbLabel = panel.querySelector('[data-input="showLabel"]');
    cbLabel?.addEventListener('change', () => { A.update(item.id, { showLabel: cbLabel.checked }); });

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
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Sep. sillas (m)</span>
          <input data-input="chairSep" type="number" min="0.45" max="1.0" step="0.05" value="${item.chairSep ?? 0.60}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Offset sillas (m)</span>
          <input data-input="chairOffset" type="number" min="0" max="0.5" step="0.01" value="${(item.chairOffset ?? 0.1).toFixed(2)}" class="input-field"/>
        </label>
      </div>
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
      length:      v => ({ dims: { ...item.dims, length: clampNum(v, 1, 20) } }),
      width:       v => ({ dims: { ...item.dims, width:  clampNum(v, 0.5, 2) } }),
      chairSep:    v => ({ chairSep: clampNum(v, 0.45, 1.0) }),
      chairOffset: v => ({ chairOffset: clampNum(v, 0, 0.5) }),
      color:       v => ({ color: v }),
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

  } else if (item.type === 'carpaCuadrada') {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight" style="color:#6b4423">Carpa Cuadrada</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Lado (m)</span>
          <input data-input="size" type="number" min="3" max="20" step="0.5" value="${item.dims.size}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Altura (m)</span>
          <input data-input="height" type="number" min="2" max="6" step="0.1" value="${item.dims.height}" class="input-field"/>
        </label>
      </div>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Subida cima (m)</span>
        <input data-input="ridgeRise" type="number" min="0.5" max="4" step="0.1" value="${item.dims.ridgeRise}" class="input-field"/>
      </label>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color tela</span>
          <input data-input="tarpColor" type="color" value="${item.tarpColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color postes</span>
          <input data-input="poleColor" type="color" value="${item.poleColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
      </div>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      size:      v => ({ dims: { ...item.dims, size:      clampNum(v, 3, 20) } }),
      height:    v => ({ dims: { ...item.dims, height:    clampNum(v, 2, 6) } }),
      ridgeRise: v => ({ dims: { ...item.dims, ridgeRise: clampNum(v, 0.5, 4) } }),
      tarpColor: v => ({ tarpColor: v }),
      poleColor: v => ({ poleColor: v }),
    });

  } else if (item.type === 'carpaStar') {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight" style="color:#6b4423">Carpa Star</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Diámetro (m)</span>
          <input data-input="size" type="number" min="4" max="20" step="0.5" value="${item.dims.size}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Altura postes (m)</span>
          <input data-input="height" type="number" min="2" max="5" step="0.1" value="${item.dims.height}" class="input-field"/>
        </label>
      </div>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Subida pico (m)</span>
        <input data-input="peakRise" type="number" min="1" max="5" step="0.1" value="${item.dims.peakRise}" class="input-field"/>
      </label>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color tela</span>
          <input data-input="tarpColor" type="color" value="${item.tarpColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color postes</span>
          <input data-input="poleColor" type="color" value="${item.poleColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
      </div>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      size:      v => ({ dims: { ...item.dims, size:     clampNum(v, 4, 20) } }),
      height:    v => ({ dims: { ...item.dims, height:   clampNum(v, 2, 5) } }),
      peakRise:  v => ({ dims: { ...item.dims, peakRise: clampNum(v, 1, 5) } }),
      tarpColor: v => ({ tarpColor: v }),
      poleColor: v => ({ poleColor: v }),
    });

  } else if (item.type === 'carpaPabellon' || item.type === 'carpaTransparente') {
    const isTrans = item.type === 'carpaTransparente';
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight" style="color:#6b4423">Carpa ${isTrans ? 'Transparente' : 'Pabellón'}</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Largo (m)</span>
          <input data-input="length" type="number" min="4" max="40" step="0.5" value="${item.dims.length}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho (m)</span>
          <input data-input="width" type="number" min="3" max="20" step="0.5" value="${item.dims.width}" class="input-field"/>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Altura (m)</span>
          <input data-input="height" type="number" min="2" max="6" step="0.1" value="${item.dims.height}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Subida cima (m)</span>
          <input data-input="ridgeRise" type="number" min="0.5" max="4" step="0.1" value="${item.dims.ridgeRise}" class="input-field"/>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">${isTrans ? 'Color cristal' : 'Color tela'}</span>
          <input data-input="${isTrans ? 'glassColor' : 'tarpColor'}" type="color" value="${isTrans ? item.glassColor : item.tarpColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color postes</span>
          <input data-input="poleColor" type="color" value="${item.poleColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
      </div>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    const colorKey = isTrans ? 'glassColor' : 'tarpColor';
    wireSimpleInputs(panel, item, A, {
      length:    v => ({ dims: { ...item.dims, length:    clampNum(v, 4, 40) } }),
      width:     v => ({ dims: { ...item.dims, width:     clampNum(v, 3, 20) } }),
      height:    v => ({ dims: { ...item.dims, height:    clampNum(v, 2, 6) } }),
      ridgeRise: v => ({ dims: { ...item.dims, ridgeRise: clampNum(v, 0.5, 4) } }),
      [colorKey]: v => ({ [colorKey]: v }),
      poleColor: v => ({ poleColor: v }),
    });

  } else if (item.type === 'carpaBeduina') {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight" style="color:#6b4423">Carpa Beduina</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Largo (m)</span>
          <input data-input="length" type="number" min="4" max="30" step="0.5" value="${item.dims.length}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho (m)</span>
          <input data-input="width" type="number" min="3" max="20" step="0.5" value="${item.dims.width}" class="input-field"/>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">H esquinas (m)</span>
          <input data-input="cornerHeight" type="number" min="1.5" max="4" step="0.1" value="${item.dims.cornerHeight}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">H picos (m)</span>
          <input data-input="peakHeight" type="number" min="3" max="8" step="0.1" value="${item.dims.peakHeight}" class="input-field"/>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color tela</span>
          <input data-input="tarpColor" type="color" value="${item.tarpColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color mástiles</span>
          <input data-input="poleColor" type="color" value="${item.poleColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
      </div>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      length:       v => ({ dims: { ...item.dims, length:       clampNum(v, 4, 30) } }),
      width:        v => ({ dims: { ...item.dims, width:        clampNum(v, 3, 20) } }),
      cornerHeight: v => ({ dims: { ...item.dims, cornerHeight: clampNum(v, 1.5, 4) } }),
      peakHeight:   v => ({ dims: { ...item.dims, peakHeight:   clampNum(v, 3, 8) } }),
      tarpColor:    v => ({ tarpColor: v }),
      poleColor:    v => ({ poleColor: v }),
    });

  } else if (item.type === 'carpaSailcloth') {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight" style="color:#6b4423">Carpa Sailcloth</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Largo (m)</span>
          <input data-input="length" type="number" min="5" max="40" step="0.5" value="${item.dims.length}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho (m)</span>
          <input data-input="width" type="number" min="4" max="20" step="0.5" value="${item.dims.width}" class="input-field"/>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">H aleros (m)</span>
          <input data-input="eaveHeight" type="number" min="2" max="4" step="0.1" value="${item.dims.eaveHeight}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">H picos (m)</span>
          <input data-input="peakHeight" type="number" min="3.5" max="8" step="0.1" value="${item.dims.peakHeight}" class="input-field"/>
        </label>
      </div>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Nº picos centrales</span>
        <input data-input="peaks" type="number" min="1" max="5" step="1" value="${item.dims.peaks}" class="input-field"/>
      </label>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color tela</span>
          <input data-input="tarpColor" type="color" value="${item.tarpColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color mástiles</span>
          <input data-input="poleColor" type="color" value="${item.poleColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
      </div>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      length:     v => ({ dims: { ...item.dims, length:     clampNum(v, 5, 40) } }),
      width:      v => ({ dims: { ...item.dims, width:      clampNum(v, 4, 20) } }),
      eaveHeight: v => ({ dims: { ...item.dims, eaveHeight: clampNum(v, 2, 4) } }),
      peakHeight: v => ({ dims: { ...item.dims, peakHeight: clampNum(v, 3.5, 8) } }),
      peaks:      v => ({ dims: { ...item.dims, peaks:      Math.round(clampNum(v, 1, 5)) } }),
      tarpColor:  v => ({ tarpColor: v }),
      poleColor:  v => ({ poleColor: v }),
    });

  } else if (item.type === 'carpaTipi' || item.type === 'carpaDomo') {
    const isTipi = item.type === 'carpaTipi';
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight" style="color:#6b4423">${isTipi ? 'Carpa Tipi' : 'Carpa Domo'}</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Diámetro (m)</span>
          <input data-input="diameter" type="number" min="3" max="20" step="0.5" value="${item.dims.diameter}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Altura (m)</span>
          <input data-input="height" type="number" min="2.5" max="10" step="0.1" value="${item.dims.height}" class="input-field"/>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color tela</span>
          <input data-input="tarpColor" type="color" value="${item.tarpColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color ${isTipi ? 'palos' : 'estructura'}</span>
          <input data-input="poleColor" type="color" value="${item.poleColor}" class="input-field" style="padding:2px;height:36px"/>
        </label>
      </div>
      ${!isTipi ? `
        <label class="flex items-center justify-between mb-3 cursor-pointer">
          <span class="text-[13px]">Domo transparente</span>
          <input data-input="transparent" type="checkbox" ${item.transparent ? 'checked' : ''}/>
        </label>
      ` : ''}
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      diameter:    v => ({ dims: { ...item.dims, diameter: clampNum(v, 3, 20) } }),
      height:      v => ({ dims: { ...item.dims, height:   clampNum(v, 2.5, 10) } }),
      tarpColor:   v => ({ tarpColor: v }),
      poleColor:   v => ({ poleColor: v }),
      transparent: v => ({ transparent: v === 'on' || v === true }),
    });
    // El checkbox necesita wire manual porque wireSimpleInputs lee .value
    if (!isTipi) {
      const cb = panel.querySelector('[data-input="transparent"]');
      cb?.addEventListener('change', () => {
        A.update(item.id, { transparent: cb.checked });
      });
    }

  } else if (item.type === 'poste') {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight" style="color:#6b4423">Poste</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ø (m)</span>
          <input data-input="diameter" type="number" min="0.04" max="0.5" step="0.01" value="${item.dims.diameter}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Altura (m)</span>
          <input data-input="height" type="number" min="0.5" max="8" step="0.1" value="${item.dims.height}" class="input-field"/>
        </label>
      </div>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color</span>
        <input data-input="color" type="color" value="${item.color}" class="input-field" style="padding:2px;height:36px"/>
      </label>
      <label class="flex items-center justify-between mb-3 cursor-pointer">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Mostrar medidas</span>
        <input data-input="showLabel" type="checkbox" ${item.showLabel ? 'checked' : ''}/>
      </label>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      diameter: v => ({ dims: { ...item.dims, diameter: clampNum(v, 0.04, 0.5) } }),
      height:   v => ({ dims: { ...item.dims, height:   clampNum(v, 0.5, 8) } }),
      color:    v => ({ color: v }),
    });
    const cbLabel = panel.querySelector('[data-input="showLabel"]');
    cbLabel?.addEventListener('change', () => { A.update(item.id, { showLabel: cbLabel.checked }); });

} else if (item.type === 'barraLibre') {
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">Barra Libre</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Largo (m)</span>
          <input data-input="length" type="number" min="1" max="10" step="0.5" value="${item.dims.length}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho (m)</span>
          <input data-input="width" type="number" min="0.5" max="1.5" step="0.05" value="${item.dims.width}" class="input-field"/>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Nº cubiteras</span>
          <input data-input="cubiteras" type="number" min="1" max="10" step="1" value="${item.cubiteras ?? 2}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Separación (m)</span>
          <input data-input="cubSep" type="number" min="0.3" max="2" step="0.1" value="${item.cubSep ?? 1.0}" class="input-field"/>
        </label>
      </div>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color cuerpo</span>
        <input data-input="color" type="color" value="${item.color || '#1a1a1c'}" class="input-field" style="padding:2px;height:36px"/>
      </label>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    wireSimpleInputs(panel, item, A, {
      length:    v => ({ dims: { ...item.dims, length: clampNum(v, 1, 10) } }),
      width:     v => ({ dims: { ...item.dims, width:  clampNum(v, 0.5, 1.5) } }),
      cubiteras: v => ({ cubiteras: Math.round(clampNum(v, 1, 10)) }),
      cubSep:    v => ({ cubSep: clampNum(v, 0.3, 2) }),
      color:     v => ({ color: v }),
    });

  } else if (item.type === 'ambiente') {
    const sub = item.subtype;
    const title = sub === 'alfombra' ? 'Alfombra' : sub === 'planta' ? 'Planta' : 'Spot de Luz';
    const dimInputs = sub === 'alfombra' ? `
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Largo (m)</span>
          <input data-input="length" type="number" min="0.5" max="20" step="0.5" value="${item.dims.length}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho (m)</span>
          <input data-input="width" type="number" min="0.5" max="10" step="0.25" value="${item.dims.width}" class="input-field"/>
        </label>
      </div>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color alfombra</span>
        <input data-input="color" type="color" value="${item.color}" class="input-field" style="padding:2px;height:36px"/>
      </label>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color borde</span>
        <input data-input="borderColor" type="color" value="${item.borderColor || '#c9a55a'}" class="input-field" style="padding:2px;height:36px"/>
      </label>
    ` : sub === 'planta' ? `
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Altura (m)</span>
        <input data-input="height" type="number" min="0.3" max="3" step="0.1" value="${item.dims.height}" class="input-field"/>
      </label>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color planta</span>
          <input data-input="color" type="color" value="${item.color}" class="input-field" style="padding:2px;height:36px"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color maceta</span>
          <input data-input="potColor" type="color" value="${item.potColor || '#8b5e3c'}" class="input-field" style="padding:2px;height:36px"/>
        </label>
      </div>
    ` : `
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Altura trípode (m)</span>
        <input data-input="height" type="number" min="0.5" max="4" step="0.1" value="${item.dims.height}" class="input-field"/>
      </label>
      <label class="block mb-3">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color luz</span>
        <input data-input="color" type="color" value="${item.color || '#fffbe8'}" class="input-field" style="padding:2px;height:36px"/>
      </label>
    `;
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">${title}</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">Ambiente · ID #${item.id}</div>
      ${dimInputs}
      <label class="flex items-center justify-between mb-3 cursor-pointer">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Mostrar medidas</span>
        <input data-input="showLabel" type="checkbox" ${item.showLabel ? 'checked' : ''}/>
      </label>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    const recipes = sub === 'alfombra' ? {
      length:      v => ({ dims: { ...item.dims, length: clampNum(v, 0.5, 20) } }),
      width:       v => ({ dims: { ...item.dims, width:  clampNum(v, 0.5, 10) } }),
      color:       v => ({ color: v }),
      borderColor: v => ({ borderColor: v }),
    } : sub === 'planta' ? {
      height:   v => ({ dims: { ...item.dims, height: clampNum(v, 0.3, 3) } }),
      color:    v => ({ color: v }),
      potColor: v => ({ potColor: v }),
    } : {
      height: v => ({ dims: { ...item.dims, height: clampNum(v, 0.5, 4) } }),
      color:  v => ({ color: v }),
    };
    wireSimpleInputs(panel, item, A, recipes);
    const cbAmb = panel.querySelector('[data-input="showLabel"]');
    cbAmb?.addEventListener('change', () => { A.update(item.id, { showLabel: cbAmb.checked }); });

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

  } else if (item.type === 'schemaSurface') {
    const title = item.catalogName || item.subtype || 'Superficie';
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">${title}</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">Superficie · ID #${item.id}</div>
      <div class="grid grid-cols-2 gap-2 mb-3">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Largo (m)</span>
          <input id="surf-length" type="number" min="0.5" max="200" step="0.5" value="${(item.dims?.length ?? 4).toFixed(1)}" class="input-field"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho (m)</span>
          <input id="surf-width" type="number" min="0.5" max="200" step="0.5" value="${(item.dims?.width ?? 4).toFixed(1)}" class="input-field"/>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2 mb-4">
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color relleno</span>
          <input id="surf-color" type="color" value="${item.color || '#6F8E57'}" class="input-field" style="padding:2px;height:36px"/>
        </label>
        <label class="block">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Color borde</span>
          <input id="surf-border" type="color" value="${item.borderColor || '#2F5A29'}" class="input-field" style="padding:2px;height:36px"/>
        </label>
      </div>
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    panel.style.display = 'block';
    panel.classList.add('is-open');
    if (window.lucide) lucide.createIcons();
    content.querySelector('#surf-length')?.addEventListener('input', e => {
      A.update(item.id, { dims: { ...(item.dims || {}), length: Math.max(0.5, parseFloat(e.target.value) || 4) } }, { skipDetailRebuild: true });
    });
    content.querySelector('#surf-width')?.addEventListener('input', e => {
      A.update(item.id, { dims: { ...(item.dims || {}), width: Math.max(0.5, parseFloat(e.target.value) || 4) } }, { skipDetailRebuild: true });
    });
    content.querySelector('#surf-color')?.addEventListener('input', e => {
      A.update(item.id, { color: e.target.value }, { skipDetailRebuild: true });
    });
    content.querySelector('#surf-border')?.addEventListener('input', e => {
      A.update(item.id, { borderColor: e.target.value }, { skipDetailRebuild: true });
    });
    panel.querySelector('[data-act="dup"]')?.addEventListener('click', () => A.duplicate(item.id));
    panel.querySelector('[data-act="del"]')?.addEventListener('click', () => A.remove(item.id));
    return;

  } else {
    const d = item.dims || {};
    const hasLength = d.length !== undefined;
    const hasWidth  = d.width  !== undefined;
    const hasHeight = d.height !== undefined;
    const hasDiam   = d.diameter !== undefined;
    const title = item.catalogName || item.subtype || item.type || 'Elemento';
    content.innerHTML = `
      <div class="display-font text-2xl mb-1 leading-tight">${title}</div>
      <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">${item.type} · ID #${item.id}</div>
      ${hasDiam ? `
        <label class="block mb-3">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Diámetro (m)</span>
          <input id="gen-diam" type="number" min="0.2" max="50" step="0.1" value="${d.diameter.toFixed(2)}" class="input-field"/>
        </label>` : ''}
      ${hasLength ? `
        <label class="block mb-3">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Largo (m)</span>
          <input id="gen-length" type="number" min="0.2" max="200" step="0.1" value="${d.length.toFixed(2)}" class="input-field"/>
        </label>` : ''}
      ${hasWidth ? `
        <label class="block mb-3">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Ancho (m)</span>
          <input id="gen-width" type="number" min="0.2" max="200" step="0.1" value="${d.width.toFixed(2)}" class="input-field"/>
        </label>` : ''}
      ${hasHeight ? `
        <label class="block mb-3">
          <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Altura (m)</span>
          <input id="gen-height" type="number" min="0.1" max="50" step="0.1" value="${d.height.toFixed(2)}" class="input-field"/>
        </label>` : ''}
      <div class="rule"></div>
      <div class="flex gap-2">
        <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
        <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
      </div>
    `;
    panel.style.display = 'block';
    panel.classList.add('is-open');
    if (window.lucide) lucide.createIcons();
    const patchDims = (key, val) => A.update(item.id, { dims: { ...(item.dims || {}), [key]: Math.max(0.1, parseFloat(val) || 1) } }, { skipDetailRebuild: true });
    content.querySelector('#gen-diam')?.addEventListener('input',   e => patchDims('diameter', e.target.value));
    content.querySelector('#gen-length')?.addEventListener('input', e => patchDims('length',   e.target.value));
    content.querySelector('#gen-width')?.addEventListener('input',  e => patchDims('width',    e.target.value));
    content.querySelector('#gen-height')?.addEventListener('input', e => patchDims('height',   e.target.value));
    panel.querySelector('[data-act="dup"]')?.addEventListener('click', () => A.duplicate(item.id));
    panel.querySelector('[data-act="del"]')?.addEventListener('click', () => A.remove(item.id));
    return;
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
  hideItemSettingsHandle();
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
  if (p) { p.style.display = 'none'; p.classList.remove('is-open'); }
  hideItemSettingsHandle();
}

function refreshUndoBadge() {
  const A = dynamic.AppState;
  const badge = _els().undo;
  if (!badge || !A) return;
  const n = A.history.length;
  badge.textContent = `(${n}/${A._getUndoLimit?.() ?? 5})`;
  badge.style.opacity = n === 0 ? '0.4' : '1';
  badge.style.color = n > 0 ? 'var(--ink)' : '';
}

export const UIManager = {
  async init() {
    await bindDeps();

    // Detail panel: swipe-down para cerrar en móvil
    const _detailPanel = document.getElementById('detail-panel');
    if (_detailPanel) {
      let _swipeStartY = 0;
      _detailPanel.addEventListener('touchstart', e => { _swipeStartY = e.touches[0].clientY; }, { passive: true });
      _detailPanel.addEventListener('touchend', e => {
        if (e.changedTouches[0].clientY - _swipeStartY > 80) hideDetail();
      }, { passive: true });
    }

    // Hamburger móvil
    const _mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (_mobileMenuBtn) {
      _mobileMenuBtn.addEventListener('click', e => {
        e.stopPropagation();
        document.body.classList.toggle('mobile-menu-open');
      });
      // Cierra al pulsar fuera del header o la barra móvil
      document.addEventListener('pointerdown', e => {
        if (!e.target.closest('#header-mac, #mobile-header-bar, .hdr-popover')) {
          document.body.classList.remove('mobile-menu-open');
        }
      }, true);
      // Cierra el drawer al pulsar cualquier botón dentro del header
      document.getElementById('header-mac')?.addEventListener('click', e => {
        if (e.target.closest('.hdr-chip, .hdr-icon, .hdr-seg')) {
          document.body.classList.remove('mobile-menu-open');
        }
      });
    }

    // Botones de cámara duplicados en la barra móvil
    const _syncMobCam = () => {
      const topActive = document.getElementById('cam-top')?.classList.contains('active');
      document.getElementById('mob-cam-top')?.classList.toggle('active', !!topActive);
      document.getElementById('mob-cam-iso')?.classList.toggle('active', !topActive);
    };
    document.getElementById('mob-cam-iso')?.addEventListener('click', () => {
      document.getElementById('cam-iso')?.click();
      setTimeout(_syncMobCam, 50);
    });
    document.getElementById('mob-cam-top')?.addEventListener('click', () => {
      document.getElementById('cam-top')?.click();
      setTimeout(_syncMobCam, 50);
    });
    document.addEventListener('escale:camera-changed', _syncMobCam);
  },
  refresh,
  hideTooltip, updateTooltipPosition,
  showDetail, showMultiDetail, hideDetail,
  refreshUndoBadge,
  updateCarpaPostsCount
};
import { PropertyRenderer } from './PropertyRenderer.js';

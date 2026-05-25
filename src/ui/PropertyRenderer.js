import { SchemaRegistry } from '../schemas/SchemaRegistry.js';
import { buildPatch, clamp, deepMerge, getValueAtPath } from '../schemas/SchemaUtils.js';
import { ElementLibrary } from '../core/ElementLibrary.js';

function canRender(item) {
  return Boolean(SchemaRegistry.resolve(item));
}

function displayValue(item, param) {
  if (typeof param.read === 'function') return param.read(item, param);
  return getValueAtPath(item, param.path, param.default);
}

function parseRawValue(param, element) {
  if (param.type === 'toggle') return Boolean(element.checked);
  if (param.type === 'number' || param.type === 'range') return Number(element.value);
  return element.value;
}

function normalizeValue(param, value) {
  if (typeof param.coerce === 'function') return param.coerce(value, param);
  if (param.type === 'number' || param.type === 'range') {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return Number(param.default || 0);
    if (param.min !== undefined || param.max !== undefined) {
      return clamp(numeric, param.min ?? Number.NEGATIVE_INFINITY, param.max ?? Number.POSITIVE_INFINITY);
    }
    return numeric;
  }
  return value;
}

function patchForParam(item, param, nextValue) {
  if (typeof param.write === 'function') return param.write(nextValue, item, param) || {};
  const basePatch = param.path ? buildPatch(param.path, nextValue) : {};
  if (typeof param.onChange === 'function') {
    return deepMerge(basePatch, param.onChange({ value: nextValue, item, param, patch: basePatch }) || {});
  }
  return basePatch;
}

function isVisible(item, param) {
  if (typeof param.visibleIf === 'function') return Boolean(param.visibleIf(item, param));
  return true;
}

function resolveCategory(item, schema) {
  const definition = item.catalogDefinitionId ? ElementLibrary.find(item.catalogDefinitionId) : null;
  return definition?.category || item.catalogCategory || schema?.metadata?.category || item.category || '';
}

function categoryDefinitions(item, schema) {
  const category = resolveCategory(item, schema);
  if (!category || !ElementLibrary.data?.[category]?.length) return [];
  return ElementLibrary.data[category];
}

function currentDefinitionId(item, schema) {
  if (item.catalogDefinitionId) return item.catalogDefinitionId;
  const definitions = categoryDefinitions(item, schema);
  const direct = definitions.find(def => def.type === item.type && String(def.subtype || '') === String(item.subtype || ''));
  if (direct) return direct.id;
  const schemaMatch = definitions.find(def => def.schemaId && def.schemaId === item.schemaId);
  return schemaMatch?.id || '';
}

function fieldMarkup(item, param) {
  const value = displayValue(item, param);
  const label = param.label || param.key;
  const unit = param.unit ? `<span class="mono text-[9px] uppercase tracking-widest" style="color:var(--muted)">${param.unit}</span>` : '';
  const hint = param.suffix ? `<span class="mono text-[9px] uppercase tracking-widest" style="color:var(--muted)">${param.suffix}</span>` : unit;

  if (param.type === 'toggle') {
    return `
      <label class="flex items-center justify-between gap-3 py-1.5">
        <span class="text-[12px]">${label}</span>
        <input data-param-key="${param.key}" type="checkbox" ${value ? 'checked' : ''}/>
      </label>
    `;
  }

  if (param.type === 'select') {
    const options = (param.options || []).map(option => `
      <option value="${option.value}" ${String(option.value) === String(value) ? 'selected' : ''}>${option.label}</option>
    `).join('');
    return `
      <label class="block">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">${label}</span>
        <select data-param-key="${param.key}" class="input-field">${options}</select>
      </label>
    `;
  }

  if (param.type === 'color') {
    return `
      <label class="block">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">${label}</span>
        <input data-param-key="${param.key}" type="color" value="${value || '#CCCCCC'}" class="input-field" style="padding:2px;height:36px"/>
      </label>
    `;
  }

  if (param.type === 'range') {
    return `
      <label class="block">
        <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">${label}</span>
        <div class="flex items-center gap-2">
          <input data-param-key="${param.key}" type="range" min="${param.min ?? 0}" max="${param.max ?? 100}" step="${param.step ?? 1}" value="${value}" class="flex-1"/>
          <span class="mono text-[10px]" style="min-width:44px">${Number(value).toFixed(2)}</span>
        </div>
      </label>
    `;
  }

  const type = param.type === 'number' ? 'number' : 'text';
  const attrs = [
    `data-param-key="${param.key}"`,
    `type="${type}"`,
    `class="input-field"`,
    param.min !== undefined ? `min="${param.min}"` : '',
    param.max !== undefined ? `max="${param.max}"` : '',
    param.step !== undefined ? `step="${param.step}"` : '',
    param.maxLength !== undefined ? `maxlength="${param.maxLength}"` : '',
    `value="${value ?? ''}"`
  ].filter(Boolean).join(' ');

  return `
    <label class="block">
      <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">${label}</span>
      <div class="flex items-center gap-2">
        <input ${attrs}/>
        ${hint}
      </div>
    </label>
  `;
}

function groupMarkup(title, params, item, advanced = false) {
  if (!params.length) return '';
  const body = params.map(param => fieldMarkup(item, param)).join('');
  if (!advanced) {
    return `
      <div class="space-y-3">
        <div class="mono text-[9.5px] uppercase tracking-widest" style="color:var(--muted)">${title}</div>
        <div class="grid grid-cols-2 gap-2">${body}</div>
      </div>
    `;
  }
  return `
    <details class="schema-advanced-panel">
      <summary class="schema-advanced-summary">
        <span class="mono text-[10px] uppercase tracking-widest" style="color:var(--muted)">Ajustes avanzados</span>
        <span class="mono text-[10px]" style="color:var(--muted)">?</span>
      </summary>
      <div class="grid grid-cols-2 gap-2 pt-3">${body}</div>
    </details>
  `;
}

function bindFieldEvents(panel, item, params, AppState) {
  params.forEach(param => {
    const element = panel.querySelector(`[data-param-key="${param.key}"]`);
    if (!element) return;
    const useLiveInput = param.type === 'color'
      || param.type === 'range'
      || param.type === 'text'
      || param.type === 'number';
    const eventName = useLiveInput ? 'input' : 'change';
    element.addEventListener(eventName, () => {
      const raw = parseRawValue(param, element);
      const normalized = normalizeValue(param, raw);
      const patch = patchForParam(item, param, normalized);
      AppState.update(item.id, patch, { skipDetailRebuild: useLiveInput });
    });
  });
}

function replaceItem(AppState, item, nextItem) {
  if (!AppState || !item || !nextItem) return;
  if (typeof AppState.replace === 'function') {
    AppState.replace(item.id, nextItem);
    return;
  }

  const current = AppState.items?.find(entry => entry.id === item.id) || item;
  const keepCategoryStyle = Boolean(
    current.catalogCategory
    && nextItem.catalogCategory
    && current.catalogCategory === nextItem.catalogCategory
  );
  const patch = {
    ...nextItem,
    y: current.y ?? nextItem.y ?? 0,
    rotY: nextItem.rotY && nextItem.rotY !== 0 ? nextItem.rotY : (current.rotY ?? 0),
    locked: current.locked ?? false,
    catalogDefinitionId: nextItem.catalogDefinitionId || current.catalogDefinitionId || '',
    catalogCategory: nextItem.catalogCategory || current.catalogCategory || '',
    catalogName: nextItem.catalogName || current.catalogName || ''
  };

  delete patch.id;
  delete patch.x;
  delete patch.z;

  if (current.labelText && (!patch.labelText || keepCategoryStyle)) patch.labelText = current.labelText;
  if (current.color && (!patch.color || keepCategoryStyle)) patch.color = current.color;
  if (current.textColor && (!patch.textColor || keepCategoryStyle)) patch.textColor = current.textColor;
  if (current.display?.textSize && (!patch.display?.textSize || keepCategoryStyle)) {
    patch.display = { ...(patch.display || {}), textSize: current.display.textSize };
  }

  AppState.update(item.id, patch);
}

function bindTypeSwitcher(panel, item, schema, AppState) {
  const select = panel.querySelector('[data-item-definition]');
  if (!select) return;
  select.addEventListener('change', () => {
    const definition = ElementLibrary.find(select.value);
    if (!definition) return;
    const nextItem = ElementLibrary.toItem(definition, { x: item.x, z: item.z });
    replaceItem(AppState, item, nextItem);
  });
}

function render({ item, panel, content, AppState }) {
  const schema = SchemaRegistry.resolve(item);
  if (!schema || !panel || !content) return false;

  const visibleParams = (schema.params || []).filter(param => isVisible(item, param));
  const basic = visibleParams.filter(param => param.level !== 'advanced');
  const advanced = visibleParams.filter(param => param.level === 'advanced');
  const title = item.catalogName || item.labelText || schema.metadata?.label || item.type;
  const subtitle = [item.name, item.subtype, `ID #${item.id}`].filter(Boolean).join(' · ');
  const definitions = categoryDefinitions(item, schema);
  const selectedDefinitionId = currentDefinitionId(item, schema);
  const typeSwitcher = definitions.length > 1 ? `
    <label class="block mb-4">
      <span class="mono text-[9.5px] uppercase block mb-1" style="color:var(--muted)">Tipo</span>
      <select data-item-definition class="input-field">
        ${definitions.map(def => `<option value="${def.id}" ${def.id === selectedDefinitionId ? 'selected' : ''}>${def.name}</option>`).join('')}
      </select>
    </label>
  ` : '';

  content.innerHTML = `
    <div class="display-font text-2xl mb-1 leading-tight">${title}</div>
    <div class="mono text-[10px] uppercase tracking-widest mb-4" style="color:var(--muted)">${subtitle}</div>
    ${typeSwitcher}
    ${groupMarkup('Parametros basicos', basic, item, false)}
    ${advanced.length ? '<div class="rule"></div>' : ''}
    ${groupMarkup('Ajustes avanzados', advanced, item, true)}
    <div class="rule"></div>
    <div class="flex gap-2">
      <button data-act="dup" class="btn ghost flex-1 justify-center"><i data-lucide="copy" class="w-3.5 h-3.5"></i>Duplicar</button>
      <button data-act="del" class="btn danger ghost flex-1 justify-center"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Eliminar</button>
    </div>
  `;

  panel.style.display = 'block';
  if (window.lucide) lucide.createIcons();

  bindFieldEvents(panel, item, visibleParams, AppState);
  bindTypeSwitcher(panel, item, schema, AppState);
  panel.querySelector('[data-act="dup"]')?.addEventListener('click', () => AppState.duplicate(item.id));
  panel.querySelector('[data-act="del"]')?.addEventListener('click', () => AppState.remove(item.id));
  return true;
}

export const PropertyRenderer = {
  canRender,
  render
};


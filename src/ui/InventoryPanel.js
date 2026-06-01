import { AppState } from '../core/AppState.js';
import {
  getInventoryTotalItems,
  getInventoryTotalPax,
  groupInventoryLines
} from '../core/InventoryRules.js';

/* ─── Persistencia de precios y margen ──────────────────────────────────────
   Los precios por unidad se guardan por etiqueta de línea de inventario.
   El margen es global y SIEMPRE privado: nunca se exporta y puede ocultarse
   en pantalla con el ojo (para compartir pantalla sin revelarlo al cliente). */
const PRICES_KEY = 'escale_inventory_prices';
const MARGIN_KEY = 'escale_inventory_margin';
const MARGIN_HIDDEN_KEY = 'escale_inventory_margin_hidden';

let _prices = {};
let _margin = 0;
let _marginHidden = false;

function _loadState() {
  try { _prices = JSON.parse(localStorage.getItem(PRICES_KEY) || '{}') || {}; }
  catch { _prices = {}; }
  const m = parseFloat(localStorage.getItem(MARGIN_KEY));
  _margin = Number.isFinite(m) ? m : 0;
  _marginHidden = localStorage.getItem(MARGIN_HIDDEN_KEY) === '1';
}

function _savePrices() {
  try { localStorage.setItem(PRICES_KEY, JSON.stringify(_prices)); } catch {}
}
function _saveMargin() {
  try { localStorage.setItem(MARGIN_KEY, String(_margin)); } catch {}
}
function _saveMarginHidden() {
  try { localStorage.setItem(MARGIN_HIDDEN_KEY, _marginHidden ? '1' : '0'); } catch {}
}

function getUnitPrice(label) {
  const v = parseFloat(_prices[label]);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function setUnitPrice(label, value) {
  const v = parseFloat(value);
  if (Number.isFinite(v) && v > 0) _prices[label] = v;
  else delete _prices[label];
  _savePrices();
}

/** Subtotal de coste base (sin margen) de toda la escena. */
function getInventorySubtotal(items = AppState.items) {
  let total = 0;
  groupInventoryLines(items).forEach(group => {
    group.lines.forEach(line => {
      total += getUnitPrice(line.label) * line.count;
    });
  });
  return total;
}

function getMarginPercent() { return _margin; }

const _fmt = n => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function init() {
  _loadState();

  const marginInput = document.getElementById('inv-margin-input');
  if (marginInput) {
    marginInput.value = _margin > 0 ? String(_margin) : '';
    marginInput.addEventListener('input', () => {
      const v = parseFloat(marginInput.value);
      _margin = Number.isFinite(v) && v > 0 ? Math.min(500, v) : 0;
      _saveMargin();
      _updateTotals();
    });
  }

  const eye = document.getElementById('inv-margin-eye');
  if (eye) {
    eye.addEventListener('click', () => {
      _marginHidden = !_marginHidden;
      _saveMarginHidden();
      _applyMarginVisibility();
    });
  }

  refresh();
}

/** Muestra/oculta los valores del margen (privado al compartir pantalla). */
function _applyMarginVisibility() {
  const row = document.getElementById('inv-margin-row');
  const amount = document.getElementById('inv-margin-amount');
  const eye = document.getElementById('inv-margin-eye');
  if (row) row.style.visibility = _marginHidden ? 'hidden' : 'visible';
  if (amount) amount.style.visibility = _marginHidden ? 'hidden' : 'visible';
  if (eye) {
    eye.innerHTML = `<i data-lucide="${_marginHidden ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>`;
    eye.title = _marginHidden
      ? 'Mostrar margen'
      : 'Ocultar margen (no visible al compartir pantalla)';
    if (window.lucide) lucide.createIcons();
  }
}

function _updateTotals() {
  const subtotalEl = document.getElementById('inv-subtotal-price');
  const marginAmountEl = document.getElementById('inv-margin-amount');
  const totalEl = document.getElementById('inv-total-price');

  const subtotal = getInventorySubtotal(AppState.items);
  const marginAmount = subtotal * (_margin / 100);
  const total = subtotal + marginAmount;

  if (subtotalEl) subtotalEl.textContent = subtotal > 0 ? _fmt(subtotal) : '—';
  if (marginAmountEl) marginAmountEl.textContent = subtotal > 0 ? _fmt(marginAmount) : '—';
  if (totalEl) totalEl.textContent = subtotal > 0 ? _fmt(total) : '—';
}

function refresh() {
  const list = document.getElementById('inventory-list');
  const totalPax = document.getElementById('inv-total-pax');
  const totalItems = document.getElementById('inv-total-items');

  if (!list || !totalPax || !totalItems) return;

  const groups = groupInventoryLines(AppState.items);
  const manualPaxVal = document.getElementById('inventory-manual-pax')?.value;
  const autoPax = getInventoryTotalPax(AppState.items);
  const displayPax = manualPaxVal && parseInt(manualPaxVal) > 0 ? parseInt(manualPaxVal) : autoPax;
  totalPax.textContent = String(displayPax);
  totalItems.textContent = String(getInventoryTotalItems(AppState.items));

  if (!groups.length) {
    list.innerHTML = `
      <div class="inventory-empty">
        <div class="inventory-empty-title">Aún no hay elementos presupuestables</div>
        <p>Mesas, sillas, buffets, barras y carpas aparecerán aquí.</p>
      </div>
    `;
    _updateTotals();
    _applyMarginVisibility();
    return;
  }

  list.innerHTML = groups.map(group => `
    <section class="inventory-group">
      <div class="inventory-group-head">
        <span>${group.label}</span>
      </div>
      <div class="inventory-group-lines">
        ${group.lines.map(line => {
          const unit = getUnitPrice(line.label);
          const lineTotal = unit * line.count;
          return `
          <div class="inventory-line">
            <div class="inventory-line-main">
              <span class="inventory-line-count">${line.count}x</span>
              <span class="inventory-line-label">${escHtml(line.label)}</span>
            </div>
            <div class="inventory-line-price">
              <input type="number" min="0" step="0.01" placeholder="0,00"
                class="inventory-price-input" data-price-label="${escAttr(line.label)}"
                value="${unit > 0 ? unit : ''}"/>
              <span class="inventory-price-unit">€/u</span>
              <span class="inventory-line-subtotal">${lineTotal > 0 ? _fmt(lineTotal) : '—'}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>
  `).join('');

  // Bind inputs de precio unitario
  list.querySelectorAll('.inventory-price-input').forEach(input => {
    input.addEventListener('input', () => {
      setUnitPrice(input.dataset.priceLabel, input.value);
      _updateTotals();
      // Actualizar el subtotal de la línea en vivo sin re-render completo
      const label = input.dataset.priceLabel;
      const group = groups.find(g => g.lines.some(l => l.label === label));
      const line = group?.lines.find(l => l.label === label);
      if (line) {
        const subtotalEl = input.parentElement.querySelector('.inventory-line-subtotal');
        const lineTotal = getUnitPrice(label) * line.count;
        if (subtotalEl) subtotalEl.textContent = lineTotal > 0 ? _fmt(lineTotal) : '—';
      }
    });
  });

  _updateTotals();
  _applyMarginVisibility();
}

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}
function escAttr(str) { return escHtml(str); }

export const InventoryPanel = {
  init,
  refresh,
  getUnitPrice,
  getInventorySubtotal,
  getMarginPercent
};

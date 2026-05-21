import { AppState } from '../core/AppState.js';
import {
  getInventoryTotalItems,
  getInventoryTotalPax,
  groupInventoryLines
} from '../core/InventoryRules.js';

function init() {
  refresh();
}

function refresh() {
  const list = document.getElementById('inventory-list');
  const totalPax = document.getElementById('inv-total-pax');
  const totalItems = document.getElementById('inv-total-items');
  const totalPrice = document.getElementById('inv-total-price');

  if (!list || !totalPax || !totalItems || !totalPrice) return;

  const groups = groupInventoryLines(AppState.items);
  totalPax.textContent = String(getInventoryTotalPax(AppState.items));
  totalItems.textContent = String(getInventoryTotalItems(AppState.items));
  totalPrice.textContent = '—';

  if (!groups.length) {
    list.innerHTML = `
      <div class="inventory-empty">
        <div class="inventory-empty-title">Aún no hay elementos presupuestables</div>
        <p>Mesas, sillas, buffets, barras y carpas aparecerán aquí.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = groups.map(group => `
    <section class="inventory-group">
      <div class="inventory-group-head">
        <span>${group.label}</span>
      </div>
      <div class="inventory-group-lines">
        ${group.lines.map(line => `
          <div class="inventory-line">
            <div class="inventory-line-main">
              <span class="inventory-line-count">${line.count}x</span>
              <span class="inventory-line-label">${line.label}</span>
            </div>
            <span class="inventory-line-meta">${line.pax > 0 ? `${line.pax}p` : '—'}</span>
          </div>
        `).join('')}
      </div>
    </section>
  `).join('');
}

export const InventoryPanel = { init, refresh };

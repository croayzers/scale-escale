import { CatalogModal } from './CatalogModal.js';

const CATEGORIES = [
  { key: 'chairs', label: 'Sillas', icon: 'armchair' },
  { key: 'tables', label: 'Mesas', icon: 'circle-dot' },
  { key: 'decor', label: 'Carpas', icon: 'tent' },
  { key: 'bars', label: 'Buffets', icon: 'utensils' },
  { key: 'freebar', label: 'Barra libre', icon: 'wine' },
  { key: 'structures', label: 'Estructuras', icon: 'columns-3' },
  { key: 'ambient', label: 'Ambiente', icon: 'sparkles' }
];

function init() {
  const host = document.getElementById('dock-items');
  if (!host) return;

  host.innerHTML = '';

  CATEGORIES.forEach(category => {
    host.appendChild(makeCategoryButton(category));
  });

  const sep = document.createElement('div');
  sep.className = 'dock-sep';
  sep.setAttribute('aria-hidden', 'true');
  host.appendChild(sep);

  host.appendChild(makeInventoryButton());

  if (window.lucide) lucide.createIcons();
}

function makeCategoryButton(category) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.cat = category.key;
  button.dataset.dockKind = 'category';
  button.title = category.label;
  button.innerHTML = `<i data-lucide="${category.icon}" class="w-5 h-5"></i>`;
  button.addEventListener('click', () => toggleCategory(category.key, button));
  return button;
}

function makeInventoryButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'dock-inventory-btn';
  button.dataset.dockKind = 'inventory';
  button.title = 'Inventario';
  button.innerHTML = `<i data-lucide="shopping-cart" class="w-5 h-5"></i>`;
  button.addEventListener('click', () => {
    clearCategoryButtons();
    CatalogModal.close();
    document.dispatchEvent(new CustomEvent('escale:toggle-inventory'));
  });
  return button;
}

function toggleCategory(key, button) {
  const isActive = button.classList.contains('active');
  clearAllButtons();

  if (isActive) {
    CatalogModal.close();
    return;
  }

  button.classList.add('active');
  document.dispatchEvent(new CustomEvent('escale:inventory-close'));
  CatalogModal.open(key);
}

function clearCategoryButtons() {
  document
    .querySelectorAll('#dock-items button[data-dock-kind="category"]')
    .forEach(button => button.classList.remove('active'));
}

function clearAllButtons() {
  document
    .querySelectorAll('#dock-items button')
    .forEach(button => button.classList.remove('active'));
}

function setInventoryActive(active) {
  document.getElementById('dock-inventory-btn')?.classList.toggle('active', active);
}

export const Dock = {
  init,
  clearCategoryButtons,
  setInventoryActive
};

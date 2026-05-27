export const CATALOG_CATEGORIES = [
  { key: 'chairs', label: 'Sillas', icon: 'armchair' },
  { key: 'tables', label: 'Mesas', icon: 'circle-dot' },
  { key: 'decor', label: 'Carpas', icon: 'tent' },
  { key: 'bars', label: 'Buffet', icon: 'utensils-crossed' },
  { key: 'structures', label: 'Estructuras', icon: 'columns-3' },
  { key: 'ambient', label: 'Ambiente', icon: 'sparkles' },
  { key: 'scenography', label: 'Escenografia', icon: 'gallery-horizontal', pro: true },
  { key: 'services', label: 'Servicios', icon: 'shield-check', pro: true },
  { key: 'staff', label: 'Personal', icon: 'users', pro: true },
  { key: 'hospitality', label: 'Hosteleria', icon: 'martini', pro: true },
  { key: 'decoration', label: 'Decoracion', icon: 'flower-2', pro: true },
  { key: 'lighting', label: 'Iluminacion', icon: 'lamp', pro: true }
];

export const CATEGORY_KEYS = CATALOG_CATEGORIES.map(category => category.key);

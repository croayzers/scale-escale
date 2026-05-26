/**
 * BrandConfig — carga /brand/brand.json al arrancar y aplica
 * colores y tipografía como variables CSS en :root.
 *
 * Para cambiar la marca: edita los archivos en la carpeta /brand/
 *   /brand/logo.png   → logo del header
 *   /brand/brand.json → colores, tipografía, nombre de la app
 */

const BRAND_URL = '/brand/brand.json';

let _brand = null;

async function load() {
  try {
    const response = await fetch(BRAND_URL, { cache: 'no-cache' });
    if (!response.ok) return null;
    _brand = await response.json();
    apply(_brand);
    return _brand;
  } catch {
    // Sin brand.json la app usa los valores por defecto del CSS
    return null;
  }
}

function apply(brand) {
  if (!brand) return;
  const root = document.documentElement;

  const { colors = {}, typography = {} } = brand;

  if (colors.primary)   root.style.setProperty('--brand-primary',   colors.primary);
  if (colors.secondary) root.style.setProperty('--brand-secondary',  colors.secondary);
  if (colors.accent)    root.style.setProperty('--brand-accent',     colors.accent);
  if (colors.surface)   root.style.setProperty('--surface',          colors.surface);
  if (colors.text)      root.style.setProperty('--text',             colors.text);

  if (typography.displayFont) root.style.setProperty('--font-display', typography.displayFont);
  if (typography.bodyFont)    root.style.setProperty('--font-body',    typography.bodyFont);
  if (typography.monoFont)    root.style.setProperty('--font-mono',    typography.monoFont);
}

function get() { return _brand; }

export const BrandConfig = { load, get };

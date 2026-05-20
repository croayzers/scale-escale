/* Mesa imperial: rectangular muy larga (banquete) con sillas a ambos lados */
import { createMesaRect } from './mesaRect.js';

export function createMesaImperial(item) {
  // Reutiliza mesaRect pero con proporciones de imperial
  const cfg = {
    ...item,
    dims: {
      length: item.dims?.length ?? 6.0,
      width:  item.dims?.width  ?? 1.2,
    },
    chairSep: item.chairSep ?? 0.60,
    color: item.color || '#4a4744',
  };
  return createMesaRect(cfg);
}
/* ─────────────────────────────────────────────────────────
   MODEL FACTORY — Registry { type → builder }
   ────────────────────────────────────────────────────────
   Para añadir un nuevo tipo de elemento:
     1. crea src/models/MIELEMENTO.js exportando `createMiElemento(item)`
     2. impórtalo aquí
     3. añádelo al objeto `builders` con su `type`
   Cero cambios en el resto del proyecto.
   ───────────────────────────────────────────────────────── */

import { createMesa }   from './mesa.js';
import { createBuffet } from './buffet.js';
import { createCarpa }  from './carpa.js';

const builders = {
  mesa:   createMesa,
  buffet: createBuffet,
  carpa:  createCarpa,
};

export const ModelFactory = {
  /** Construye la geometría 3D de un item según su `type`.
   *  Devuelve un THREE.Group vacío si el tipo no está registrado. */
  create(item) {
    const builder = builders[item.type];
    if (!builder) {
      console.warn('[ModelFactory] tipo no registrado:', item.type);
      return new THREE.Group();
    }
    return builder(item);
  },

  /** Registra un nuevo builder en runtime (útil para extensiones futuras). */
  register(type, builder) {
    builders[type] = builder;
  }
};

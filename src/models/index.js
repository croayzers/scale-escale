/* ─────────────────────────────────────────────────────────
   MODEL FACTORY — Registry { type → builder }
   ───────────────────────────────────────────────────────── */
import { createMesa }           from './mesa.js';
import { createBuffet }         from './buffet.js';
import { createCarpa }          from './carpa.js';
import { createArbusto }        from './arbusto.js';
import { createArbol }          from './arbol.js';
import { createCableLuces }     from './cableLuces.js';
import { createRoom }           from './room.js';
import { createSillaCatering }  from './sillaCatering.js';
import { createSillaLineal }    from './sillaLineal.js';
import { createMesaRect }      from './mesaRect.js';
import { createMesaCocktail }  from './mesaCocktail.js';
import { createMesaImperial }  from './mesaImperial.js';
import { createMesaCurva }       from './mesaCurva.js';
import { createMesaSerpentina }  from './mesaSerpentina.js';
import { createCarpaCuadrada } from './carpaCuadrada.js';
import { createCarpaStar }     from './carpaStar.js';
import { createCarpaPabellon }  from './carpaPabellon.js';
import { createCarpaSailcloth } from './carpaSailcloth.js';
import { createCarpaBeduina } from './carpaBeduina.js';
import { createCarpaTipi }    from './carpaTipi.js';
import { createCarpaTransparente } from './carpaTransparente.js';
import { createCarpaDomo }         from './carpaDomo.js';
import { createPoste } from './poste.js';

const builders = {
  mesa:           createMesa,
  buffet:         createBuffet,
  carpa:          createCarpa,
  arbusto:        createArbusto,
  arbol:          createArbol,
  cableLuces:     createCableLuces,
  room:           createRoom,
  sillaCatering:  createSillaCatering,
  sillaLineal:    createSillaLineal,
  mesaRect:      createMesaRect,
  mesaCocktail:  createMesaCocktail,
  mesaImperial:  createMesaImperial,
  mesaCurva:      createMesaCurva,
  mesaSerpentina: createMesaSerpentina,
  carpaCuadrada: createCarpaCuadrada,
  carpaStar:     createCarpaStar,
  carpaPabellon:  createCarpaPabellon,
  carpaSailcloth: createCarpaSailcloth,
  carpaBeduina: createCarpaBeduina,
  carpaTipi:    createCarpaTipi,
  carpaTransparente: createCarpaTransparente,
  carpaDomo:         createCarpaDomo,
  poste: createPoste,
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

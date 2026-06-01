/* ─────────────────────────────────────────────────────────
   MODEL FACTORY — Registry { type → builder }
   ───────────────────────────────────────────────────────── */
import { createArbusto }        from './arbusto.js';
import { SchemaModelFactory }   from './schema/SchemaModelFactory.js';
import { buildText2D }          from './schema/builders/generic.js';
import { buildCeilingProp }     from './schema/builders/ceiling.js';

const builders = {
  arbusto:     createArbusto,
  text2d:      buildText2D,
  ceilingProp: buildCeilingProp,
};

export const ModelFactory = {
  /** Construye la geometría 3D de un item según su `type`.
   *  Devuelve un THREE.Group vacío si el tipo no está registrado. */
  create(item, context = {}) {
    const schemaGroup = SchemaModelFactory.create(item, context);
    if (schemaGroup) return schemaGroup;

    const builder = builders[item.type];
    if (!builder) {
      console.warn('[ModelFactory] tipo no registrado:', item.type);
      return new THREE.Group();
    }
    return builder(item, context.view || 'iso');
  },

  /** Registra un nuevo builder en runtime (útil para extensiones futuras). */
  register(type, builder) {
    builders[type] = builder;
  }
};

import { SchemaRegistry } from './SchemaRegistry.js';
import { deepClone, deepMerge } from './SchemaUtils.js';

const CATALOG_META_KEYS = new Set([
  'id',
  'name',
  'category',
  'icon',
  'style',
  'thumb',
  'defaultRotation'
]);

export function createItemFromCatalog(definition, { x = 0, z = 0 } = {}) {
  const draft = deepClone(definition || {});
  const schema = SchemaRegistry.resolve(draft);
  const hydrated = schema
    ? deepMerge(SchemaRegistry.defaultsFor(schema), draft)
    : draft;

  CATALOG_META_KEYS.forEach(key => {
    delete hydrated[key];
  });

  hydrated.x = x;
  hydrated.z = z;
  hydrated.rotY = ((definition?.defaultRotation || 0) * Math.PI) / 180;
  hydrated.catalogDefinitionId = definition?.id || '';
  hydrated.catalogCategory = definition?.category || '';
  hydrated.catalogName = definition?.name || '';

  if (schema) hydrated.schemaId = schema.id;
  return hydrated;
}

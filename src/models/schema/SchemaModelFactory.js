import { generateSchemaChildren } from '../../schemas/ChildrenEngine.js';
import { SchemaRegistry } from '../../schemas/SchemaRegistry.js';
import { SCHEMA_BUILDERS } from './SchemaBuilders.js';

function applyPlacement(mesh, placementItem) {
  mesh.position.set(
    placementItem.x || 0,
    placementItem.y || 0,
    placementItem.z || 0
  );
  mesh.rotation.y = placementItem.rotY || 0;
}

function createFromSchema(item, context = {}) {
  const schema = SchemaRegistry.resolve(item);
  if (!schema) return null;
  const enrichedItem = SchemaRegistry.enrichItem(item);
  const builderKey = schema.builder?.preset;
  const builder = SCHEMA_BUILDERS[builderKey];
  if (!builder) {
    console.warn('[SchemaModelFactory] builder no encontrado:', builderKey, schema.id);
    return null;
  }

  const view = context.view || 'iso';
  let group;
  try {
    group = builder(enrichedItem, view, schema, context) || new THREE.Group();
  } catch (error) {
    console.error('[SchemaModelFactory] builder failed', {
      schemaId: schema.id,
      builderKey,
      view,
      item: {
        type: enrichedItem.type,
        schemaId: enrichedItem.schemaId,
        catalogDefinitionId: enrichedItem.catalogDefinitionId || '',
        dims: enrichedItem.dims || {}
      },
      error
    });
    throw error;
  }
  group.userData.schemaId = schema.id;
  group.userData.schemaFamily = schema.family;

  const childDescriptors = generateSchemaChildren(enrichedItem, schema, context);
  childDescriptors.forEach(descriptor => {
    const childItem = SchemaRegistry.enrichItem(descriptor.item);
    const childMesh = createFromSchema(childItem, context);
    if (!childMesh) return;
    applyPlacement(childMesh, childItem);
    childMesh.userData.generatedChild = true;
    childMesh.userData.generatedKey = descriptor.key;
    group.add(childMesh);
  });

  return group;
}

export const SchemaModelFactory = {
  create: createFromSchema
};

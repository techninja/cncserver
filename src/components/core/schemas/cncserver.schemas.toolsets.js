/**
 * @file Toolset tool holder.
 *
 */
const schema = {
  type: 'object',
  title: 'Toolset',
  description: 'A set of tools saved as a preset.',
  required: ['name', 'title'],
  properties: {
    name: {
      type: 'string',
      title: 'Machine Name',
      description: 'Machine name identifier for this toolset.',
    },
    manufacturer: {
      type: 'string',
      title: 'Manufacturer',
      description: 'Original creator of the toolset.',
    },
    title: {
      type: 'string',
      title: 'Title',
      description: 'Human readable name for the toolset.',
    },
    description: {
      type: 'string',
      title: 'Description',
      description: 'Human readable description of the toolset.',
      format: 'textarea',
    },
    items: {
      type: 'array',
      title: 'Tool Items',
      description: 'Custom additional tools in the set.',
      items: {}, // Set in indexer as tools schema.
    },
  },
};

export default schema;

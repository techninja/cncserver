/**
 * @file Colorset settings schema.
 *
 */
/* eslint-disable max-len, global-require */
const properties = {
  name: {
    type: 'string',
    title: 'Machine Name',
    description: 'Machine name for the colorset, set from title.',
  },
  title: {
    type: 'string',
    title: 'Title',
    description: 'Human readable name for the colorset.',
  },
  manufacturer: {
    type: 'string',
    title: 'Manufacturer',
    description: 'Creator of this set of colors.',
    default: '',
  },
  description: {
    type: 'string',
    title: 'Description',
    description: 'Extra information about this colorset',
    format: 'textarea',
    default: '',
  },
  sortWeight: {
    type: 'integer',
    title: 'Sort Weighting',
    description: 'Sets display order for each colorset in the UI. Lower values rise, higher values sink.',
    format: 'range',
    minimum: -100,
    maximum: 100,
    default: 0,
  },
  implement: {
    type: 'string',
    title: 'Implement',
    description: 'Machine name of valid implement to draw with.',
    default: 'sharpie-ultra-fine-marker',
  },
  items: {
    type: 'array',
    title: 'Items',
    description: 'Colorset items representing all the colors/implements used.',
    items: {}, // Set in indexer as color schema.
  },
  toolset: {
    type: 'string',
    title: 'Toolset',
    description: 'Set of additional tools this colorset uses.',
    default: 'default',
  },
};

module.exports = () => ({
  type: 'object',
  required: ['title'],
  title: 'Colors',
  properties,
});

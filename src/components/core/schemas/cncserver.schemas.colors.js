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
  description: {
    type: 'string',
    title: 'Description',
    description: 'Extra information about this colorset',
    default: '',
  },
  implement: require('./cncserver.schemas.color.implement')(false),
  items: {
    type: 'array',
    title: 'Items',
    description: 'Colorset items representing all the colors/implements used.',
    items: {}, // Set in indexer as color schema.
  },
  tools: {
    type: 'array',
    title: 'Colorset tools',
    description: 'Tools defined by the colorset, usually relative to a placeholder tool position.',
    items: require('./cncserver.schemas.tools')(),
  },
};

module.exports = () => ({
  type: 'object',
  required: ['title'],
  title: 'Colors',
  properties,
});

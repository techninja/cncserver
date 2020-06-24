/**
 * @file Colorset settings schema.
 *
 */
/* eslint-disable max-len */
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
  // eslint-disable-next-line global-require
  implement: require('./cncserver.schemas.color.implement')(false),
  items: {
    type: 'array',
    title: 'Items',
    description: 'Colorset items representing all the colors/implements used.',
    items: {}, // Set in indexer as color schema.
  },
};

module.exports = () => ({
  type: 'object',
  required: ['title'],
  title: 'Colors',
  properties,
});

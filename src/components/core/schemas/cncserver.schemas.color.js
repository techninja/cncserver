/**
 * @file Colorset item settings schema.
 *
 */
/* eslint-disable max-len */
const properties = {
  id: {
    type: 'string',
    title: 'ID',
    description: 'Tool or machine name for the color.',
  },
  name: {
    type: 'string',
    title: 'Name of colorset item',
    description: 'Description of this color & implement',
  },
  color: {
    type: 'string',
    format: 'color',
    title: 'Hex color',
    description: 'Color that this item represents. Will be used to select areas to be printed with it.',
  },
  weight: {
    type: 'number',
    title: 'Color Weighting',
    description: 'Amount to adjust for color selection preference. Smaller than 0 selects less often, larger than 0 selects more often.',
    format: 'range',
    minimum: -1,
    maximum: 1,
    default: 0,
  },
  // eslint-disable-next-line global-require
  implement: require('./cncserver.schemas.color.implement')(true),
};

module.exports = () => ({
  type: 'object',
  title: 'Colorset Item',
  required: ['color', 'name', 'id'],
  properties,
});

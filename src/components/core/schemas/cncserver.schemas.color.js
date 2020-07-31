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
    title: 'Color',
    description: 'Color that this item represents. Will be used to select areas to be printed with it.',
  },
  selectionMethod: {
    type: 'string',
    title: 'Selection Method',
    description: 'When parsing the drawing, how should this be selected?',
    enum: ['color', 'opacity', 'strokeWidth'],
    default: 'color',
  },
  colorWeight: {
    type: 'number',
    title: 'Color Weighting',
    description: 'Amount to adjust for color selection preference. Smaller than 0 selects less often, larger than 0 selects more often.',
    format: 'range',
    minimum: -1,
    maximum: 1,
    default: 0,
    options: { dependencies: { selectionMethod: 'color' } },
  },
  opacityMin: {
    type: 'number',
    title: 'Minimum Opacity',
    description: 'Opacity must be ABOVE this for opacity selection method.',
    format: 'range',
    minimum: 0,
    maximum: 0.99,
    default: 0,
    options: { dependencies: { selectionMethod: 'opacity' } },
  },
  opacityMax: {
    type: 'number',
    title: 'Maximum Opacity',
    description: 'Opacity must be BELOW this for opacity selection method.',
    format: 'range',
    minimum: 0.01,
    maximum: 1,
    default: 0.75,
    options: { dependencies: { selectionMethod: 'opacity' } },
  },
  strokeWidthMin: {
    type: 'number',
    title: 'Minimum Stroke Width',
    description: 'Stroke width must be ABOVE this for stroke width selection method.',
    format: 'range',
    minimum: 0,
    maximum: 39.99,
    default: 0,
    options: { dependencies: { selectionMethod: 'strokeWidth' } },
  },
  strokeWidthMax: {
    type: 'number',
    title: 'Maximum Stroke Width',
    description: 'Stroke width must be BELOW this for stroke width selection method.',
    format: 'range',
    minimum: 0.01,
    maximum: 40,
    default: 2,
    options: { dependencies: { selectionMethod: 'strokeWidth' } },
  },
  // eslint-disable-next-line global-require
  implement: require('./cncserver.schemas.color.implement')(true),
};

module.exports = () => ({
  type: 'object',
  title: 'Colorset Item',
  required: ['color', 'name', 'id', 'selectionMethod'],
  properties,
});

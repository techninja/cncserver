/**
 * @file Colorset item implement schema.
 *
 */
/* eslint-disable max-len */
module.exports = allowInherit => ({
  type: 'object',
  title: 'Implement Details',
  properties: {
    type: {
      type: 'string',
      title: 'Type',
      description: 'Type of implement',
      enum: allowInherit ? ['inherit', 'brush', 'pen', 'other'] : ['brush', 'pen', 'other'],
      default: allowInherit ? 'inherit' : 'pen',
    },
    width: {
      type: 'number',
      title: 'Width',
      description: 'Calculated maximum effective width in mm of the implement being used.',
      format: 'range',
      minimum: 0.01,
      maximum: 35,
      default: 1,
    },
    length: {
      type: 'number',
      title: 'Length',
      description: 'Dynamic fulcrum length for the implement. Set to bristle length in mm for brushes, 0 for pens.',
      format: 'range',
      minimum: 0,
      maximum: 35,
      default: 0,
    },
    stiffness: {
      type: 'number',
      title: 'Stiffness',
      description: 'Stiffness of dynamic fulcrum length. Set to 1 for fully stiff (same as length 0), 1 for fully loose (soft bristles).',
      format: 'range',
      minimum: 0,
      maximum: 1,
      default: 1,
    },
    drawLength: {
      type: 'number',
      title: 'Draw Length',
      description: 'Distance in mm the implement can draw before it needs to be refreshed, 0 for pens.',
      format: 'range',
      minimum: 0,
      maximum: 3000,
      default: 0,
    },
    handleWidth: {
      type: 'number',
      title: 'Handle Width',
      description: 'Measured width of the handle, to account for center draw position offset.',
      format: 'range',
      minimum: 2,
      maximum: 20,
      default: 10,
    },
  },
});

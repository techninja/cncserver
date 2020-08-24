/**
 * @file Colorset item implement schema.
 *
 */
/* eslint-disable max-len */
module.exports = allowInherit => ({
  type: 'object',
  title: 'Implement Details',
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      title: 'Type',
      description: 'Type of implement',
      enum: allowInherit ? ['inherit', 'brush', 'pen', 'other'] : ['brush', 'pen', 'other'],
      default: allowInherit ? 'inherit' : 'pen',
    },
    manufacturer: {
      type: 'string',
      title: 'Manufacturer',
      description: 'Creator of this implement.',
      default: 'generic',
    },
    name: {
      type: 'string',
      title: 'Name',
      description: 'Human readable name of the implement.',
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
    handleColors: {
      type: 'array',
      title: 'Handle Color(s)',
      description: 'Color of the handle for the implement, helps with physical user selection.',
      items: {
        type: 'string',
        format: 'color',
        title: 'Color',
      },
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
      description: 'Dynamic fulcrum length for the implement. Set to bristle length in mm for brushes.',
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
      options: { dependencies: { type: ['brush', 'other'] } },
    },
    drawLength: {
      type: 'number',
      title: 'Draw Length',
      description: 'Distance in mm the implement can draw before it needs to be refreshed.',
      format: 'range',
      minimum: 0,
      maximum: 3000,
      default: 0,
      options: { dependencies: { type: 'brush' } },
    },
  },
});

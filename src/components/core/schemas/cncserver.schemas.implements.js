/**
 * @file Colorset item implement schema.
 *
 */
/* eslint-disable max-len */
const schema = {
  type: 'object',
  title: 'Implement Details',
  required: ['type', 'name'],
  properties: {
    type: {
      type: 'string',
      title: 'Type',
      description: 'Type of implement',
      enum: ['brush', 'pen', 'other'],
      default: 'pen',
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
      description: 'Machine readable name of the implement.',
    },
    title: {
      type: 'string',
      title: 'Title',
      description: 'Human readable name of the implement.',
    },
    sortWeight: {
      type: 'integer',
      title: 'Sort Weighting',
      description: 'Sets display order for each implement in the UI. Higher values sink, lower values rise.',
      format: 'range',
      minimum: -100,
      maximum: 100,
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
      step: 0.01,
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
      default: ['#000000'],
    },
    width: {
      type: 'number',
      title: 'Width',
      description: 'Calculated maximum effective width in mm of the implement being used.',
      format: 'range',
      minimum: 0.01,
      maximum: 35,
      default: 1,
      step: 0.01,
    },
    length: {
      type: 'number',
      title: 'Length',
      description: 'Dynamic fulcrum length for the implement. Set to bristle length in mm for brushes.',
      format: 'range',
      minimum: 0,
      maximum: 35,
      default: 0,
      step: 0.01,
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
      step: 0.01,
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
      step: 0.1,
    },
  },
};

export default schema;

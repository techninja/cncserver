/**
 * @file Individual Tool schema.
 *
 */
/* eslint-disable max-len */
const schema = {
  type: 'object',
  title: 'Tool',
  description: 'A tool defines a specific location (and optionally area) outside of the workspace to change a property of the current drawing implement.',
  required: ['id', 'x', 'y'],
  properties: {
    id: {
      type: 'string',
      title: 'ID',
      description: 'Machine name for colorset tool.',
    },
    title: {
      type: 'string',
      title: 'Title',
      description: 'Human readable name for the tool.',
    },
    x: {
      type: 'number',
      format: 'number',
      title: 'X Point',
      description: 'X coordinate of the position of the tool in mm.',
    },
    y: {
      type: 'number',
      format: 'number',
      title: 'Y Point',
      description: 'Y coordinate of top left position of the tool in mm away from parent top left.',
    },
    position: {
      type: 'string',
      title: 'Position Type',
      description: 'Height of the usable tool area in mm.',
      enum: ['center', 'topleft'],
      options: { enum_titles: ['Center (default)', 'Top Left'] },
      default: 'center',
    },
    width: {
      type: 'number',
      format: 'number',
      title: 'Width',
      description: 'Width of the usable tool area in mm.',
      minimum: 1,
    },
    height: {
      type: 'number',
      format: 'number',
      title: 'Height',
      description: 'Height of the usable tool area in mm.',
      minimum: 1,
    },
    radius: {
      type: 'number',
      format: 'number',
      title: 'Radius',
      description: 'Amount in mm to curve corners of tool area. Set to 0 for square corners.',
      minimum: 0,
    },
    parent: {
      type: 'string',
      title: 'Parent tool',
      description: 'Parent tool ID to base X and Y off of.',
      default: '',
    },
    group: {
      type: 'string',
      title: 'Tool Group',
      description: 'Arbitrary grouping tag for tools',
      default: '',
    },
  },
};

export default schema;

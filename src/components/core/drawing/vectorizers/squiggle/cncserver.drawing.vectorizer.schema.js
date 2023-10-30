/**
 * @file Settings schema for vectorizer method application.
 *
 * This schema defines the vectorizer method specific settings schema for the
 * application to import and use for settings validation and documentation.
 */
/* eslint-disable max-len */
const properties = {
  sampleWidth: {
    type: 'number',
    format: 'range',
    title: 'Sample Width',
    description: 'Sample size in mm across the raster.',
    default: 2,
    minimum: 0.5,
    maximum: 50,
  },
  angle: {
    type: 'number',
    format: 'range',
    title: 'Angle',
    description: 'If applicable, an angle offset for the vectorization to prefer.',
    default: 0,
    minimum: -360,
    maximum: 360,
  },
  spacing: {
    type: 'number',
    format: 'range',
    title: 'Spacing',
    description: 'Space between squiggle lines in mm.',
    minimum: 0.1,
    maximum: 100,
    default: 5,
  },
  overlap: {
    type: 'number',
    format: 'range',
    title: 'Overlap',
    description: 'Amount squiggle lines are allowed to overlap in mm, increases overall density.',
    minimum: 0,
    maximum: 50,
    default: 1,
  },
  maxDensity: {
    type: 'integer',
    format: 'range',
    title: 'Max Density',
    description: 'Number of waves per samplewidth.. I think?', // TODO: Need better words.
    default: 4,
    minimum: 1,
    maximum: 10,
  },
  joinPaths: {
    type: 'boolean',
    format: 'checkbox',
    title: 'Join paths',
    description: 'If true, squiggle path ends will be jonied. ',
    default: false,
  },
  skipWhite: {
    type: 'boolean',
    format: 'checkbox',
    title: 'Skip white',
    description: 'If true, no line will be drawn for 100% white raster pixel areas.',
    default: false,
  },
  offset: {
    type: 'object',
    title: 'Overlay Position Offset',
    description: 'How much to adjust the position of the overlay lines: X, Y in mm.',
    properties: {
      x: { title: 'X', type: 'number', default: 0 },
      y: { title: 'Y', type: 'number', default: 0 },
    },
  },
  style: {
    type: 'string',
    title: 'Style',
    description: 'Squiggle line style type.',
    default: 'lines',
    enum: ['lines', 'spiral'],
  },
  colorComponents: {
    type: 'object',
    title: 'Color Components',
    description: 'Which image color components to parse',
    properties: {
      cyan: {
        title: 'Parse Cyan',
        type: 'boolean',
        format: 'checkbox',
        default: false,
      },
      magenta: {
        title: 'Parse Magenta',
        format: 'checkbox',
        type: 'boolean',
        default: false,
      },
      yellow: {
        title: 'Parse Yellow',
        format: 'checkbox',
        type: 'boolean',
        default: false,
      },
      gray: {
        title: 'Parse Gray',
        format: 'checkbox',
        type: 'boolean',
        default: true,
      },
      red: {
        title: 'Parse Red',
        format: 'checkbox',
        type: 'boolean',
        default: false,
      },
      green: {
        title: 'Parse Green',
        format: 'checkbox',
        type: 'boolean',
        default: false,
      },
      blue: {
        title: 'Parse Blue',
        format: 'checkbox',
        type: 'boolean',
        default: false,
      },
    },
  },
};

const schema = {
  type: 'object',
  title: 'Squiggle Density Vectorization',
  options: { collapsed: true },
  properties,
};

export default schema;

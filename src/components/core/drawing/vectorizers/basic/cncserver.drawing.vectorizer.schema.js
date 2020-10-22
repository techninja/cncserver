/**
 * @file Settings schema for vectorizer method application.
 *
 * This schema defines the vectorizer method specific settings schema for the
 * application to import and use for settings validation and documentation.
 */
const properties = {
  colors: {
    type: 'integer',
    format: 'range',
    title: 'Colors',
    description: 'Number of colors to limit to.',
    default: 1,
    minimum: 1,
    maximum: 16,
  },
  centerline: {
    type: 'boolean',
    format: 'checkbox',
    title: 'Parse Centerline',
    description: 'If true will add a centerline to all filled areas.',
    default: false,
  },
  cleanup: {
    type: 'object',
    title: 'Cleanup Vectorization',
    description: 'Minor options for cleaning up the output of vectorization.',
    properties: {
      level: {
        type: 'integer',
        format: 'range',
        default: 0,
        minimum: 0,
        maximum: 20,
        title: 'Level',
        description: 'Amount of despeckle cleanup for small imperfections.',
      },
      tightness: {
        type: 'number',
        format: 'range',
        default: 2,
        minimum: 0,
        maximum: 8,
        title: 'Tightness',
        description: 'Despeckle tightness value cleanup for small imperfections.',
      },
    },
  },
};

module.exports = {
  type: 'object',
  title: 'Basic Autotrace Vectorization',
  options: { collapsed: true },
  properties,
};

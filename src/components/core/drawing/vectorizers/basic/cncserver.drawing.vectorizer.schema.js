/**
 * @file Settings schema for vectorizer method application.
 *
 * This schema defines the vectorizer method specific settings schema for the
 * application to import and use for settings validation and documentation.
 */
module.exports = {
  colors: {
    type: 'integer',
    title: 'Colors',
    description: 'Number of colors to limit to.',
    default: 1,
    minimum: 1,
    maximum: 16,
  },
  centerline: {
    type: 'boolean',
    title: 'Parse Centerline',
    description: 'If true will add a centerline to all filled areas.',
    default: false,
  },
  cleanup: {
    type: 'object',
    properties: {
      level: {
        type: 'integer',
        default: 0,
        minimum: 0,
        maximum: 20,
      },
      tightness: {
        type: 'number',
        default: 2,
        minimum: 0,
        maximum: 8,
      },
    }
  },
};

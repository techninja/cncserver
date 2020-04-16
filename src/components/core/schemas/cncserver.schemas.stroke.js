/**
 * @file Global default stroke settings schema.
 *
 * This schema defines the stroke specific settings schema for the
 * application to import and use for settings validation and documentation.
 *
 */
const strokeSchema = {
  render: {
    type: 'boolean',
    title: 'Render',
    description: 'Whether stroke should be rendered, set false to skip.',
    default: true,
  },
  cutoutOcclusion: {
    type: 'boolean',
    title: 'Cutout Occlusion',
    description: 'Whether stroked objects will be cut out depending on overlapping fills',
    default: true,
  },
};

module.exports = () => ({ type: 'object', properties: strokeSchema });

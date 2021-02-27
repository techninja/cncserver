/**
 * @file Global default stroke settings schema.
 *
 * This schema defines the stroke specific settings schema for the
 * application to import and use for settings validation and documentation.
 *
 */
/* eslint-disable max-len */
const properties = {
  render: {
    type: 'boolean',
    format: 'checkbox',
    title: 'Render',
    description: 'Render stroke',
    default: true,
  },
  cutoutOcclusion: {
    type: 'boolean',
    format: 'checkbox',
    title: 'Cutout Occlusion',
    description: 'Whether stroked objects will be cut out depending on overlapping fills',
    default: true,
  },
};

const schema = {
  type: 'object',
  title: 'Stroke',
  properties,
};

export default schema;

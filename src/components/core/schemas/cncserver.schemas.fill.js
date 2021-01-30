/**
 * @file Global default fill settings schema for fill applications.
 *
 * This schema defines the fill method specific settings schema for the
 * application to import and use for settings validation and documentation.
 *
 * All supplied fill schemas are merged into this one.
 */
/* eslint-disable max-len */
import fs from 'fs';
import path from 'path';
import { __basedir } from 'cs/utils';

const fillerSchema = 'cncserver.drawing.filler.schema.js';

const globalSchema = {
  render: {
    type: 'boolean',
    format: 'checkbox',
    title: 'Render',
    description: 'Whether fill should be rendered, set false to skip.',
    default: true,
  },
  cutoutOcclusion: {
    type: 'boolean',
    format: 'checkbox',
    title: 'Cutout Occlusion',
    description: 'Whether fill spaces will be cut out depending on overlapping fills',
    default: true,
  },
  trace: {
    type: 'boolean',
    format: 'checkbox',
    title: 'Trace Fill',
    description: 'Whether fill object will get a stroke of the fill color',
    default: false,
  },
  method: {
    type: 'string',
    title: 'Fill Method',
    description: 'The method used to turn a fill into paths.',
    default: 'offset',
    enum: [], // Filled below from available filler schemas.
    options: { enum_titles: [] },
  },
  flattenResolution: {
    type: 'number',
    title: 'Flatten Resolution',
    description: 'How much detail is preserved when converting curves. Smaller is higher resolution but less performant.',
    default: 0.25,
    minimum: 0.01,
    maximum: 5,
  },
  rotation: {
    type: 'number',
    format: 'range',
    title: 'Rotation',
    description: 'If applicable, the rotation for a fill method.',
    default: 28,
    minimum: -360,
    maximum: 360,
  },
  randomizeRotation: {
    type: 'boolean',
    format: 'checkbox',
    title: 'Randomize Rotation',
    description: 'If set, the rotation setting will be ignored and a single random angle will be selected for each fill.',
    default: false,
  },
  inset: {
    type: 'number',
    format: 'range',
    title: 'Inset',
    description: 'The number of mm to negatively offset a fill path, allowing for space between outside stroke and internal size.',
    default: 0,
    minimum: -50,
    maximum: 50,
  },
  spacing: {
    type: 'number',
    format: 'range',
    title: 'Spacing',
    description: 'If applicable, the amount of space between items in MM, lower number is higher density.',
    default: 3,
    minimum: 0.1,
    maximum: 100,
  },
};

// Compile list of all other filler modules and their schemas and merge them.
const fillerPath = path.resolve(__basedir, 'components', 'core', 'drawing', 'fillers');
fs.readdirSync(fillerPath).map(dir => {
  const fullPath = path.resolve(fillerPath, dir);
  if (fs.lstatSync(fullPath).isDirectory()) {
    const schemaPath = path.resolve(fullPath, fillerSchema);
    if (fs.existsSync(schemaPath)) {
      globalSchema.method.enum.push(dir);

      import(schemaPath).then(({ default: fillerSchemaObject }) => {
        globalSchema.method.options.enum_titles.push(fillerSchemaObject.title);

        // Only add if filler defines custom props.
        if (Object.entries(fillerSchemaObject.properties).length) {
          globalSchema[dir] = fillerSchemaObject;
          globalSchema[dir].options = { dependencies: { method: dir } };
        }
      });
    }
  }
});

const schema = {
  type: 'object',
  title: 'Fill',
  properties: globalSchema,
};

export default schema;

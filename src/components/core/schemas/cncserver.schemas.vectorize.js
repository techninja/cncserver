/**
 * @file Global default vectorization settings schema.
 *
 * This schema defines the vectorization specific settings schema for the
 * application to import and use for settings validation and documentation.
 *
 */
/* eslint-disable max-len */
const fs = require('fs');
const path = require('path');

const vectorizerSchema = 'cncserver.drawing.vectorizer.schema.js';

module.exports = () => {
  const globalSchema = {
    render: {
      type: 'boolean',
      title: 'Render',
      description: 'Render vectorization',
      default: true,
    },
    method: {
      type: 'string',
      title: 'Vectorize Method',
      description: 'The method used to turn a raster into paths.',
      default: 'basic',
      enum: [], // Filled below from available vectorizer method schemas.
    },
    raster: {
      type: 'object',
      title: 'Raster image Processing',
      description: 'All settings relating to raster image pre-processing.',
      properties: {
        brightness: {
          type: 'number',
          title: 'Brightness',
          description: 'How much to brighten or darken the image.',
          default: 0.05,
          minimum: -1,
          maximum: 1,
        },
        contrast: {
          type: 'number',
          title: 'Contrast',
          description: 'How much to adjust overall pixel contrast.',
          default: 0,
          minimum: -1,
          maximum: 1,
        },
        invert: {
          type: 'boolean',
          title: 'Invert',
          description: 'Invert the pixel color before processing.',
          default: false,
        },
        grayscale: {
          type: 'boolean',
          title: 'Grayscale',
          description: 'Convert the image to black and white grayscale.',
          default: false,
        },
        normalize: {
          type: 'boolean',
          title: 'Normalize',
          description: 'Normalize color channels to correct for exposure/color temperature.',
          default: false,
        },
        flatten: {
          type: 'boolean',
          title: 'Flatten transparency',
          description: 'Flatten alpha transparency in the image will to the flatten color.',
          default: false,
        },
        flattenColor: {
          type: 'string',
          title: 'Flatten Color',
          description: 'The color to treat as transparent, or to replace transparency.',
          default: '#FFFFFF',
        },
        resolution: {
          type: 'integer',
          title: 'Resolution',
          description: 'Raster re-render resolution in DPI, higher gives more detail.',
          default: 150,
          minimum: 25,
          maximum: 600,
        },
        blur: {
          type: 'integer',
          title: 'Blur',
          description: 'Blurs the image by the number of pixels specified',
          default: 0,
          minimum: 0,
          maximum: 50,
        },
      },
    },
  };

  // Compile list of all other filler modules and their schemas and merge them.
  const vectorizerPath = path.resolve(__dirname, '..', 'drawing', 'vectorizers');
  fs.readdirSync(vectorizerPath).map((dir) => {
    const fullPath = path.resolve(vectorizerPath, dir);
    if (fs.lstatSync(fullPath).isDirectory()) {
      const schemaPath = path.resolve(fullPath, vectorizerSchema);
      if (fs.existsSync(schemaPath)) {
        globalSchema.method.enum.push(dir);

        // eslint-disable-next-line
        const vectorizerSchemaObject = require(schemaPath);

        // Only add if vectorizer defines custom props.
        if (Object.entries(vectorizerSchemaObject.properties).length) {
          globalSchema[dir] = vectorizerSchemaObject;
        }
      }
    }
  });

  return { type: 'object', title: 'Vectorization', properties: globalSchema };
};

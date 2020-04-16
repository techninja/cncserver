/**
 * @file Settings schema for fill method application.
 *
 * This schema defines the fill method specific settings schema for the
 * application to import and use for settings validation and documentation.
 */
const fs = require('fs');
const path = require('path');

const svgPatterns = [];
fs.readdirSync(path.resolve(__dirname, 'patterns')).map((file) => {
  svgPatterns.push(file.split('.')[0]);
});

module.exports = {
  // === Pattern fill method keys, found @ settings.fill.pattern  ==============
  align: {
    type: 'string',
    title: 'Fill Align base',
    description: 'What to align the final fill to.',
    default: 'path',
    enum: ['path', 'canvas'],
  },
  offset: {
    type: 'object',
    title: 'Fill Position Offset',
    description: 'How much to adjust the position of the fill: X, Y in mm.',
    properties: {
      x: { title: 'X', type: 'number', default: 0 },
      y: { title: 'Y', type: 'number', default: 0 },
    },
  },
  pattern: {
    type: 'string',
    title: 'Pattern',
    description: 'Pattern to be drawn and clipped over the fill path.',
    default: 'spiral',
    enum: ['spiral', 'line', ...svgPatterns],
  },
  density: {
    type: 'integer',
    title: 'Density',
    description: 'Controls the number of rotation duplications of a fill. Line and Spiral only.',
    default: 1,
    minimum: 1,
    maximum: 5,
  },
  scale: {
    type: 'number',
    title: 'Scale',
    description: 'How much to scale the final result fill, useful for SVG patterns.',
    default: 1,
    minimum: 0.1,
    maximum: 5,
  },
  lineOptions: {
    type: 'object',
    title: 'Line pattern settings',
    description: 'Settings specific to the line pattern type.',
    properties: {
      type: {
        type: 'string',
        title: 'Common line wave pattern type.',
        description: '',
        default: 'straight',
        enum: ['straight', 'sine', 'triangle', 'saw'],
      },
      wavelength: {
        type: 'number',
        title: 'Wavelength',
        description: 'The length in mm between wave peaks.',
        default: 10,
        minimum: 0.5,
        maximum: 500,
      },
      amplitude: {
        type: 'number',
        title: 'Wave Amplitude',
        description: 'The height of the wave in mm.',
        default: 10,
        minimum: 0.5,
        maximum: 500,
      },
    },
  },
};

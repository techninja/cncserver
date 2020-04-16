/**
 * @file Global default text settings schema for rendering text.
 *
 * This schema defines the text specific settings for rendering line and
 * system fonts.
 */
const fontList = require('font-list');

module.exports = (cncserver) => {
  const properties = {
    render: {
      type: 'boolean',
      title: 'Render',
      description: 'Whether text should be rendered, set false to skip.',
      default: true,
    },
    spaceWidth: {
      type: 'number',
      default: 20,
    },
    font: {
      type: 'string',
      default: 'hershey_sans_1',
      enum: Object.keys(cncserver.drawing.text.fonts),
    },
    systemFont: {
      type: 'string',
      default: '',
    },
    lineHeight: {
      type: 'number',
      default: 90,
    },
    character: {
      type: 'object',
      properties: {
        rotation: {
          type: 'number',
          default: 0,
          minimum: -360,
          maximum: 360,
        },
        spacing: {
          type: 'number',
          minimum: -100,
          maximum: 100,
          default: 18,
        },
      },
    },
    align: {
      type: 'object',
      properties: {
        paragraph: {
          type: 'string',
          enum: ['left', 'right', 'center'],
          default: 'left',
        },
        // TODO: What other alignment options do we need?
      },
    },
    rotation: {
      type: 'number',
      default: 0,
      minimum: -360,
      maximum: 360,
    },
  };

  // Add system font enum.
  fontList.getFonts().then((fonts) => {
    properties.systemFont.enum = fonts.map(s => s.replace(/"/g, ''));
  });

  return { type: 'object', properties };
};

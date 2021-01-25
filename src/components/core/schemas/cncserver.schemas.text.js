/**
 * @file Global default text settings schema for rendering text.
 *
 * This schema defines the text specific settings for rendering line and
 * system fonts.
 */
/* eslint-disable max-len */
import fontList from 'font-list';

const properties = {
  render: {
    type: 'boolean',
    format: 'checkbox',
    title: 'Render',
    description: 'Render text',
    default: true,
  },
  spaceWidth: {
    type: 'number',
    format: 'range',
    default: 0,
    minimum: -1000,
    maximum: 1000,
    title: 'Space width adjustment',
    description: 'Units to add/remove from the internal font width.',
  },
  wrapLines: {
    type: 'boolean',
    format: 'checkbox',
    default: true,
    title: 'Automatically wrap long lines',
    description: 'If enabled, lines beyond textwrap width will automatically move to the next line.',
  },
  wrapChars: {
    type: 'integer',
    format: 'range',
    default: 60,
    minimum: 1,
    maximum: 500,
    title: 'Textwrap width (in spaces)',
    description: 'Number of space character widths to wait before text length triggers a newline.',
  },
  font: {
    type: 'string',
    default: 'hershey_sans_1',
    enum: Object.keys(cncserver.drawing.text.fonts),
    title: 'Stroke Font',
    description: 'Which EMS/SVG stroke font to use to render the text.',
    options: {
      enum_titles: Object.values(cncserver.drawing.text.fonts).map(font => font.name),
    },
  },
  systemFont: {
    type: 'string',
    default: '',
    title: 'System Font',
    description: 'Which system font to render the text with. Overrides stroke font settings, creates filled text.',
  },
  lineHeight: {
    type: 'number',
    default: 0,
    format: 'range',
    minimum: -1000,
    maximum: 1000,
    title: 'Line height adjustment',
    description: 'Adjustment to the height of each line when more than one line of text is given or computed.',
  },
  character: {
    type: 'object',
    title: 'Character settings',
    description: 'Options that effect individual characters',
    options: { collapsed: true },
    properties: {
      rotation: {
        type: 'number',
        format: 'range',
        default: 0,
        minimum: -360,
        maximum: 360,
        title: 'Rotation',
        description: 'Amount to rotate each character.',
      },
      spacing: {
        type: 'number',
        format: 'range',
        default: 0,
        minimum: -1000,
        maximum: 1000,
        title: 'Spacing',
        description: 'Amount of space given to each character after the width of the previous.',
      },
    },
  },
  align: {
    type: 'object',
    title: 'Text alignment',
    description: 'Options for aligning the text.',
    options: { collapsed: true },
    properties: {
      paragraph: {
        type: 'string',
        enum: ['left', 'right', 'center'],
        options: { enum_titles: ['Left', 'Center', 'Right'] },
        default: 'left',
        title: 'Paragraph',
        description: 'When more than one line of text exists, how to align the text within the bounds.',
      },
      // TODO: What other alignment options do we need?
    },
  },
  rotation: {
    type: 'number',
    format: 'range',
    default: 0,
    minimum: -360,
    maximum: 360,
    title: 'Text rotation',
    description: 'Angle to rotate the entire text object within the bounds.',
  },
};

// Add system font enum.
fontList.getFonts().then(fonts => {
  properties.systemFont.enum = ['', ...fonts.map(s => s.replace(/"/g, ''))];
});

const schema = {
  type: 'object',
  title: 'Text',
  properties,
};

export default schema;

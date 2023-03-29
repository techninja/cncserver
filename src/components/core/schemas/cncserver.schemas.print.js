/**
* @file Print settings schema.
*/
/* eslint-disable max-len */

const properties = {
  hash: {
    type: 'string',
    title: 'Hash of settings to validate differences',
    description: 'Machine name for the colorset, set from title.',
  },
  title: {
    type: 'string',
    title: 'Title',
    description: 'Human readable name for the print and its settings.',
    maxLength: 200,
  },
  description: {
    type: 'string',
    title: 'Description',
    description: 'Description of this print.',
  },
  botType: {
    type: 'string',
    title: 'Bot Type',
    description: 'Type of bot expected',
  },
  settings: {
    type: 'object',
    title: 'Print Settings',
    properties: {
      parkAfter: {
        type: 'boolean',
        title: 'Park After Print?',
        description: 'When true, after print completes the bot will park.',
        format: 'checkbox',
        default: true,
      },
      planning: {
        type: 'object',
        title: 'Path Planning',
        description: 'Methods of path planning.',
        properties: {
          method: {
            type: 'string',
            title: 'Method',
            enum: ['linear', 'dvl'],
            options: {
              enum_titles: [
                'Linear (single speed)',
                'Dynamic Vector Lookahead (DVL)',
              ],
            },
            default: 'dvl',
          },
          linear: {
            type: 'object',
            title: 'Linear movement options',
            properties: {
              moveSpeed: {
                type: 'number',
                title: 'Moving Speed',
                description: 'Percentage of maximum speed of the carriage while moving above the work (not drawing).',
                format: 'range',
                step: 0.1,
                minimum: 1,
                maximum: 100,
                default: 40,
              },
              drawSpeed: {
                type: 'number',
                title: 'Draw Speed',
                description: 'Percentage of maximum speed of the carriage while drawing the work.',
                format: 'range',
                step: 0.1,
                minimum: 1,
                maximum: 100,
                default: 25,
              },
            },
          },
          dvl: {
            type: 'object',
            title: 'DVL movement options',
            properties: {
              accelRate: {
                type: 'number',
                title: 'Accelleration Rate',
                description: 'Percentage of maximum speed to increase over given time/distance.',
                format: 'range',
                step: 0.1,
                minimum: 1,
                maximum: 80,
                default: 25,
              },
              speedMultiplyer: {
                type: 'number',
                title: 'Moment conversion factor',
                description: 'Factor for converting moment length to velocity',
                format: 'range',
                step: 0.01,
                minimum: 0.1,
                maximum: 1,
                default: 0.75,
              },
              minSpeed: {
                type: 'number',
                title: 'Minimum Speed',
                description: 'Lowest speed to move at for detailed work.',
                format: 'range',
                step: 0.01,
                minimum: 1,
                maximum: 50,
                default: 15,
              },
              resolution: {
                type: 'number',
                title: 'Step Resolution',
                description: 'Resolution of step breakdown, in MM. Smaller numbers give more resolution.',
                format: 'range',
                step: 0.01,
                minimum: 0.01,
                maximum: 2,
                default: 0.5,
              },
              maxDeflection: {
                type: 'number',
                title: 'Maximum Deflection',
                description: 'Maximum angle of deflection to allow before slowing down around tight corners.',
                format: 'range',
                step: 0.1,
                minimum: 0.5,
                maximum: 20,
                default: 10,
              },
            },
          },
        },
      },
      wcb: {
        type: 'object',
        title: 'Watercolor Settings',
        properties: {
          wash: {
            type: 'string',
            title: 'Wash',
            enum: ['full', 'light'],
          },
          // TODO:
          // Wash settings
          // Reink Settings
          /// etc?
        },
      },
    },
  },
};

const schema = {
  type: 'object',
  required: [''],
  title: 'Print',
  properties,
};

export default schema;

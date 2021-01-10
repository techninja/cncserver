/**
 * @file Settings schema for Projects API.
 *
 * This schema defines the specific allowed settings and therefore the API
 * interface restrictions and expectations for all data IO.
 */
/* eslint-disable max-len */
module.exports = () => {
  const properties = {
    /* hash: {
      type: 'string',
      title: 'Hash ID',
      description: 'Initial hash for the project, used as a UUID',
    },
    created: {
      type: 'string',
      format: 'date',
      title: 'Created date',
      description: 'When the project was last edited.',
    },
    updated: {
      type: 'string',
      format: 'date',
      title: 'Updated date',
      description: 'When the project was last edited.',
    }, */ // These are computed 🤔
    name: {
      type: 'string',
      title: 'Machine name',
      description: 'Machine name of the project, if not given, comes from title.',
    },
    title: {
      type: 'string',
      title: 'Project Title',
      description: 'Full title of the project.',
      default: 'New Project',
    },
    description: {
      type: 'string',
      title: 'Description',
      description: 'Full text describing the project.',
      format: 'textarea',
    },
    open: {
      type: 'boolean',
      format: 'checkbox',
      title: 'Open After Creation',
      description: 'Will open new project by default. Set to false to create in the background.',
      default: true,
    },
    colorset: {
      type: 'string',
      title: 'Suggested Colorset',
      description: 'Colorset preset attached to the project',
      default: 'default',
    },
    options: {
      type: 'object',
      title: 'Project Options',
      description: 'Customizable settings specific to this project',
      properties: {
        paper: {
          type: 'object',
          title: 'Paper Options',
          description: 'Customizable settings specific to this project',
          properties: {
            color: {
              type: 'string',
              format: 'color',
              title: 'Paper Color',
              description: 'The assumed color of the paper, for preview and ignoring.',
              default: '#FFFFFF',
            },
            ignore: {
              type: 'boolean',
              format: 'checkbox',
              title: 'Ignore Paper Color',
              description: 'Attempt to match items to the paper color to prevent rendering them.',
              default: true,
            },
            ignoreColorWeight: {
              type: 'number',
              title: 'Ignore Color Weighting',
              description: 'Amount to adjust for color selection preference. Smaller than 0 selects less often, larger than 0 selects more often.',
              format: 'range',
              minimum: -1,
              maximum: 1,
              default: -0.5,
              options: { dependencies: { ignore: true } },
            },
          },
        },
      },
    },
    // settings: @see cncserver.schemas.content.settings.js
  };

  return {
    type: 'object',
    properties,
    title: 'Project',
    description: 'Full definition of a project that holds content',
  };
};

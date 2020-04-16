/**
 * @file Settings schema for Projects API.
 *
 * This schema defines the specific allowed settings and therefore the API
 * interface restrictions and expectations for all data IO.
 */
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
    },
    open: {
      type: 'boolean',
      title: 'Open After Creation',
      description: 'Will open new project by default. Set to false to create in the background.',
      default: true,
    },
  };

  return { type: 'object', properties };
};

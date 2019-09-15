/**
 * @file Abstraction module for high level job rendering, management, execution.
 */
const jobs = {}; // Exposed export.

module.exports = (cncserver) => {
  jobs.projects = [];
  jobs.items = [];
  jobs.hashToIndex = {};

  jobs.getAll = () => jobs.items;

  jobs.addChild = (parent, payload) => {
    if (jobs.hashToIndex[parent]) {
      // xxx
    }
  };

  // Manage project or job creation into tasks & instructions.
  jobs.addItem = (payload) => {
    const hash = cncserver.utils.getHash(payload);
    const {
      type, parent, body, operation, bounds, parkAfter, settings,
    } = payload;

    const item = {
      hash,
      operation,
      parent,
      type,
      body,
    };

    if (type === 'job') {
      switch (operation) {
        case 'trace':
          cncserver.drawing.trace(body, parent, bounds);
          break;

        case 'fill':
          cncserver.drawing.fill(body, null, bounds, 'hatch', settings);
          break;

        case 'text':
          cncserver.drawing.text(hash, payload);
          break;

        default:
          break;
      }
    } else if (type === 'project') {
      if (['trace', 'fill', 'full'].includes(operation)) {
        cncserver.drawing.project(body, parent, operation, bounds);
      }
    } else {
      return {
        status: 'error',
        message: 'invalid job type',
      };
    }

    // TODO: is this the right place for this?
    if (parkAfter) {
      cncserver.pen.park();
    }

    jobs.hashToIndex[hash] = jobs.items.length;
    jobs.items.push(item);

    return item;
  };

  return jobs;
};

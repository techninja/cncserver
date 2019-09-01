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
      type, parent, body, operation, bounds,
    } = payload;

    const item = {
      hash,
      operation,
      parent,
      type,
      body,
    };

    if (type === 'job') {
      if (operation === 'trace') {
        cncserver.drawing.trace(body, parent, bounds);
      }
    } else if (type === 'project') {
      cncserver.drawing.project(body, hash, bounds);
    } else {
      return {
        status: 'error',
        message: 'invalid job type',
      };
    }

    jobs.hashToIndex[hash] = jobs.items.length;
    jobs.items.push(item);

    return item;
  };

  return jobs;
};

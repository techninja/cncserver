/**
 * @file CNCServer ReSTful API endpoint module for pen state management.
 */
const handlers = {};

module.exports = (cncserver) => {
  handlers['/v1/jobs'] = function jobs(req) {
    // Enumerate Jobs.
    if (req.route.method === 'get') {
      return {
        code: 200,
        body: cncserver.jobs.getAll(),
      };
    }

    // Add a job.
    if (req.route.method === 'post') {
      return {
        code: 200,
        body: cncserver.jobs.addItem(req.body),
      };
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};

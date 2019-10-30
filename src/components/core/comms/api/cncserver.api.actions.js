/**
 * @file CNCServer ReSTful API endpoint module for high level drawing.
 */
const handlers = {};

module.exports = (cncserver) => {

  handlers['/v1/actions'] = (req) => {
    const { actions } = cncserver;

    // Enumerate actions.
    if (req.route.method === 'get') {
      return {
        code: 200,
        body: {
          options: actions.getOptions(),
          items: actions.getAll(),
        },
      };
    }

    // Add an action.
    if (req.route.method === 'post') {
      return {
        code: 200,
        body: actions.addItem(req.body),
      };
    }

    // Error to client for unsupported request types.
    return false;
  };


  // Individual action management.
  handlers['/v1/actions/:hash'] = (req) => {
    const { hash } = req.params;
    const { actions } = cncserver;
    const action = actions.getItem(hash);

    // Sanity check hash lookup.
    if (!action) {
      return [404, `Action with hash ID "${hash}" not found`];
    }

    // Display action.
    if (req.route.method === 'get') {
      return {
        code: 200,
        body: action,
      };
    }

    // Remove action.
    if (req.route.method === 'delete') {
      return [200, `Action with has "${hash}" removed`];
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};

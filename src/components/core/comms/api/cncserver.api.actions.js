/**
 * @file CNCServer ReSTful API endpoint module for high level drawing.
 */
const handlers = {};

module.exports = (cncserver) => {
  handlers['/v1/actions'] = (req, res) => {
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
      // Are we drawing the preview?
      if (req.body.type === 'drawpreview') {
        cncserver.control.renderPathsToMoves();
        return {
          code: 202,
          body: { status: 'processing' },
        };
      }

      // If not, attempt to add a regular action item.
      actions.addItem(req.body)
        .then((item) => {
          res.status(200).send(item);
        })
        .catch((err) => {
          console.error(err);
          const errBody = {
            status: 'error',
            message: `${err}`,
          };

          if (err.stack) errBody.stack = err.stack;
          res.status(406).send(errBody);
        });

      return true; // Tell endpoint wrapper we'll handle the response
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

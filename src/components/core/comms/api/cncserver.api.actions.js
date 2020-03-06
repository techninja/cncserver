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
      // Catch special process posts.
      if (['drawpreview', 'renderstage'].includes(req.body.type)) {
        switch (req.body.type) {
          case 'drawpreview':
            cncserver.control.renderPathsToMoves(
              cncserver.drawing.base.layers.preview,
              req.body.settings
            );
            break;

          case 'renderstage':
            cncserver.drawing.stage.renderToPreview();
            break;

          default:
            break;
        }
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
            message: err,
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

    // Display action item.
    if (req.route.method === 'get') {
      return {
        code: 200,
        body: action,
      };
    }

    // Patch original item
    if (req.route.method === 'put') {
      return {
        code: 200,
        body: actions.editItem(hash, req.body),
      };
    }

    // Remove action.
    if (req.route.method === 'delete') {
      actions.removeItem(hash);
      return [200, `Action identified by hash "${hash}" removed`];
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};

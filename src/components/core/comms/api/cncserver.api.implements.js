/**
 * @file CNCServer ReSTful API endpoint module for implement management.
 */
const handlers = {};

module.exports = (cncserver) => {
  // Primary group handler.
  handlers['/v2/implements'] = (req, res) => {
    const { drawing: { implements }, utils, schemas, rest } = cncserver;

    // Standard post resolve for colors requests.
    function postResolve() {
      res.status(200).send({
        presets: implements.listPresets(req.t),
        customs: implements.customKeys(), // List of custom preset machine names.
        internals: implements.internalKeys(), // List of internal preset machine names.
      });
    }

    // Get presets.
    if (req.route.method === 'get') {
      postResolve();
      return true; // Tell endpoint wrapper we'll handle the GET response.
    }

    // Add implement.
    if (req.route.method === 'post') {
      // Validate data and add implement, or error out.
      schemas.validateData('implements', req.body, true)
        .then(implements.add)
        .then(postResolve)
        .catch(rest.err(res));

      return true; // Tell endpoint wrapper we'll handle the POST response.
    }

    // Error to client for unsupported request types.
    return false;
  };

  // Item handler.
  handlers['/v2/implements/:implementName'] = (req, res) => {
    // Sanity check color ID
    const { implementName } = req.params;
    const { drawing: { implements }, utils, schemas } = cncserver;

    const implement = implements.get(implementName);

    if (!implement) {
      return {
        code: 404,
        body: {
          status: `Implement with name of '${implementName}' not found.`,
          validOptions: Object.keys(implements.listPresets(req.t)),
        },
      };
    }

    // Display the item.
    if (req.route.method === 'get') {
      return { code: 200, body: implement };
    }

    // Patch item. Editing internal presets saves a new custom with override data.
    if (req.route.method === 'patch') {
      if (req.body.name) {
        return {
          code: 406,
          body: {
            status: 'error',
            message: 'You cannot rewrite a implement name in a patch. Delete item and recreate.'
          },
        };
      }

      // Merge the incoming data with the existing object as we don't need delta.
      const mergedItem = utils.merge(implement, req.body);

      // Validate the request data against the schema before continuing.
      schemas.validateData('implements', mergedItem, true)
        .then(implements.edit)
        .then((finalItem) => { res.status(200).send(finalItem); })
        .catch(cncserver.rest.err(res));

      return true; // Tell endpoint wrapper we'll handle the PATCH response.
    }

    // Delete item.
    if (req.route.method === 'delete') {
      // Notify client that they cannot delete internal presets.
      if (!implements.get(implementName, true)) {
        return {
          code: 406,
          body: {
            status: `You cannot delete internal presets.`,
            validOptions: Object.keys(implements.listPresets(req.t, true)),
          },
        };
      }

      // Actually delete.
      implements.delete(implementName);
      return { code: 200, body: { status: 'success' } };
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};

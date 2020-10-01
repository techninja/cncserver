/**
 * @file CNCServer ReSTful API endpoint module for colorset management.
 */
const handlers = {};

module.exports = (cncserver) => {
  // Primary Colorset group handler.
  handlers['/v2/colors'] = (req, res) => {
    const { drawing: { colors }, utils, schemas, rest } = cncserver;

    // Standard post resolve for colors requests.
    function postResolve() {
      res.status(200).send({
        set: colors.getCurrentSet(req.t), // The current colorset.
        presets: colors.listPresets(req.t), // List all presets.
        customs: colors.customKeys(), // List of custom preset machine names.
        internals: colors.internalKeys(), // List of internal preset machine names.
        invalidSets: colors.invalidPresets(), // Keys of invalid colorsets.
      });
    }

    // Get current colorset and presets.
    if (req.route.method === 'get') {
      postResolve();
      return true; // Tell endpoint wrapper we'll handle the GET response.
    }

    // Add color, or replace set from preset.
    if (req.route.method === 'post') {
      // Set via preset, only err here is 404 preset not found.
      if (req.body.preset) {
        colors.applyPreset(req.body.preset, req.t)
          .then(postResolve)
          .catch(rest.err(res, 404));
      } else {
        // Validate data and add color item, or error out.
        schemas.validateData('color', req.body, true)
          .then(utils.isValidPreset('implement', true))
          .then(colors.add)
          .then(postResolve)
          .catch(rest.err(res));
      }

      return true; // Tell endpoint wrapper we'll handle the POST response.
    }

    // Allow deleting of custom presets.
    if (req.route.method === 'delete' && req.body.preset) {
      const customKeys = colors.customKeys();
      if (!customKeys.includes(req.body.preset)) {
        return {
          code: 406,
          body: {
            status: `Only custom or overridden presets can be deleted.`,
            allowedValues: customKeys,
          },
        };
      } else {
        utils.deletePreset('colorsets', req.body.preset);
        postResolve();
        return true; // Tell endpoint wrapper we'll handle the GET response.
      }
    }

    // Change set options directly.
    if (req.route.method === 'patch') {
      // If item data is attempted to be changed here, give a specific message for it.
      if (req.body.items) {
        rest.err(res, 406)(
          new Error(utils.singleLineString`Patching the colors endpoint can only edit the
            current set details, not individual colorset items.
            Patch to /v2/colors/[ID] to edit a colorset item.`
          )
        );
      }

      // Merge with current set, validate data, then edit.
      const set = colors.getCurrentSet();
      delete set.items;
      const mergedItem = utils.merge(set, req.body);
      schemas.validateData('colors', mergedItem, true)
        .then(utils.isValidPreset('implement'))
        .then(utils.isValidPreset('toolset'))
        .then(colors.editSet)
        .then(postResolve)
        .catch(rest.err(res));

      return true; // Tell endpoint wrapper we'll handle the PATCH response.
    }

    return false;
  };

  // Colorset item handler.
  handlers['/v2/colors/:colorID'] = (req, res) => {
    // Sanity check color ID
    const { colorID } = req.params;
    const { drawing: { colors }, utils, schemas } = cncserver;

    // TODO: Apply translation here?...
    const color = colors.getColor(colorID);

    if (!color) {
      return {
        code: 404,
        body: {
          status: `Color with id of '${colorID}' not found in color set.`,
          allowedValues: colors.getIDs(),
        },
      };
    }

    // Display the color info.
    if (req.route.method === 'get') {
      return { code: 200, body: color };
    }

    // Patch item.
    if (req.route.method === 'patch') {
      // Error out if client is trying to change the ID in the request.
      if (req.body.id && req.body.id !== colorID) {
        return {
          code: 406,
          body: {
            status: 'error',
            message: 'You cannot rewrite a colorset ID in a patch. Delete item and recreate.'
          },
        };
      }

      // Merge the incoming data with the existing object as we don't need delta.
      const mergedItem = utils.merge(color, req.body);

      // Validate the request data against the schema before continuing.
      cncserver.schemas.validateData('color', mergedItem, true)
        .then(utils.isValidPreset('implement', true))
        .then(colors.edit)
        .then((finalItem) => { res.status(200).send(finalItem); })
        .catch(cncserver.rest.err(res));

      return true; // Tell endpoint wrapper we'll handle the PATCH response.
    }

    // Delete color
    if (req.route.method === 'delete') {
      colors.delete(colorID);
      return { code: 200, body: { status: 'success' } };
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};

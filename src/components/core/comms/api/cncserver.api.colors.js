/**
 * @file CNCServer ReSTful API endpoint module for colorset management.
 */
const handlers = {};

module.exports = (cncserver) => {
  // Primary Colorset group handler.
  handlers['/v2/colors'] = (req, res) => {
    const { drawing: { colors }, utils, schemas } = cncserver;

    // Standard post resolve for colors requests.
    function postResolve() {
      res.status(200).send({ set: colors.getCurrentSet(), presets: colors.presets });
    }

    // Get current colorset and presets.
    if (req.route.method === 'get') {
      return {
        code: 200,
        body: {
          set: colors.getCurrentSet(req.t),
          presets: colors.listPresets(req.t),
        },
      };
    }

    // Add color, or replace set from preset or custom set.
    if (req.route.method === 'post') {
      // Set via preset, only err here is 404 preset not found.
      if (req.body.preset) {
        colors.applyPreset(req.body.preset, req.t)
          .then(postResolve)
          .catch(cncserver.rest.err(res, 404));
      } else {
        // Validate data and add color item, or error out.
        schemas.validateData('color', req.body, true)
          .then(colors.add)
          .then(postResolve)
          .catch(cncserver.rest.err(res));
      }

      return true; // Tell endpoint wrapper we'll handle the POST response.
    }

    // Change set options directly.
    if (req.route.method === 'patch') {
      // If item data is attempted to be changed here, give a specific message for it.
      if (req.body.items || req.body.tools) {
        cncserver.rest.err(res, 406)(
          new Error(utils.singleLineString`Patching the colors endpoint can only edit the
            current set details, not individual color items or tools.
            Patch to /v2/colors/[ID] to edit a color item, /v2/tools/[ID] to edit a
            colorset tool.`
          )
        );
      }

      // Merge with current set, validate data, then edit.
      const set = colors.getCurrentSet();
      delete set.items;
      delete set.tools;
      const mergedItem = utils.merge(set, req.body);
      schemas.validateData('colors', mergedItem, true)
        .then(colors.editSet)
        .then(postResolve)
        .catch(cncserver.rest.err(res));

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
          validOptions: colors.getIDs(),
        },
      };
    }

    // Display the color info.
    if (req.route.method === 'get') {
      return { code: 200, body: color };
    }

    // Patch item.
    if (req.route.method === 'patch') {
      if (req.body.id) {
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
        .then(colors.edit)
        .then((finalItem) => { res.status(200).send(finalItem); })
        .catch(cncserver.rest.err(res));

      return true; // Tell endpoint wrapper we'll handle the PATCH response.
    }

    // Delete color
    if (req.route.method === 'delete') {
      colors.delete(colorID);
      return { code: 200, body: { set: colors.set, presets: colors.presets } };
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};

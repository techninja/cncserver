/**
 * @file CNCServer ReSTful API endpoint module for colorset management.
 */
const handlers = {};

module.exports = (cncserver) => {
  handlers['/v2/colors'] = (req, res) => {
    const { drawing: { colors } } = cncserver;

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
        cncserver.schemas.validateData('color', req.body, true)
          .then(colors.add)
          .then(postResolve)
          .catch(cncserver.rest.err(res));
      }

      return true; // Tell endpoint wrapper we'll handle the POST response.
    }

    // Change set options directly.
    if (req.route.method === 'patch') {
      // If item data is attempted to be changed here, give a specific message for it.
      if (req.body.items) {
        cncserver.rest.err(res, 406)(
          new Error('Patching the colors endpoint can only edit the current set details, not individual color items. Patch to /v2/colors/[ID].')
        );
      }

      // TODO:
      // - Colorsets need to be able to define size and relative position of tools
      // - Provide templates for position and size based off crayola.
      // - Colorsets items should allow for default selection criteria, and selectable
      // options like: Color proximity (with weight), Transparency range
      // - Re-ink distance for each implement
      // - Machine defines a place for a holder to go relative to movable area.
      // - Probably don't have to remove tools, but they make less sense here.
      // - Edit below to update the set only
      // - Get all of it to save to JSON
      // - Load from JSON based on name (with reference in project)
      // - As long as you save everything, you can take stuff away from users.

      // Validate data then edit.
      cncserver.schemas.validateData('colors', req.body, true)
        .then(colors.updateSet)
        .then(postResolve)
        .catch(cncserver.rest.err(res));

      return true; // Tell endpoint wrapper we'll handle the PATCH response.
    }

    return false;
  };

  handlers['/v2/colors/:colorID'] = (req) => {
    // Sanity check color ID
    const { colorID } = req.params;
    const { drawing: { colors } } = cncserver;
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

    // Update color info
    if (req.route.method === 'patch') {
      return { code: 200, body: colors.update(colorID, req.body) };
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

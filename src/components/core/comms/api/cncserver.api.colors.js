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

    // Add color/set from preset.
    if (req.route.method === 'post') {
      // Adding preset, only err here is 404 preset not found.
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

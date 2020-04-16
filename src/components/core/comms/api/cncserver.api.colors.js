/**
 * @file CNCServer ReSTful API endpoint module for colorset management.
 */
const handlers = {};

module.exports = (cncserver) => {
  handlers['/v2/colors'] = (req) => {
    const { drawing: { colors } } = cncserver;

    if (req.route.method === 'get') { // Get current colorset and
      return {
        code: 200,
        body: {
          set: colors.set,
          presets: colors.listPresets(req.t),
        },
      };
    }

    if (req.route.method === 'post') { // Set color/preset
      if (req.body.preset) {
        if (!colors.applyPreset(req.body.preset)) {
          return {
            code: 404,
            body: {
              status: `Preset with id of '${req.body.preset}' not found in preset list.`,
              validOptions: Object.keys(colors.presets),
            },
          };
        }
      } else if (!req.body.id || !req.body.name || !req.body.color) {
        return [
          406,
          'Must include valid id, name and color, see color documentation API docs',
        ];
      } else if (!colors.add(req.body)) {
        return [
          406,
          `Color with id ${req.body.id} already exists, update it directly or change id`,
        ];
      }

      return {
        code: 200,
        body: {
          set: colors.set,
          presets: colors.presets,
        },
      };
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
    if (req.route.method === 'put') {
      return { code: 200, body: colors.update(colorID, req.body) };
    }

    // Delete color
    if (req.route.method === 'delete') {
      colors.delete(color);
      return { code: 200, body: { set: colors.set, presets: colors.presets } };
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};

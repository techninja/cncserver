/**
 * @file Code for drawing color and "tool" change management.
 */
const glob = require('glob');
const path = require('path');
const nc = require('nearest-color');
const { Color } = require('paper');

const defaultColor = { id: 'color0', name: 'Black', color: '#000000' };
const ignoreWhite = { id: 'ignore', name: 'White', color: '#FFFFFF' };
const defaultPreset = {
  manufacturer: 'default',
  media: 'pen',
  machineName: 'default',
  weight: -10,
  colors: { black: '#000000' },
};
const colors = { id: 'drawing.colors', presets: { default: defaultPreset }, set: [] };
const presetDir = path.resolve(
  global.__basedir, 'components', 'core', 'drawing', 'colorsets'
);

module.exports = (cncserver, drawing) => {
  // What is this and why?
  //
  // When we draw, we assume a color: color0. It's assumed this is "black", but
  // if there's only one color in use, no color switching will occur so this
  // definition is moot unless we have more than one color in our set.
  //
  // A "colorset" is a set of colors that can be applied to the available colors
  // in `cncserver.drawing.colors.set`

  // Load all color presets into the presets key.
  const files = glob.sync(path.join(presetDir, '*.json'));
  files.forEach((setPath) => {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const sets = require(setPath);
      sets.forEach((set) => {
        const key = `${set.manufacturer}-${set.media}-${set.machineName}`;
        colors.presets[key] = set;
      });
    } catch (error) {
      console.error(`Problem loading color preset: '${setPath}'`);
    }
  });

  colors.getIDs = () => {
    const items = [];
    colors.set.forEach(({ id }) => {
      items.push(id);
    });
    return items;
  };

  colors.getIndex = (findID) => {
    let findIndex = null;
    colors.set.forEach(({ id }, index) => {
      if (id === findID) {
        findIndex = index;
      }
    });
    return findIndex;
  };

  colors.delete = ({ id }) => {
    const index = colors.getIndex(id);
    colors.set.splice(index, 1);

    if (colors.set.length === 0) {
      colors.set.push(defaultColor);
    }
    cncserver.sockets.sendPaperPreviewUpdate();
  };

  colors.add = ({ id, name, color }) => {
    if (colors.getIndex(id) === null) {
      colors.set.push({ id, name, color });
      cncserver.sockets.sendPaperPreviewUpdate();
      return true;
    }
    return null;
  };

  colors.update = (id, { name, color }) => {
    const index = colors.getIndex(id);
    colors.set[index] = { id, name, color };
    cncserver.sockets.sendPaperPreviewUpdate();
    return colors.set[index];
  };

  colors.getColor = (findID) => {
    let color = colors.getIndex(findID);
    if (color !== null) color = colors.set[color];
    return color;
  };

  /**
   * Mutate the set array to match a preset by machine name.
   *
   * @param {string} presetName
   *
   * @returns {boolean}
   *   Null for failure, true if success.
   */
  colors.applyPreset = (presetName) => {
    const preset = colors.setFromPreset(presetName);
    if (preset) {
      colors.set = preset;
      cncserver.sockets.sendPaperPreviewUpdate();
      return true;
    }
    return null;
  };

  /**
   * Get colorset array from a preset name.
   *
   * @param {string} presetName
   *
   * @returns {array}
   *   Colorset style array with default toolnames
   */
  colors.setFromPreset = (presetName) => {
    if (colors.presets[presetName]) {
      const set = [];
      Object.entries(colors.presets[presetName].colors).forEach(([name, color]) => {
        set.push({ id: `color${set.length}`, name, color });
      });

      // TODO: Allow this to be set somewhere?
      set.push(ignoreWhite);
      return set;
    }

    return null;
  };

  /**
   * Run at setup, allows machine specific colorset defaults.
   */
  colors.setDefault = () => {
    const defaultSet = cncserver.binder.trigger('colors.setDefault', [defaultColor, ignoreWhite]);
    colors.set = defaultSet;
  };

  // Bind to when bot/controller is configured and setup, set default.
  cncserver.binder.bindTo('controller.setup', colors.id, () => {
    colors.setDefault();
  });

  /**
   * Snap all the paths in the given layer to a particular color.
   *
   * @param {*} layer
   */
  colors.snapPathColors = (layer) => {
    // Build Nearest Color matcher
    const c = {};
    colors.set.forEach(({ id, color }) => {
      c[id] = color;
    });

    const nearestColor = nc.from(c);
    layer.children.forEach((path) => {
      if (path.strokeColor) {
        // If we've never touched this path before, save the original color.
        if (!path.data.originalColor) {
          path.data.originalColor = path.strokeColor;
        }

        // Find nearest color.
        const nearest = nearestColor(path.data.originalColor.toCSS(true));

        path.data.colorID = nearest.name;
        path.strokeColor = nearest.value;
      }
    });
  };

  return colors;
};

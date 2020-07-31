/**
* @file Code for drawing color and "tool" change management.
*/

// Paper.js is all about that parameter reassignment life.
/* eslint-disable no-param-reassign */

const fs = require('fs');
const glob = require('glob');
const path = require('path');
const nc = require('nearest-color');
const { Color } = require('paper');

// Default assumed color (pen).
const defaultColor = {
  id: 'color0',
  name: 'Black',
  color: '#000000',
  weight: 0,
  implement: {
    type: 'inherit',
    width: 1,
    length: 0,
    stiffness: 1,
    drawLength: 0,
  },
};

// Default ignored white.
const ignoreWhite = {
  id: 'ignore',
  name: 'White',
  color: '#FFFFFF',
  weight: -0.5, // Let other colors select before this.
  implement: {
    type: 'inherit',
    width: 0,
    length: 0,
    stiffness: 1,
    drawLength: 0,
  },
};

// Colorset Tool positions for Crayola default set.
const crayolaPositions = [14.5, 41.5, 66, 91, 116.5, 143, 169, 194];
const crayolaDefaultTools = crayolaPositions.map((y, index) => ({
  id: `color${index}`,
  title: `Color pan position ${index + 1}`,
  x: 18.5,
  y,
  width: 27,
  height: 19,
  radius: 15,
  parent: 'pan',
  group: 'Colors',
  position: 'center',
}));

// Default internal preset.
const defaultPreset = {
  manufacturer: 'default',
  media: 'pen',
  machineName: 'default',
  weight: -10,
  width: 1, // 1mm implement size.
  colors: { black: '#000000' },
};

// Final export object.
const colors = {
  id: 'drawing.colors',
  presets: { default: defaultPreset },
  set: { // Set via initial preset or colorset loader.
    name: '', // Machine name for loading/folder storage
    title: '', // Clean name.
    description: '', // Description of what it is beyond title.
    implement: {
      type: 'pen',
      width: 1,
      length: 0,
      stiffness: 1,
      drawLength: 0,
      handleWidth: 10,
    },
    items: new Map(), // Items mapped by id.
    tools: [], // Tools that get added with parentage.
  },
};

// Location of internal colorset presets.
const presetDir = path.resolve(
  global.__basedir, 'components', 'core', 'drawing', 'colorsets'
);

module.exports = (cncserver) => {
  // What is this and why?
  //
  // When we draw, we assume a color: color0. It's assumed this is "black", but
  // if there's only one color in use, no color switching will occur so this
  // definition is moot unless we have more than one color in our set.
  //
  // A "colorset" is a set of colors/implements that can be applied to the available items
  // in `cncserver.drawing.colors.set.items`

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

  // Function to render presets for the API, translating human readable strings.
  colors.listPresets = (t) => {
    const out = {};
    Object.entries(colors.presets).forEach(([key, p]) => {
      const basekey = `colorsets:${p.manufacturer}.${p.machineName}`;
      out[key] = {
        manufacturer: p.manufacturer,
        media: p.media,
        machineName: p.machineName,
        manufacturerName: t(`${basekey}.manufacturer`),
        name: t(`${basekey}.name`),
        description: t(`${basekey}.description`),
        mediaName: t(`colorsets:media.${p.media}`),
        colors: {},
      };

      Object.entries(p.colors).forEach(([id, color]) => {
        out[key].colors[id] = {
          color,
          name: t(`colorsets:colors.${id}`),
        };
      });
    });

    return out;
  };

  /**
  * Get a flat list of valid colorset key ids.
  *
  * @returns {array}
  *   Array of colorset item keys, empty array if none.
  */
  colors.getIDs = () => Array.from(colors.set.items.keys());


  // Delete a color by id.
  colors.delete = (id) => {
    colors.set.items.delete(id);

    if (colors.set.items.size === 0) {
      colors.set.items.set(defaultColor.id, defaultColor);
    }
    cncserver.sockets.sendPaperUpdate();
  };

  // Add a color by all of its info, appended to the end.
  colors.add = ({ id, ...item }) => new Promise((resolve, reject) => {
    if (!colors.getColor(id)) {
      colors.set.items.set(id, { id, ...item });
      cncserver.sockets.sendPaperUpdate();
      resolve();
    } else {
      reject(
        new Error(`Color with id "${id}" already exists, update it directly or change id`)
      );
    }
  });


  // Get a renderable color from a tool name. 'transparent' if no match.
  colors.getToolColor = (name) => {
    const item = colors.set.items.get(name);
    return item ? item.color : 'transparent';
  };

  // Update a color by id with all its info.
  colors.update = (id, { name, color, size }) => {
    colors.set.items.set(id, {
      id, name, color, size,
    });
    cncserver.sockets.sendPaperUpdate();
    return colors.set.items.get(id);
  };

  // Get non-reference copy of colorset item by id.
  colors.getColor = (id, applyInheritance = false) => {
    const item = { ...colors.set.items.get(id) };
    item.implement = { ...colors.set.items.get(id).implement };

    // If the implementor wants it, and the item wants inheritance...
    if (applyInheritance && item.implement.type === 'inherit') {
      item.implement = { ...colors.set.implement };
    }

    return item;
  };

  /**
   * Mutate the set array to match a preset by machine name.
   *
   * @param {string} presetName
   *
   * @returns {boolean}
   *   Null for failure, true if success.
   */
  colors.applyPreset = (presetName, t) => new Promise((resolve, reject) => {
    const preset = colors.setFromPreset(presetName, t);
    if (preset) {
      colors.set = preset;
      cncserver.sockets.sendPaperUpdate();

      // Trigger tools.update as colorset based tools update the list.
      cncserver.binder.trigger('tools.update');
      resolve();
    } else {
      const validOptions = Object.keys(colors.presets).join(', ');
      reject(new Error(
        cncserver.utils.singleLineString`Preset with id of '${presetName}' not found
        in preset list. Must be one of [${validOptions}]`
      ));
    }
  });

  /**
   * Get colorset array from a preset name.
   *
   * @param {string} presetName
   *
   * @returns {array}
   *   Colorset style array with default toolnames
   */
  colors.setFromPreset = (presetName, t = s => s) => {
    const preset = colors.presets[presetName];
    const { schemas } = cncserver;
    if (preset) {
      const isPen = preset.media === 'pen';
      const presetInfo = colors.listPresets(t)[presetName];
      const colorset = schemas.getDataDefault('colors', {
        name: presetName,
        title: presetInfo.name,
        description: presetInfo.description,
        implement: {
          type: isPen ? 'pen' : 'brush',
          width: isPen ? 1 : 3, // Size 3 crayola brush.
          length: isPen ? 0 : 10.75, // Size 3 crayola brush.
          stiffness: isPen ? 1 : 0.25, // Soft brush!
          drawLength: isPen ? 0 : 482, // 48.2cm medium brush distance.
          handleWidth: isPen ? 10 : 4.5, // Size 3 crayola brush handle.
        },
      });

      // Load in the default expected tools for watercolors if not a pen.
      if (!isPen) {
        colorset.tools = [...crayolaDefaultTools];
      }

      // Build colorset item map. No implement overrides needed.
      colorset.items = new Map();
      Object.entries(preset.colors).forEach(([name, color]) => {
        const id = `color${colorset.items.size}`;
        colorset.items.set(id, schemas.getDataDefault('color', {
          id,
          name: t(`colorsets:colors.${name}`),
          color,
        }));
      });

      // TODO: Allow this to be set somewhere?
      colorset.items.set(ignoreWhite.id, { ...ignoreWhite });
      return colorset;
    }

    return null;
  };

  // Load custom from given machine name.
  colors.loadCustom = (name) => {

  };

  // Get the path to the json file for a given custom colorset.
  colors.getCustomSetPath = (name) => {
    const sets = cncserver.utils.getUserDir('colorsets');
    return path.join(sets, `${name}.json`);
  };

  // Save custom from set
  colors.saveCustom = () => {
    const dest = colors.getCustomSetPath(colors.set.name);
    // We should really have a version number in here.
    fs.writeFileSync(dest, JSON.stringify(colors.getCurrentSet(), null, 2));
  };

  // Get the current colorset as a JSON ready object.
  colors.getCurrentSet = (t = s => s) => {
    const set = {
      ...colors.set,
      title: t(colors.set.title),
      description: t(colors.set.description),
      items: [],
    };

    Array.from(colors.set.items.values()).forEach(item => {
      set.items.push({
        ...item,
        name: t(item.name),
      });
    });

    return set;
  };

  /**
   * Run at setup, allows machine specific colorset defaults.
   */
  colors.setDefault = () => {
    // Trigger on schema loaded for schema & validation defaults.
    cncserver.binder.bindTo('schemas.loaded', colors.id, () => {
      let defaultSet = cncserver.schemas.getDataDefault('colors', {
        name: 'default',
        title: 'Default Set',
        description: '',
        implement: {
          type: 'pen',
          width: defaultPreset.width,
        },
      });
      defaultSet.items = new Map([['color0', defaultColor], ['ignore', ignoreWhite]]);

      defaultSet = cncserver.binder.trigger('colors.setDefault', defaultSet);
      colors.set = defaultSet;
      cncserver.binder.trigger('tools.update');
    });
  };

  // Bind to when bot/controller is configured and setup, set default.
  cncserver.binder.bindTo('controller.setup', colors.id, () => {
    colors.setDefault();
  });

  // Figure out if we should even parse color work
  colors.doColorParsing = () => {
    const items = {};
    colors.set.forEach((item) => {
      if (item.id !== 'ignore') {
        items[item.id] = true;
      }
    });
    return Object.keys(items).length > 1;
  };

  // Get a luminosity sorted list of colors.
  colors.getSortedSet = () => Array.from(colors.set.items.values()).sort(
    (a, b) => new Color(b.color).gray - new Color(a.color).gray
  );

  // Get an object keyed by color work ID, ordered by luminosity light->dark.
  colors.getWorkGroups = () => {
    const groups = {};
    const sorted = colors.getSortedSet();

    sorted.forEach((color) => {
      if (color.id !== 'ignore') {
        groups[color.id] = [];
      }
    });
    return groups;
  };

  /**
   * Snap all the paths in the given layer to a particular colorset item.
   *
   * @param {paper.Layer} layer
   */
  colors.snapPathColors = (layer) => {
    // Build Nearest Color matcher
    const c = {};
    colors.set.items.forEach(({ id, color }) => {
      c[id] = color;
    });

    const nearestColor = nc.from(c);
    layer.children.forEach((group) => {
      group.children.forEach((item) => {
        if (item.strokeColor) {
          // If we've never touched this path before, save the original color.
          if (!item.data.originalColor) {
            item.data.originalColor = item.strokeColor;
          }

          // Find nearest color.
          const nearest = nearestColor(item.data.originalColor.toCSS(true));
          const colorsetItem = colors.getColor(nearest.name, true);

          // If item matched to "ignore", hide it.
          if (nearest.name === 'ignore') {
            item.strokeWidth = 0;
          } else {
            // Match colorset item effective implement size.
            item.strokeWidth = colorsetItem.implement.width;

            // Save/set new color and matched ID.
            // IMPORTANT: This is how tool set swaps are rendered.
            item.data.colorID = nearest.name;
            item.strokeColor = nearest.value;

            // Assume less than full opacity with brush/watercolor paintings.
            item.opacity = colorsetItem.implement.type === 'brush' ? 0.8 : 1;

            // Prevent
            item.strokeCap = 'round';
            item.strokeJoin = 'round';
          }
        }
      });
    });
  };

  return colors;
};

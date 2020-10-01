/**
* @file Code for drawing color and "tool" change management.
*/

// Paper.js is all about that parameter reassignment life.
/* eslint-disable no-param-reassign */

const fs = require('fs');
const path = require('path');
const nc = require('nearest-color');
const { Color, Group } = require('paper');

const DEFAULT_PRESET = 'default-single-pen';
const IMPLEMENT_PARENT = '[inherit]';

// Final export object.
const colors = {
  id: 'drawing.colors',
  set: { // Set via initial preset or colorset loader.
    name: '', // Machine name for loading/folder storage
    title: '', // Clean name.
    description: '', // Description of what it is beyond title.
    implement: '', // Implement preset string.
    items: new Map(), // Items mapped by id.
    toolset: '', // Extra Toolset by machine name.
  },
};

// Location of internal colorset presets.
const presetDir = path.resolve(
  global.__basedir, 'components', 'core', 'drawing', 'colorsets'
);

module.exports = (cncserver) => {
  // Render presets for the API, translating human readable strings.
  colors.listPresets = (t) => {
    const sets = Object.values(cncserver.utils.getPresets('colorsets'));
    const sorted = sets.sort((a, b) => a.sortWeight > b.sortWeight ? 1 : -1);
    const out = {};

    // Translate strings.
    sorted.forEach((set) => {
      out[set.name] = colors.translateSet(set, t);
    });

    return out;
  };

  // List custom/overridden machine names.
  colors.customKeys = () =>
    Object.keys(cncserver.utils.getCustomPresets('colorsets'));

  // List internal machine names.
  colors.internalKeys = () =>
    Object.keys(cncserver.utils.getInternalPresets('colorsets'));

  // Object of preset keys with colorset toolset tool parents unavailable to this bot.
  colors.invalidPresets = () => {
    const out = {};
    const sets = colors.listPresets();
    const invalidToolsets = cncserver.tools.invalidPresets();

    // Move through all sets, report invalid toolsets
    Object.entries(sets).forEach(([name, { toolset }]) => {
      if (toolset in invalidToolsets) {
        out[name] = invalidToolsets[toolset];
      }
    });

    return out;
  };

  // Fully translate a given non-map based colorset.
  colors.translateSet = (set, t = t => t) => {
    if (set) {
      set.title = t(set.title);
      set.description = t(set.description);
      set.manufacturer = t(set.manufacturer);

      set.items.forEach((item) => {
        item.name = t(item.name);
      });
    }

    return set;
  };

  /**
   * Get a flat list of valid colorset key ids.
   *
   * @returns {array}
   *   Array of colorset item keys, empty array if none.
   */
  colors.getIDs = () => Array.from(colors.set.items.keys());

  // Make changes to the colorset object.
  colors.editSet = (set) => new Promise((resolve, reject) => {
    delete set.items;

    // Enforce clean machine name.
    set.name = cncserver.utils.getMachineName(set.name, 64);

    colors.set = cncserver.utils.merge(colors.set, set);
    colors.saveCustom();
    resolve();
  });

  // Take in a colorset and convert the items/tools to a map
  colors.setAsMap = (set = {}) => ({
    ...set,
    items: cncserver.utils.arrayToIDMap(set.items),
  });

  // Return a flat array version of the set.
  colors.setAsArray = (set = colors.set) => ({
    ...set,
    items: Array.from(set.items.values()),
  });

  // Load and return a correctly mapped colorset from a preset name.
  // Pass translate function to rewrite translatable fields.
  colors.getPreset = (presetName, t) => {
    const { utils } = cncserver;
    const set = colors.translateSet(utils.getPreset('colorsets', presetName), t);
    return set ? colors.setAsMap(set) : set;
  };

  // Edit an item.
  colors.edit = (item) => new Promise((resolve, reject) => {
    const { id } = item;
    colors.set.items.set(id, item);
    cncserver.sockets.sendPaperUpdate();
    colors.saveCustom();
    resolve(colors.set.items.get(id));
  });

  // Delete a color by id.
  colors.delete = (id) => {
    colors.set.items.delete(id);

    if (colors.set.items.size === 0) {
      // Load in the default 1 color preset.
      const color = colors.getPreset(DEFAULT_PRESET).items.get('color0');
      colors.set.items.set(color.id, color);
    }
    cncserver.sockets.sendPaperUpdate();
    colors.saveCustom();
  };

  // Add a color by all of its info, appended to the end.
  colors.add = ({ id, ...item }) => new Promise((resolve, reject) => {
    id = cncserver.utils.getMachineName(id, 64);
    if (!colors.getColor(id)) {
      colors.set.items.set(id, { id, ...item });
      cncserver.sockets.sendPaperUpdate();
      colors.saveCustom();
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

  // Get the full implement object for a given colorset item id.
  colors.getItemImplement = (id) => {
    const item = colors.set.items.get(id);
    const preset = item.implement === IMPLEMENT_PARENT
      ? colors.set.implement : item.implement;
    return cncserver.drawing.implements.get(preset);
  };

  // Get non-reference copy of colorset item by id.
  colors.getColor = (id, applyInheritance = false, withImplement = false) => {
    const { implements } = cncserver.drawing;
    const rawItem = colors.set.items.get(id);
    let item = null;

    if (rawItem) {
      item = { ...rawItem };

      // If the implementor wants it, and the item wants inheritance...
      if (item.implement === IMPLEMENT_PARENT) {
        if (applyInheritance) {
          item.implement = withImplement ? implements.get(colors.set.implement) : colors.set.implement;
        }
      } else if (withImplement) {
        item.implement = implements.get(item.implement);
      }
    }

    return item;
  };

  /**
   * Mutate the set object to match a preset by machine name.
   *
   * @param {string} presetName
   *
   * @returns {boolean}
   *   Null for failure, true if success.
   */
  colors.applyPreset = (presetName, t) => new Promise((resolve, reject) => {
    const { utils } = cncserver;
    const set = colors.getPreset(presetName);
    if (set) {
      colors.set = set;
      cncserver.tools.sendUpdate();
      resolve();
    } else {
      const err = new Error(
        cncserver.utils.singleLineString`Preset with machine name ID '${presetName}' not
        found or failed to load.`
      );
      err.allowedValues = Object.keys(utils.getPresets('colorsets'));
      reject(err);
    }
  });

  // Save custom from set.
  colors.saveCustom = () => {
    cncserver.utils.savePreset('colorsets', colors.setAsArray());
  };

  // Get the current colorset as a JSON ready object.
  colors.getCurrentSet = t => colors.translateSet(colors.setAsArray(), t);

  /**
   * Run at setup, allows machine specific colorset defaults.
   */
  colors.setDefault = () => {
    const { utils, binder } = cncserver;
    // Trigger on schema loaded for schema & validation defaults.
    binder.bindTo('schemas.loaded', colors.id, () => {
      let defaultSet = utils.getPreset('colorsets', 'default-single-pen');
      defaultSet = binder.trigger('colors.setDefault', defaultSet);
      colors.set = colors.setAsMap(defaultSet);
      cncserver.binder.trigger('tools.update');
    });
  };

  // Bind to when bot/controller is configured and setup, set default.
  cncserver.binder.bindTo('controller.setup', colors.id, () => {
    colors.setDefault();
  });

  // Figure out if we should even parse color work
  // TODO: this kinda sucks.
  colors.doColorParsing = () => {
    const items = {};
    colors.set.items.forEach((item) => {
      if (item.id !== 'ignore') {
        items[item.id] = true;
      }
    });
    return Object.keys(items).length > 1;
  };

  // Apply luminosity sorting (for presets without weighting info).
  colors.applyDefaultPrintSorting = (set) => {
    const luminositySorted = Array.from(set.items.values()).sort((a, b) =>
      new Color(b.color).gray - new Color(a.color).gray
    );

    let weight = -15;
    luminositySorted.forEach(({ id }) => {
      weight = weight + 3;
      set.items.get(id).printWeight = weight;
    });
  };

  // Get the print weight sorted list of colors.
  colors.getSortedSet = (set = colors.set) => Array.from(set.items.values()).sort(
    (a, b) => b.printWeight - a.printWeight
  );

  // Get an object keyed by color work ID, ordered by print weight of empty arrays.
  colors.getWorkGroups = () => {
    const groups = {};
    const sorted = colors.getSortedSet().reverse();

    sorted.forEach(({ id }) => {
      if (id !== 'ignore') {
        groups[id] = [];
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
    const { layers } = cncserver.drawing.base;
    const nearestColor = nc.from(c);

    // Remove everything on print, rebuild it from here.
    layers.print.removeChildren();

    // Setup all the destination groups within layers.
    const sorted = colors.getSortedSet().reverse();
    const printGroups = {}; // ID keyed set of Paper Groups.
    const colorsetItems = {}; // Static cache of items in groups.
    sorted.forEach(({ id }) => {
      printGroups[id] = new Group({ name: id });
      layers.print.addChild(printGroups[id]);
      colorsetItems[id] = colors.getColor(id, true, true);
    });

    // Move through all preview groups, then all items within them.
    layer.children.forEach((group) => {
      group.children.forEach((item) => {

        if (item.strokeColor) {
          // If we've never touched this path before, save the original color.
          if (!item.data.originalColor) {
            item.data.originalColor = item.strokeColor;
          }

          // Find nearest color.
          const nearest = nearestColor(item.data.originalColor.toCSS(true));
          colors.applyPreview(item, colorsetItems[nearest.name]);
          printGroups[nearest.name].addChild(item.clone());
        }
      });
    });
  };

  // Apply preview styles to an item.
  colors.applyPreview = (item, color) => {
    // If item matched to "ignore", hide it.
    if (color.id === 'ignore') {
      item.strokeWidth = 0;
    } else {
      // Match colorset item effective implement size.
      item.strokeWidth = color.implement.width;

      // Save/set new color and matched ID.
      // IMPORTANT: This is how tool set swaps are rendered.
      // TODO: Set swaps from print groupings.
      //item.data.colorID = colorID;
      item.strokeColor = color.color;

      // Assume less than full opacity with brush/watercolor paintings.
      item.opacity = color.implement.type === 'brush' ? 0.8 : 1;

      // Prevent sharp corners messing up render.
      item.strokeCap = 'round';
      item.strokeJoin = 'round';
    }
  };

  return colors;
};

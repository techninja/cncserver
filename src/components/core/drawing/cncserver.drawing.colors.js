/**
* @file Code for drawing color and "tool" change management.
*/

// Paper.js is all about that parameter reassignment life.
/* eslint-disable no-param-reassign */

import Paper from 'paper';
import chroma from 'chroma-js';
import { get as getImplement, IMPLEMENT_PARENT } from 'cs/drawing/implements';
import * as utils from 'cs/utils';
import * as tools from 'cs/tools';
import * as projects from 'cs/projects';
import * as matcher from 'cs/drawing/colors/matcher';
import { layers } from 'cs/drawing/base';
import { bindTo, trigger } from 'cs/binder';
import { getDataDefault } from 'cs/schemas';
import { sendPaperUpdate } from 'cs/sockets';

const { Color, Group } = Paper;

const DEFAULT_PRESET = 'default-single-pen';
const IGNORE_ITEM = '[IGNORE]';
const bindID = 'drawing.colors';

export const set = { // Set via initial preset or colorset loader.
  name: '', // Machine name for loading/folder storage
  title: '', // Clean name.
  description: '', // Description of what it is beyond title.
  implement: '', // Implement preset string.
  items: new Map(), // Items mapped by id.
  toolset: '', // Extra Toolset by machine name.
};

// Setup matcher Chroma library, colorset and project settings.
matcher.setup({ chroma });

bindTo('colors.update', bindID, colorset => {
  matcher.setup({ colorset });
});

bindTo('projects.update', bindID, ({ options }) => {
  matcher.setup({ options });
});

// Fully translate a given non-map based colorset.
export function translateSet(inputSet, t = tx => tx) {
  let transSet = null;
  if (inputSet) {
    transSet = { ...inputSet };
    transSet.title = t(transSet.title);
    transSet.description = t(transSet.description);
    transSet.manufacturer = t(transSet.manufacturer);

    transSet.items.forEach(item => {
      item.name = t(item.name);
    });
  }

  return transSet;
}

// Render presets for the API, translating human readable strings.
export function listPresets(t) {
  const sets = Object.values(utils.getPresets('colorsets'));
  const sorted = sets.sort((a, b) => (a.sortWeight > b.sortWeight ? 1 : -1));
  const out = {};

  // Translate strings.
  sorted.forEach(sortSet => {
    out[sortSet.name] = translateSet(sortSet, t);
  });

  return out;
}

// List custom/overridden machine names.
export function customKeys() {
  return Object.keys(utils.getCustomPresets('colorsets'));
}

// List internal machine names.
export function internalKeys() {
  return Object.keys(utils.getInternalPresets('colorsets'));
}

// Object of preset keys with colorset toolset tool parents unavailable to this bot.
export function invalidPresets() {
  const out = {};
  const sets = listPresets();
  const invalidToolsets = tools.invalidPresets();

  // Move through all sets, report invalid toolsets
  Object.entries(sets).forEach(([name, { toolset }]) => {
    if (toolset in invalidToolsets) {
      out[name] = invalidToolsets[toolset];
    }
  });

  return out;
}

// Take in a colorset and convert the items/tools to a map
export function setAsMap(mapSet = {}) {
  return {
    ...mapSet,
    items: utils.arrayToIDMap(mapSet.items),
  };
}

// Return a flat array version of the set.
export function setAsArray(arrSet = set) {
  return getDataDefault('colors', {
    ...arrSet,
    items: Array.from(arrSet.items.values()),
  });
}

// Save custom from set.
export function saveCustom() {
  const arrColorSet = setAsArray();
  trigger('colors.update', arrColorSet);
  utils.savePreset('colorsets', arrColorSet);
}

/**
  * Get a flat list of valid colorset key ids.
  *
  * @returns {array}
  *   Array of colorset item keys, empty array if none.
  */
export const getIDs = () => Array.from(set.items.keys());

// Make changes to the colorset object.
export const editSet = changedSet => new Promise(resolve => {
  delete changedSet.items;

  // Enforce clean machine name.
  changedSet.name = utils.getMachineName(changedSet.name, 64);

  utils.applyObjectTo(changedSet, set);
  saveCustom();
  resolve();
});

// Load and return a correctly mapped colorset from a preset name.
// Pass translate function to rewrite translatable fields.
export function getPreset(presetName, t) {
  const getSet = translateSet(utils.getPreset('colorsets', presetName), t);
  return getSet ? setAsMap(getSet) : getSet;
}

// Edit an item.
export const edit = item => new Promise(resolve => {
  const { id } = item;
  set.items.set(id, item);
  sendPaperUpdate();
  saveCustom();
  resolve(set.items.get(id));
});

// Delete a color by id.
export function deleteColor(id) {
  set.items.delete(id);

  if (set.items.size === 0) {
    // Load in the default 1 color preset.
    const color = getPreset(DEFAULT_PRESET).items.get('color0');
    set.items.set(color.id, color);
  }
  sendPaperUpdate();
  saveCustom();
}

// Add a color by all of its info, appended to the end.
export const add = ({ id, ...item }) => new Promise((resolve, reject) => {
  id = utils.getMachineName(id, 64);
  if (!getColor(id)) {
    set.items.set(id, { id, ...item });
    sendPaperUpdate();
    saveCustom();
    resolve();
  } else {
    reject(
      new Error(`Color with id "${id}" already exists, update it directly or change id`)
    );
  }
});

// Get a renderable color from a tool name. 'transparent' if no match.
export function getToolColor(name) {
  const item = set.items.get(name);
  return item ? item.color : 'transparent';
}

// Get the full implement object for a given colorset item id.
export function getItemImplement(id) {
  const item = set.items.get(id);
  const preset = item.implement === IMPLEMENT_PARENT
    ? set.implement : item.implement;
  return getImplement(preset);
}

// Get non-reference copy of colorset item by id.
export function getColor(id, applyInheritance = false, withImplement = false) {
  const rawItem = set.items.get(id);
  let item = null;

  if (rawItem) {
    item = { ...rawItem };

    // If the implementor wants it, and the item wants inheritance...
    if (item.implement === IMPLEMENT_PARENT) {
      if (applyInheritance) {
        item.implement = withImplement ? getImplement(set.implement) : set.implement;
      }
    } else if (withImplement) {
      item.implement = getImplement(item.implement);
    }
  }

  return item;
}

/**
  * Mutate the set object to match a preset by machine name.
  *
  * @param {string} presetName
  *
  * @returns {Promise}
  *   Rejects on failure, resolves on success (no return value).
  */
export const applyPreset = (presetName, t) => new Promise((resolve, reject) => {
  const newSet = getPreset(presetName);
  if (newSet?.items) {
    utils.applyObjectTo(newSet, set);
    tools.sendUpdate();
    trigger('colors.update', setAsArray());
    projects.setColorset(presetName);
    resolve();
  } else {
    const err = new Error(
      utils.singleLineString`Colorset preset with machine name ID '${presetName}' not
      found or failed to load.`
    );
    err.allowedValues = Object.keys(utils.getPresets('colorsets'));
    reject(err);
  }
});

// Get the current colorset as a JSON ready object.
export const getCurrentSet = t => translateSet(setAsArray(), t);

/**
  * Run at setup, allows machine specific colorset defaults.
  */
export function setDefault() {
  // Trigger on schema loaded for schema & validation defaults.
  bindTo('schemas.loaded', bindID, () => {
    let defaultSet = utils.getPreset('colorsets', 'default-single-pen');
    defaultSet = trigger('colors.setDefault', defaultSet);
    utils.applyObjectTo(setAsMap(defaultSet), set);
    trigger('colors.update', defaultSet);
    trigger('tools.update');
  });
}

// Bind to when bot/controller is configured and setup, set default.
bindTo('controller.setup', bindID, () => {
  setDefault();
});

// Figure out if we should even parse color work
// TODO: this kinda sucks.
export function doColorParsing() {
  const items = {};
  set.items.forEach(item => {
    if (item.id !== 'ignore') {
      items[item.id] = true;
    }
  });
  return Object.keys(items).length > 1;
}

// Apply luminosity sorting (for presets without weighting info).
export function applyDefaultPrintSorting(fromSet) {
  const luminositySorted = Array
    .from(fromSet.items.values())
    .sort((a, b) => new Color(b.color).gray - new Color(a.color).gray);

  let weight = -15;
  luminositySorted.forEach(({ id }) => {
    weight += 3;
    fromSet.items.get(id).printWeight = weight;
  });
}

// Get the print weight sorted list of colors.
export function getSortedSet(baseSet = set) {
  return Array.from(baseSet.items.values()).sort(
    (a, b) => b.printWeight - a.printWeight
  );
}

// Get an object keyed by color work ID, ordered by print weight of empty arrays.
export function getWorkGroups() {
  const groups = {};
  const sorted = getSortedSet().reverse();

  sorted.forEach(({ id }) => {
    if (id !== IGNORE_ITEM) {
      groups[id] = [];
    }
  });
  return groups;
}

// Apply preview styles to an item.
export function applyPreview(item, color) {
  // If item matched to "ignore", hide it.
  if (color.id === IGNORE_ITEM) {
    item.strokeWidth = 0;
  } else {
    // Match colorset item effective implement size.
    item.strokeWidth = color.implement.width;

    // Save/set new color and matched ID.
    // IMPORTANT: This is how tool set swaps are rendered.
    // TODO: Set swaps from print groupings.
    // item.data.colorID = colorID;
    item.strokeColor = color.color;

    // Assume less than full opacity with brush/watercolor paintings.
    item.opacity = color.implement.type === 'brush' ? 0.8 : 1;

    // Prevent sharp corners messing up render.
    item.strokeCap = 'round';
    item.strokeJoin = 'round';
  }
}

/**
  * Snap all the paths in the given layer to a particular colorset item.
  *
  * @param {paper.Layer} layer
  */
export function snapPathsToColorset(layer) {
  // This gets called every time there's an update to the render "preview" layer.
  //  - Layer children is a list of content Group() items by hash
  //  - Each group contains all the paths

  // To snap all the paths to a color, we should move through each path
  // Priorty?
  //  - Line color
  //  - Line thickness (not transferred yet, need to add)
  //  - Line Transparency (not transferred, need to add)

  // Remove everything on print, rebuild it from here.
  layers.print.removeChildren();

  // Setup all the destination groups within layers.
  const sorted = getSortedSet().reverse();
  const printGroups = {}; // ID keyed set of Paper Groups.
  const colorsetItems = {}; // Static cache of items in groups.
  sorted.forEach(({ id }) => {
    printGroups[id] = new Group({ name: id });
    layers.print.addChild(printGroups[id]);
    colorsetItems[id] = getColor(id, true, true);
  });

  console.log('MATCHING ITEMS =====================================================');

  // Move through all preview groups, then all items within them.
  layer.children.forEach(group => {
    group.children.forEach(item => {
      if (item.strokeColor) {
        // If we've never touched this path before, save the original color.
        if (!item.data.originalColor) {
          item.data.originalColor = item.strokeColor;
        }

        // Find nearest color.
        const nearestID = matcher.matchItemToColor(item);
        if (nearestID !== IGNORE_ITEM) {
          applyPreview(item, colorsetItems[nearestID]);
          printGroups[nearestID].addChild(item.clone());
        }
      }
    });
  });
}

/**
* @file Code for drawing implement presets and management.
*/
import * as utils from 'cs/utils';

// List Existing Presets.
export function listPresets(t, customOnly) {
  const sets = customOnly
    ? utils.getCustomPresets('implements')
    : utils.getPresets('implements');
  const items = Object.values(sets);
  const sorted = items.sort((a, b) => a.sortWeight > b.sortWeight ? 1 : -1);
  const out = {};

  // TODO: Translate implement titles.
  sorted.forEach(item => {
    out[item.name] = item;
  });
  return out;
}

// List custom/overridden machine names.
export function customKeys() {
  return Object.keys(utils.getCustomPresets('implements'));
}

// List internal machine names.
export function internalKeys() {
  return Object.keys(utils.getInternalPresets('implements'));
}

// Get a single preset directly from the files.
export function get(name, customOnly) {
  return utils.getPreset('implements', name, customOnly);
}

// Edit an implement.
export const edit = item => new Promise(resolve => {
  utils.savePreset('implements', item);
  resolve(item);
});

// Add a new custom override implement.
export const add = item => new Promise((resolve, reject) => {
  item.name = utils.getMachineName(item.name, 64);
  if (!get(item.name, true)) {
    utils.savePreset('implements', item);
    resolve();
  } else {
    reject(
      new Error(utils.singleLineString`Custom implement with name "${item.name}"
        already exists, update it directly or change new item name.`)
    );
  }
});

// Remove a custom preset.
export function deleteImplement(name) {
  utils.deletePreset('implements', name);
}

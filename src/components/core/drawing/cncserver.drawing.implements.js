/**
* @file Code for drawing implement presets and management.
*/

// Final export object.
const implements = {
  id: 'drawing.implements',
};

module.exports = (cncserver) => {
  // List Existing Presets.
  implements.listPresets = (t, customOnly) => {
    const { utils } = cncserver;
    const sets = customOnly
      ? utils.getCustomPresets('implements')
      : utils.getPresets('implements');
    const items = Object.values(sets);
    const sorted = items.sort((a, b) => a.sortWeight > b.sortWeight ? 1 : -1);
    const out = {};

    // TODO: Translate implement titles.
    sorted.forEach((item) => {
      out[item.name] = item;
    });
    return out;
  };

  // List custom/overridden machine names.
  implements.customKeys = () =>
    Object.keys(cncserver.utils.getCustomPresets('implements'));

  // List internal machine names.
  implements.internalKeys = () =>
    Object.keys(cncserver.utils.getInternalPresets('implements'));

  // Get a single preset directly from the files.
  implements.get = (name, customOnly) => cncserver.utils.getPreset('implements', name, customOnly);

  // Edit an implement.
  implements.edit = (item) => new Promise((resolve, reject) => {
    cncserver.utils.savePreset('implements', item);
    resolve(item);
  });

  // Add a new custom override implement.
  implements.add = (item) => new Promise((resolve, reject) => {
    const { utils } = cncserver;
    item.name = cncserver.utils.getMachineName(item.name, 64);
    if (!implements.get(item.name, true)) {
      utils.savePreset('implements', item);
      resolve();
    } else {
      reject(
        new Error(utils.singleLineString`Custom implement with name "${item.name}"
          already exists, update it directly or change new item name.`
        )
      );
    }
  });

  // Remove a custom preset.
  implements.delete = (name) => {
    cncserver.utils.deletePreset('implements', name);
  };

  return implements;
};

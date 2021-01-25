/**
 * @file Abstraction module for tool state and helper methods.
 */
import Paper from 'paper';
import * as utils from 'cs/utils';
import { botConf } from 'cs/settings';
import { movePenAbs } from 'cs/control';
import { setHeight, forceState } from 'cs/pen';
import { trigger, bindTo } from 'cs/binder';
import { base, colors } from 'cs/drawing';
import run from 'cs/run';
import { sendPaperUpdate } from 'cs/sockets';
import { resume } from 'cs/buffer';

const { Path, Group, PointText } = Paper;

// Set as part of colorset tool update.
export const set = {};

// List all tool presets and their data.
export function listPresets(t, customOnly) {
  // TODO: Translate title/description.
  return customOnly
    ? utils.getCustomPresets('toolsets')
    : utils.getPresets('toolsets');
}

// List custom/overridden machine names.
export function customKeys() {
  return Object.keys(utils.getCustomPresets('toolsets'));
}

// List internal machine names.
export function internalKeys() {
  return Object.keys(utils.getInternalPresets('toolsets'));
}

// Object of preset keys with set tools parents unavailable to this bot.
export function invalidPresets() {
  const out = {};
  const sets = listPresets();
  const botTools = botConf.get('tools');
  const botName = botConf.get('name');

  // Move through all sets, check the toolset for missing parents
  Object.entries(sets).forEach(([name, { setItems }]) => {
    setItems.forEach(item => {
      if (item.parent && !(item.parent in botTools)) {
        if (!(name in out)) out[name] = {};
        out[name][item.parent] = utils.singleLineString`'${botName}' does not supply
          required parent tool '${item.parent}'`;
      }
    });
  });

  return out;
}

// Get the current toolset as a translated, array based object.
export function getResponseSet(t) {
  // TODO: Translate title/description.
  return {
    ...set,
    items: utils.mapToArray(set.items),
  };
}

// Convert a colorset toolset to a flat array
export function colorsetTools(asMap = false) {
  return asMap ? set.items : utils.mapToArray(set.items);
}

// Can we edit the given tool id?
export function canEdit(id) {
  const editableList = Array.from(set.items.keys());
  return id ? editableList.includes(id) : editableList;
}

// Function to run after the tools have been changed (add, delete, edit).
export function sendUpdate() {
  saveCustom();
  sendPaperUpdate();
  trigger('tools.update');
}

// Function for editing tools (from the toolset only).
export const edit = tool => new Promise(resolve => {
  set.items.set(tool.id, tool);
  sendUpdate();
  resolve(set.items.get(tool.id));
});

// Function for editing toolset base properties (name, manufacturer, title, desc).
export const editSet = toolset => new Promise(resolve => {
  toolset.name = utils.getMachineName(toolset.name, 64);
  // Name change: Update in colorset.
  if (set.name !== toolset.name) {
    colors.set.toolset = toolset.name;
    colors.saveCustom();
  }
  utils.applyObjectTo({ ...toolset, items: set.items }, set);
  sendUpdate();
  resolve(getResponseSet());
});

// Delete the a verified ID.
export function deletePreset(id) {
  set.items.delete(id);
  sendUpdate();
}

// Add a validated tool.
export const add = tool => new Promise((resolve, reject) => {
  if (!set.items.get(tool.id)) {
    set.items.set(tool.id, tool);
    sendUpdate();
    resolve(set.items.get(tool));
  } else {
    reject(
      new Error(utils.singleLineString`Custom colorset tool with id
        "${tool.id}" already exists, update it directly or choose a different id.`)
    );
  }
});

// Flatten bot tools to array.
export function getBotTools() {
  const botTools = botConf.get('tools');
  const out = [];

  Object.entries(botTools).forEach(([id, tool]) => {
    out.push({
      id,
      parent: '',
      ...tool,
      x: parseFloat(tool.x),
      y: parseFloat(tool.y),
      width: tool.width ? parseFloat(tool.width) : 0,
      height: tool.height ? parseFloat(tool.height) : 0,
    });
  });
  return out;
}

// Get a flat array of tools.
export function items() {
  return [
    ...getBotTools(),
    ...colorsetTools(),
  ];
}

export const getNames = () => items().map(({ id }) => id);

// Get a single item, undefined if invalid.
export const getItem = name => items().find(({ id }) => id === name);

// Automatically set the internal "tools.set" from "colors.set.toolset".
export function setFromColors() {
  const preset = utils.getPreset('toolsets', colors.set.toolset);

  utils.applyObjectTo({ ...preset, items: utils.arrayToIDMap(preset.items) }, set);
}

// Save changes to the current toolset
export function saveCustom() {
  // Special failover to prevent squashing empty "default".
  if (set.name === 'default') {
    set.name = 'default-custom';
    colors.set.toolset = set.name;
    colors.saveCustom();
  }

  utils.savePreset('toolsets', {
    ...set,
    items: utils.mapToArray(set.items),
  });
}

/**
  * Run the operation to change the current tool (and any aggregate operations
  * required) into the buffer
  *
  * @param name
  *   The machine name of the tool (as defined in the bot config file).
  * @param index
  *   Index for notifying user of what the manual tool change is for.
  * @param callback
  *   Triggered when the full tool change is to have been completed, or on
  *   failure.
  * @param waitForCompletion
  *   Pass false to call callback immediately after calculation, true to
  *   callback only after physical movement is complete.
  *
  * @returns {boolean}
  *   True if success, false on failure.
  */
export const changeTo = (
  name, index = null, callback = () => { }, waitForCompletion = false
) => {
  // Get the matching tool object from the bot configuration.
  const tool = getItem(name);

  // No tool found with that name? Augh! Run AWAY!
  if (!tool) {
    run('callback', callback);
    return false;
  }

  // For wait=false/"resume" tools, we really just resume the buffer.
  // It should be noted, this is obviously NOT a queable toolchange.
  // This should ONLY be called to restart the queue after a swap.
  if (tool.wait !== undefined && tool.wait === false) {
    resume();
    callback(1);
    return true;
  }

  // Pen Up
  setHeight('up');

  // Figure out the final position:
  let toolPos = { x: tool.x, y: tool.y };

  // Is there a parent? Offset for that.
  const parent = getItem(tool.parent);
  if (parent) {
    toolPos.x += parseFloat(parent.x);
    toolPos.y += parseFloat(parent.y);
  }

  // Convert MM to Abs steps.
  toolPos = utils.absToSteps(toolPos, 'mm', true);

  // Prevent out of bounds moves.
  toolPos = utils.sanityCheckAbsoluteCoord(toolPos);

  // Move to the tool
  movePenAbs(toolPos);

  // Set the tip of state pen to the tool now that the change is done.
  forceState({ tool: name });

  // Trigger the binder event.
  trigger('tool.change', {
    ...tool,
    index,
    name,
  });

  // Finish up.
  if (waitForCompletion) { // Run inside the buffer
    run('callback', callback);
  } else { // Run as soon as items have been buffered
    callback(1);
  }

  return true;
};

// Check for an ID.
export function has(checkID) {
  return !!items().filter(({ id }) => id === checkID).length;
}

// Bind to tools.update to redraw the tools layer.
bindTo('tools.update', 'tools', () => {
  const { layers } = base;
  const toolGroup = new Group();

  setFromColors();

  const toolItems = items();

  layers.tools.removeChildren();

  // Create a representation path for each tool.
  toolItems.forEach(tool => {
    const toolPos = { x: tool.x, y: tool.y };

    // Offset for center positions.
    if (tool.position === 'center') {
      toolPos.x -= tool.width / 2;
      toolPos.y -= tool.height / 2;
    }

    // Apply parent offset.
    const parent = getItem(tool.parent);
    if (parent) {
      toolPos.x += parent.x;
      toolPos.y += parent.y;
    }

    // Don't try to display tools without size.
    if (tool.width && tool.height) {
      const path = new Path.Rectangle({
        ...toolPos,
        width: tool.width,
        height: tool.height,
        radius: tool.radius,
        name: tool.id,
        strokeWidth: 1,
        strokeColor: 'black',
        fillColor: colors.getToolColor(tool.id),
      });

      const label = new PointText({ fontSize: 8, content: tool.id, opacity: 0.5 });
      label.fitBounds(path.bounds);
      toolGroup.addChild(new Group([path, label]));
    }
  });

  layers.tools.addChild(toolGroup);
  sendPaperUpdate('tools');
});

/**
 * @file Abstraction module for the run/queue utilities for CNC Server!
 */

import {
  getHash,
  extend,
  getPosChangeData,
  getHeightChangeData
} from 'cs/utils';
import { trigger as binderTrigger } from 'cs/binder';
import { sendMessage } from 'cs/ipc';
import { bot, gConf } from 'cs/settings';
import { resetState } from 'cs/pen';
import { state as actualPenState, updateState as updateActualPen } from 'cs/actualPen';
import { setBatchRunningState } from 'cs/api';
import {
  sendBufferVars,
  sendBufferAdd,
  sendBufferRemove,
  sendBufferComplete,
  sendMessageUpdate,
  sendCallbackUpdate
} from 'cs/sockets';

// Buffer State variables
export const state = {
  dataSet: {}, // Holds the actual buffer data keyed by hash.
  data: [], // Holds the order of the in a flat array of hashes.
  running: false, // Are we running? True if items in buffer/not paused
  paused: false, // Are we paused?
  newlyPaused: false, // Trigger for pause callback on executeNext()
  pauseCallback: null, // Temporary callback storage when pause is complete.
  pausePen: null, // Hold the state when paused initiated for resuming
};

/**
  * Setter for the internal buffer running flag.
  *
  * @param {boolean} runState
  *   True to keep buffer running, false to stop buffer on next loop.
  */
export function setRunning(runState) {
  state.running = !!runState;
}

/**
  * Setter for the internal buffer newly paused trigger flag.
  *
  * @param {boolean} pauseState
  *   True to allow triggering of pauseCallback, false to end trigger state.
  */
export function setNewlyPaused(pauseState) {
  state.newlyPaused = !!pauseState;
}

/**
  * Setter for the internal buffer paused trigger callback.
  *
  * @param {function} pauseCB
  */
export function setPauseCallback(pauseCB) {
  state.pauseCallback = () => {
    state.newlyPaused = false;
    state.pauseCallback = null;
    pauseCB();
  };
}

/**
  * Create a bot specific serial command string from a key:value object
  *
  * @param {string} name
  *   Key in bot.commands object to find the command string
  * @param {object} values
  *   Object containing the keys of placeholders to find in command string,
  *   with value to replace placeholder.
  *
  * @returns {string}
  *   Serial command string intended to be outputted directly, empty string
  *   if error.
  */
export function cmdstr(name, values = {}) {
  if (!name || !bot.commands[name]) return ''; // Sanity check
  let out = bot.commands[name];

  for (const [key, value] of Object.entries(values)) {
    out = out.replace(`%${key}`, value);
  }

  return out;
}

// Pause the buffer running.
export function pause() {
  state.paused = true;

  // Hold on to the current actualPen to return to before resuming.
  state.pausePen = extend(
    {}, actualPenState
  );
  sendMessage('buffer.pause');
  sendBufferVars();
}

// Resume the buffer running.
export function resume() {
  state.paused = false;
  state.pausePen = null;
  sendMessage('buffer.resume');
  sendBufferVars();
}

// Toggle the state
export function toggle(setPause) {
  if (setPause && !state.paused) {
    pause();
  } else if (!setPause && state.paused) {
    resume();
  }
}

// Event for when a buffer has been started.
export function startItem(hash) {
  if (gConf.get('debug')) {
    console.log(`Buffer RUN [${hash}]`);
  }
  const index = state.data.indexOf(hash);
  if (state.dataSet[hash] && index > -1) {
    const item = state.dataSet[hash];

    // Update the state of the actualPen to match the one in the buffer.
    item.pen.bufferHash = hash;
    updateActualPen(item.pen);
  } else {
    // TODO: when this happens, account for why or PREVENT IT.
    console.error(
      'IPC/Buffer Item or Hash Mismatch. This should never happen!',
      hash,
      `Index: ${index}`
    );
  }
}

/**
  * Trigger non-serial commands in local buffer items on execution by the
  * runner. The runner can't do anything with these except say that their
  * place in line has come.
  *
  * @param  {object} item
  *   Buffer item to check/trigger.
  *
  * @return {boolean}
  *   True if triggered, false if not applicable.
  */
export function trigger(item) {
  if (typeof item.command === 'function') { // Custom Callback buffer item
    // Just call the callback function.
    item.command(1);
    return true;
  }

  if (typeof item.command === 'object') { // Detailed buffer object
    switch (item.command.type) {
      case 'message':
        sendMessageUpdate(item.command.message);
        return true;
      case 'callbackname':
        sendCallbackUpdate(item.command.name);
        return true;
      default:
    }
  }

  return false;
}

// Remove an object with the specific hash from the buffer.
//
// This should only be called by the process running the buffer, and denotes
// when an item is run into the machine.
export function removeItem(hash) {
  const index = state.data.indexOf(hash);
  if (state.dataSet[hash] && index > -1) {
    state.data.splice(index, 1);
    const item = state.dataSet[hash];

    // For buffer items with non-serial commands, it's time to do something!
    trigger(item);

    delete state.dataSet[hash];
    sendBufferRemove();
  } else if (state.data.length) {
    // This is really only an issue if we didn't just clear the buffer.
    console.error(
      'End IPC/Buffer Item & Hash Mismatch. This should never happen!',
      hash,
      `Index: ${index}`
    );
  }

  // Trigger the pause callback if it exists when this item is done.
  if (typeof state.pauseCallback === 'function') {
    state.pauseCallback();
  }
}

/**
  * Helper function for clearing the buffer.
  */
export function clear(isEmpty) {
  state.data.length = 0;
  state.dataSet = {};

  state.pausePen = null; // Resuming with an empty buffer is silly
  state.paused = false;

  // If we're clearing, we need to kill any batch processes running.
  setBatchRunningState(false);

  // Reset the state of the buffer tip pen to the state of the actual robot.
  // If this isn't done, it will be assumed to be a state that was deleted
  // and never sent out.
  resetState();

  // Detect if this came from IPC runner being empty or not.
  if (!isEmpty) {
    sendMessage('buffer.clear');
    console.log('Run buffer cleared!');
  }

  // Send full update as it's been cleared.
  sendBufferComplete();

  // Trigger the event.
  binderTrigger('buffer.clear');
}

/**
  * Render an action item into an array of serial command strings.
  *
  * @param  {object} item
  *   The raw buffer "action" item.
  *
  * @return {object}
  *   Object containing keys:
  *     commands: array of all serial command strings rendered from item.
  *     duration: numeric duration (in milliseconds) that item should take.
  */
export function render(item) {
  let commands = [];
  let duration = 0;

  if (typeof item.command === 'object') { // Detailed buffer object
    switch (item.command.type) {
      case 'absmove':
        // eslint-disable-next-line
        const posChangeData = getPosChangeData(
          item.command.source,
          item.command
        );

        posChangeData.d = item.duration;
        duration = posChangeData.d;
        commands = [cmdstr('movexy', posChangeData)];
        break;

      case 'absheight':
        // To set Height, we can set a rate for how slow it moves,
        //  - servo.minduration is minimum time.
        //  - Don't set duration if moving at same time
        //
        commands = [cmdstr('movez', {
          r: 2200,
          z: item.command.z,
          d: getHeightChangeData(
            item.command.source,
            item.command.z
          ).d,
        })];

        break;

      case 'special':
        return { commands, duration, special: item.command.data };

      default:
    }
  } else if (typeof item.command === 'string') {
    // Serial command is direct string in item.command, no render needed.
    commands = [item.command];
  }

  return { commands, duration };
}

// Add an object to the buffer.
export function addItem(item) {
  const hash = getHash(item);
  if (gConf.get('debug')) {
    console.log(`Buffer ADD [${hash}]:`, item);
  }

  state.data.unshift(hash);
  state.dataSet[hash] = item;

  // Add the item to the runner's buffer.
  sendMessage('buffer.add', {
    hash,
    ...render(item),
  });

  sendBufferAdd(item, hash); // Alert clients.
  return hash;
}

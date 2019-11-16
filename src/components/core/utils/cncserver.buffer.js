/**
 * @file Abstraction module for the run/queue utilities for CNC Server!
 */
let buffer = {};

module.exports = (cncserver) => {
  // Buffer State variables
  buffer = {
    dataSet: {}, // Holds the actual buffer data keyed by hash.
    data: [], // Holds the order of the in a flat array of hashes.
    running: false, // Are we running? True if items in buffer/not paused
    paused: false, // Are we paused?
    newlyPaused: false, // Trigger for pause callback on executeNext()
    pauseCallback: null, // Temporary callback storage when pause is complete.
    pausePen: null, // Hold the state when paused initiated for resuming
  };

  /**
   * Helper function for clearing the buffer. Used mainly by plugins.
   */
  buffer.clear = () => {
    buffer.data = [];

    // Reset the state of the buffer tip pen to the state of the actual robot.
    // If this isn't done, it will be assumed to be a state that was deleted
    // and never sent out.
    cncserver.pen.resetState();
    cncserver.sockets.sendBufferVars();
  };

  /**
   * Setter for the internal buffer running flag.
   *
   * @param {boolean} runState
   *   True to keep buffer running, false to stop buffer on next loop.
   */
  buffer.setRunning = (runState) => {
    buffer.running = !!runState;
  };

  /**
   * Setter for the internal buffer newly paused trigger flag.
   *
   * @param {boolean} pauseState
   *   True to allow triggering of pauseCallback, false to end trigger state.
   */
  buffer.setNewlyPaused = (pauseState) => {
    buffer.newlyPaused = !!pauseState;
  };

  /**
   * Setter for the internal buffer paused trigger callback.
   *
   * @param {function} pauseCB
   */
  buffer.setPauseCallback = (pauseCB) => {
    buffer.pauseCallback = () => {
      buffer.newlyPaused = false;
      buffer.pauseCallback = null;
      pauseCB();
    };
  };

  // Pause the buffer running.
  buffer.pause = () => {
    buffer.paused = true;

    // Hold on to the current actualPen to return to before resuming.
    buffer.pausePen = cncserver.utils.extend(
      {}, cncserver.actualPen.state
    );
    cncserver.ipc.sendMessage('buffer.pause');
    cncserver.sockets.sendBufferVars();
  };

  // Resume the buffer running.
  buffer.resume = () => {
    buffer.paused = false;
    buffer.pausePen = null;
    cncserver.ipc.sendMessage('buffer.resume');
    cncserver.sockets.sendBufferVars();
  };

  // Toggle the state
  buffer.toggle = (setPause) => {
    if (setPause && !buffer.paused) {
      buffer.pause();
    } else if (!setPause && buffer.paused) {
      buffer.resume();
    }
  };

  // Add an object to the buffer.
  buffer.addItem = (item) => {
    const hash = cncserver.utils.getHash(item);
    if (cncserver.settings.gConf.get('debug')) {
      console.log(`Buffer ADD [${hash}]:`, item);
    }

    buffer.data.unshift(hash);
    buffer.dataSet[hash] = item;

    // Add the item to the runner's buffer.
    cncserver.ipc.sendMessage('buffer.add', {
      hash,
      ...buffer.render(item),
    });

    cncserver.sockets.sendBufferAdd(item, hash); // Alert clients.
    return hash;
  };

  // Event for when a buffer has been started.
  buffer.startItem = (hash) => {
    if (cncserver.settings.gConf.get('debug')) {
      console.log(`Buffer RUN [${hash}]`);
    }
    const index = buffer.data.indexOf(hash);
    if (buffer.dataSet[hash] && index > -1) {
      const item = buffer.dataSet[hash];

      // Update the state of the actualPen to match the one in the buffer.
      item.pen.bufferHash = hash;
      cncserver.actualPen.updateState(item.pen);

      // Trigger an update for actualPen change.
      cncserver.sockets.sendPenUpdate();
    } else {
      // TODO: when this happens, account for why or PREVENT IT.
      console.error(
        'IPC/Buffer Item or Hash Mismatch. This should never happen!',
        hash,
        `Index: ${index}`
      );
    }
  };

  // Remove an object with the specific hash from the buffer.
  //
  // This should only be called by the process running the buffer, and denotes
  // when an item is run into the machine.
  buffer.removeItem = (hash) => {
    const index = buffer.data.indexOf(hash);
    if (buffer.dataSet[hash] && index > -1) {
      buffer.data.splice(index, 1);
      const item = buffer.dataSet[hash];

      // For buffer items with non-serial commands, it's time to do something!
      buffer.trigger(item);

      delete buffer.dataSet[hash];
      cncserver.sockets.sendBufferRemove();
    } else if (buffer.data.length) {
      // This is really only an issue if we didn't just clear the buffer.
      console.error(
        'End IPC/Buffer Item & Hash Mismatch. This should never happen!',
        hash,
        `Index: ${index}`
      );
    }

    // Trigger the pause callback if it exists when this item is done.
    if (typeof buffer.pauseCallback === 'function') {
      buffer.pauseCallback();
    }
  };

  /**
   * Helper function for clearing the buffer.
   */
  buffer.clear = (isEmpty) => {
    buffer.data = [];
    buffer.dataSet = {};

    buffer.pausePen = null; // Resuming with an empty buffer is silly
    buffer.paused = false;

    // If we're clearing, we need to kill any batch processes running.
    cncserver.api.setBatchRunningState(false);

    // Reset the state of the buffer tip pen to the state of the actual robot.
    // If this isn't done, it will be assumed to be a state that was deleted
    // and never sent out.
    cncserver.pen.resetState();

    // Detect if this came from IPC runner being empty or not.
    if (!isEmpty) {
      cncserver.ipc.sendMessage('buffer.clear');
      console.log('Run buffer cleared!');
    }

    // Send full update as it's been cleared.
    cncserver.sockets.sendBufferComplete();

    // Trigger the event.
    cncserver.binder.trigger('buffer.clear');
  };

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
  buffer.render = (item) => {
    let commands = [];
    let duration = 0;

    if (typeof item.command === 'object') { // Detailed buffer object
      switch (item.command.type) {
        case 'absmove':
          // eslint-disable-next-line
          const posChangeData = cncserver.utils.getPosChangeData(
            item.command.source,
            item.command
          );

          posChangeData.d = item.duration;
          duration = posChangeData.d;
          commands = [buffer.cmdstr('movexy', posChangeData)];
          break;

        case 'absheight':
          // To set Height, we can set a rate for how slow it moves,
          //  - servo.minduration is minimum time.
          //  - Don't set duration if moving at same time
          //
          commands = [buffer.cmdstr('movez', {
            r: 2200,
            z: item.command.z,
            d: cncserver.utils.getHeightChangeData(
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
  };

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
  buffer.trigger = (item) => {
    if (typeof item.command === 'function') { // Custom Callback buffer item
      // Just call the callback function.
      item.command(1);
      return true;
    }

    if (typeof item.command === 'object') { // Detailed buffer object
      switch (item.command.type) {
        case 'message':
          cncserver.sockets.sendMessageUpdate(item.command.message);
          return true;
        case 'callbackname':
          cncserver.sockets.sendCallbackUpdate(item.command.name);
          return true;
        default:
      }
    }

    return false;
  };

  /**
   * Create a bot specific serial command string from a key:value object
   *
   * @param {string} name
   *   Key in cncserver.settings.bot.commands object to find the command string
   * @param {object} values
   *   Object containing the keys of placeholders to find in command string,
   *   with value to replace placeholder.
   *
   * @returns {string}
   *   Serial command string intended to be outputted directly, empty string
   *   if error.
   */
  buffer.cmdstr = (name, values = {}) => {
    if (!name || !cncserver.settings.bot.commands[name]) return ''; // Sanity check

    let out = cncserver.settings.bot.commands[name];

    for (const [key, value] of Object.entries(values)) {
      out = out.replace(`%${key}`, value);
    }

    return out;
  };

  return buffer;
};

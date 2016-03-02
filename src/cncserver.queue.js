"use strict";

/**
 * @file Abstraction module for the run/queue utilities for CNC Server!
 */

module.exports = function(cncserver) {
  var extend = require('util')._extend;      // Util for cloning objects

  // Buffer State variables
  cncserver.buffer = {
    data: [],
    running: false,      // Are we running? True if items in buffer/not paused.
    paused: false,       // Are we paused?
    newlyPaused: false,  // Trigger for pause callback on executeNext()
    pauseCallback: null, // Temporary callback storage when pause is complete.
    pausePen: null,      // Hold the state when paused initiated for resuming
  };

  /**
   * Helper function for clearing the buffer. Used mainly by plugins.
   */
  cncserver.buffer.clear = function() {
    cncserver.buffer.data = [];

    // Reset the state of the buffer tip pen to the state of the actual robot.
    // If this isn't done, it will be assumed to be a state that was deleted
    // and never sent out.
    cncserver.pen = extend({}, cncserver.actualPen);
  };


  /**
   * Add a command to the command runner buffer.
   *
   * @param {string} command
   *   The command type to be run, must be one of the supported:
   *    - move
   *    - height
   *    - message
   *    - callbackname
   *    - wait
   *    - custom
   *    - callback
   * @param {object} data
   *   The data to be applied in the command.
   * @param {int} duration
   *   The time in milliseconds this command should take to run.
   *
   * @returns {boolean}
   *   Return false if failure, true if success
   */
  cncserver.run = function(command, data, duration) {
    var c = '';

    // Sanity check duration to minimum of 1, int only
    duration = !duration ? 1 : Math.abs(parseInt(duration));
    duration = duration <= 0 ? 1 : duration;

    switch (command) {
      case 'move':
        // Detailed buffer object X and Y
        c = {type: 'absmove', x: data.x, y: data.y};
        break;
      case 'height':
        // Detailed buffer object with z height and state string
        c = {type: 'absheight', z: data, state: cncserver.pen.state};
        break;
      case 'message':
        // Detailed buffer object with a string message
        c = {type: 'message', message: data};
        break;
      case 'callbackname':
        // Detailed buffer object with a callback machine name
        c = {type: 'callbackname', name: data};
        break;
      case 'wait':
        // Send wait, blocking buffer
        if (!cncserver.bot.commands.wait) return false;
        c = cncserver.buffer.cmdstr('wait', {d: duration});
        break;
      case 'custom':
        c = data;
        break;
      case 'callback': // Custom callback runner for API return triggering
        c = data;
        break;
      default:
        return false;
    }

    // Add final command and duration to end of queue, along with a copy of the
    // pen state at this point in time to be copied to actualPen after execution

    // TODO: Trade this out with a grouped function that adds to the
    // remote and local buffer, and notifies the socket clients all together.
    cncserver.buffer.data.unshift([c, duration, extend({}, cncserver.pen)]);
    cncserver.io.sendBufferAdd(cncserver.buffer.data[0]);
    return true;
  };


  /**
   * Helper function for clearing the buffer. Used mainly by plugins.
   */
  cncserver.buffer.clear = function() {
    cncserver.buffer.data = [];

    // Reset the state of the buffer tip pen to the state of the actual robot.
    // If this isn't done, it will be assumed to be a state that was deleted
    // and never sent out.
    cncserver.pen = extend({}, cncserver.actualPen);
  };


  /**
   * Create a bot specific serial command string from a key:value object
   *
   * @param {string} name
   *   Key in cncserver.bot.commands object to find the command string
   * @param {object} values
   *   Object containing the keys of placeholders to find in command string,
   *   with value to replace placeholder.
   * @returns {string}
   *   Serial command string intended to be outputted directly, empty string
   *   if error.
   */
  cncserver.buffer.cmdstr = function(name, values) {
    if (!name || !cncserver.bot.commands[name]) return ''; // Sanity check

    var out = cncserver.bot.commands[name];

    for(var v in values) {
      out = out.replace('%' + v, values[v]);
    }

    return out;
  };

};

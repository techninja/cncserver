/**
 * @file Abstraction module for the cncserver run utility
 */

let run;

module.exports = (cncserver) => {
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
   * @param {int} rawDuration
   *   The time in milliseconds this command should take to run.
   *
   * @returns {boolean}
   *   Return false if failure, true if success
   */
  run = (command, data, rawDuration) => {
    let c = '';

    // Sanity check duration to minimum of 1, int only
    let duration = !rawDuration ? 1 : Math.abs(parseInt(rawDuration, 10));
    duration = duration <= 0 ? 1 : duration;

    switch (command) {
      case 'move':
        // Detailed buffer object X and Y.
        c = {
          type: 'absmove',
          x: data.x,
          y: data.y,
          source: data.source,
        };
        break;

      case 'height':
        // Detailed buffer object with z height and state string
        c = {
          type: 'absheight',
          z: data.z,
          source: data.source,
          state: cncserver.pen.state.state,
        };
        break;

      case 'message':
        // Detailed buffer object with a string message
        c = { type: 'message', message: data };
        break;

      case 'callbackname':
        // Detailed buffer object with a callback machine name
        c = { type: 'callbackname', name: data };
        break;

      case 'wait':
        // Send wait, blocking buffer
        if (!cncserver.settings.bot.commands.wait) return false;
        c = cncserver.buffer.cmdstr('wait', { d: duration });
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
    cncserver.pen.forceState({ lastDuration: duration });
    cncserver.buffer.addItem({
      command: c,
      duration,
      pen: cncserver.utils.extend({}, cncserver.pen.state),
    });

    return true;
  };

  return run;
};

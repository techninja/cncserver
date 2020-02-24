/**
 * @file Abstraction module for functions that generate movement or help
 * functions for calculating movement command generation for CNC Server!
 */
const extend = require('util')._extend; // Util for cloning objects

const actualPen = {}; // Exposed export.

module.exports = (cncserver) => {
  // actualPen: This is set to the state of the pen variable as it passes through
  // the buffer queue and into the robot, meant to reflect the actual position and
  // state of the robot, and will be where the pen object is reset to when the
  // buffer is cleared and the future state is lost.
  actualPen.state = extend({}, cncserver.pen.state);

  /**
   * Set internal state object as an extended copy of the passed object.
   *
   * @param {object} state
   */
  actualPen.updateState = (state) => {
    actualPen.state = extend({}, state);

    // Trigger an update for actualPen change.
    cncserver.sockets.sendPenUpdate();
  };

  /**
   * Force the values of a given set of keys within the actualPen state.
   *
   * @param {object} inState
   *   Flat object of key/value pairs to FORCE into the actualPen state. Only
   *   used to fix state when it needs correcting from inherited buffer.
   *   EG: After a cancel/estop.
   */
  actualPen.forceState = (inState) => {
    for (const [key, value] of Object.entries(inState)) {
      // Only set a value if the key exists in the state already.
      if (key in actualPen.state) {
        actualPen.state[key] = value;
      }
    }
    cncserver.sockets.sendPenUpdate();
  };

  return actualPen;
};

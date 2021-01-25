/**
 * @file Abstraction module for functions that generate movement or help
 * functions for calculating movement command generation for CNC Server!
 */
import { state as penState } from 'cs/pen';
import { extend } from 'cs/utils';
import { sendPenUpdate } from 'cs/sockets';

// actualPen: This is set to the state of the pen variable as it passes through
// the buffer queue and into the robot, meant to reflect the actual position and
// state of the robot, and will be where the pen object is reset to when the
// buffer is cleared and the future state is lost.
export const state = extend({}, penState);

/**
  * Set internal state object as an extended copy of the passed object.
  *
  * @param {object} state
  */
export function updateState(newState) {
  for (const [key, value] of Object.entries(newState)) {
    state[key] = value;
  }

  // Trigger an update for actualPen change.
  sendPenUpdate();
}

/**
  * Force the values of a given set of keys within the actualPen state.
  *
  * @param {object} inState
  *   Flat object of key/value pairs to FORCE into the actualPen state. Only
  *   used to fix state when it needs correcting from inherited buffer.
  *   EG: After a cancel/estop.
  */
export function forceState(inState) {
  for (const [key, value] of Object.entries(inState)) {
    // Only set a value if the key exists in the state already.
    if (key in state) {
      state[key] = value;
    }
  }
  sendPenUpdate();
}

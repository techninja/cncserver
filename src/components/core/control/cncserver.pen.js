/**
 * @file Abstraction module for pen state and setter/helper methods.
 */
import { gConf, bot, botConf } from 'cs/settings';
import {
  inPenToSteps,
  centToSteps,
  stateToHeight,
  applyObjectTo
} from 'cs/utils';
import { connect, localTrigger } from 'cs/serial';
import { movePenAbs, actuallyMoveHeight } from 'cs/control';
import { cmdstr } from 'cs/buffer';
import run from 'cs/run';
import * as actualPen from 'cs/actualPen';

// const { Path } = Paper;

// The pen state: this holds the state of the pen at the "latest tip" of the buffer,
// meaning that as soon as an instruction intended to be run in the buffer is
// received, this is updated to reflect the intention of the buffered item.
export const state = {
  x: null, // XY set by bot defined park position (assumed initial location)
  y: null,
  z: null,
  state: 0, // Pen state is from 0 (up/off) to 1 (down/on)
  height: 0, // Last set pen height in output servo value
  power: 0,
  busy: false,
  tool: 'color0', // TODO: This seems wrong and assuming.
  implement: '', // Implement string.
  offCanvas: false,
  bufferHash: '', // Holds the last pen buffer hash.
  lastDuration: 0, // Holds the last movement timing in milliseconds
  distanceCounter: 0, // Holds a running tally of distance travelled
  simulation: 0, // Fake everything and act like it's working, no serial
};

/**
  * General logic sorting function for most "pen" requests.
  *
  * @param {object} inPenState
  *   Raw object containing data from /v1/pen PUT requests. See API spec for
  *   pen to get an idea of what can live in this object.
  * @param {function} callback
  *   Callback triggered when intended action should be complete.
  * @param {number} speedOverride
  *   Percent of speed to set for this movement only.
  */
export function setPen(inPenState, callback = () => { }, speedOverride = null) {
  const debug = gConf.get('debug');

  // What can happen here?
  // We're changing state, and what we need is the ability to find all the
  // passed, changed state from either the actual pen state, OR the tip of
  // our last "buffered" movement.
  //
  // We can set:
  // - Power
  // - X/Y (with speed)
  // - Height/pen "state"/Z
  // - X/Y/Z (must complete together)
  // - Simulation on/off

  // Force the distanceCounter to be a number (was coming up as null)
  state.distanceCounter = parseFloat(state.distanceCounter);

  // Counter Reset
  if (inPenState.resetCounter) {
    state.distanceCounter = Number(0);
    callback(true);
    return;
  }

  // Setting the value of the power to the pen
  if (typeof inPenState.power !== 'undefined') {
    setPower(inPenState.power, callback);
    return;
  }

  // Setting the value of simulation
  if (typeof inPenState.simulation !== 'undefined') {
    // No change
    if (inPenState.simulation === state.simulation) {
      callback(true);
      return;
    }

    if (inPenState.simulation === '0') { // Attempt to connect to serial
      connect({ complete: callback });
    } else { // Turn off serial!
      // TODO: Actually nullify connection.. no use case worth it yet
      localTrigger('simulationStart');
    }

    return;
  }

  // State/z position has been passed
  if (typeof inPenState.state !== 'undefined') {
    // Disallow actual pen setting when off canvas (unless skipping buffer)
    if (!state.offCanvas || inPenState.skipBuffer) {
      setHeight(inPenState.state, callback, inPenState.skipBuffer);
    } else {
      // Save the state anyways so we can come back to it
      state.state = inPenState.state;
      if (callback) callback(1);
    }
    return;
  }

  // Absolute positions are set
  if (inPenState.x !== undefined) {
    // Input values are given as percentages of working area (not max area)
    const point = {
      abs: inPenState.abs,
      x: Number(inPenState.x),
      y: Number(inPenState.y),
    };

    // Don't accept bad input
    const penNaN = Number.isNaN(point.x) || Number.isNaN(point.y);
    const penFinite = Number.isFinite(point.x) && Number.isFinite(point.y);
    if (penNaN || !penFinite) {
      if (debug) {
        console.log('setPen: Either X/Y not valid numbers.');
      }
      callback(false);
      return;
    }

    // Override this to move with accelleration if override isn't set.
    // TODO: Allow switching between accell and flat speed movements.
    /* if (speedOverride === null) {
      // Convert the percentage or absolute in/mm XY values into absolute steps.
      const startPoint = cncserver.utils.stepsToAbs(pen.state, 'mm');
      const endPoint = utils.stepsToAbs(cncserver.utils.inPenToSteps(point), 'mm');

      const movePath = new Path([
        startPoint,
        endPoint,
      ]);
      // cncserver.sockets.sendPaperUpdate();

      const accellPoints = cncserver.drawing.accell.getPointsSync(movePath);
      accellPoints.forEach((pos) => {
        pen.setPen({ ...pos.point, abs: 'mm' }, null, pos.speed);
      });

      pen.setPen({ ...endPoint, abs: 'mm' }, null, 0);
      callback(true);

      // movePath.remove(); // TODO: Move this to when it's done?
      return;
    } */

    // Convert the percentage or absolute in/mm XY values into absolute steps.
    const absInput = inPenToSteps(point);
    absInput.limit = 'workArea';

    // Are we parking?
    if (inPenState.park) {
      // Don't repark if already parked (but not if we're skipping the buffer)
      const parkPos = centToSteps(bot.park, true);
      if (
        state.x === parkPos.x
        && state.y === parkPos.y
        && !inPenState.skipBuffer
      ) {
        if (debug) {
          console.log('setPen: Can\'t park when already parked.');
        }
        if (callback) callback(false);
        return;
      }

      // Set Absolute input value to park position in steps
      absInput.x = parkPos.x;
      absInput.y = parkPos.y;
      absInput.limit = 'maxArea';
    }

    movePenAbs(
      absInput,
      callback,
      inPenState.waitForCompletion,
      inPenState.skipBuffer,
      speedOverride
    );

    return;
  }

  if (callback) callback(state);
}

/**
  * Set the "power" option
  *
  * @param {number} power
  *   Value from 0 to 100 to send to the bot.
  * @param callback
  *   Callback triggered when operation should be complete.
  * @param skipBuffer
  *   Set to true to skip adding the command to the buffer and run it
  *   immediately.
  */
export function setPower(power, callback, skipBuffer) {
  const powers = botConf.get('penpower') || { min: 0, max: 0 };

  run(
    'custom',
    cmdstr(
      'penpower',
      { p: Math.round(power * powers.max) + Number(powers.min) }
    )
  );

  state.power = power;
  if (callback) callback(true);
}

/**
  * Run a servo position from a given percentage or named height value into
  * the buffer, or directly via skipBuffer.
  *
  * @param {number|string} inState
  *   Named height preset machine name, or float between 0 & 1.
  * @param callback
  *   Callback triggered when operation should be complete.
  * @param skipBuffer
  *   Set to true to skip adding the command to the buffer and run it
  *   immediately.
  */
export function setHeight(inState, callback, skipBuffer) {
  let servoDuration = botConf.get('servo:minduration');

  // Convert the incoming state
  const conv = stateToHeight(inState);
  const { height = 0, state: stateValue = null } = conv;

  // If we're skipping the buffer, just set the height directly
  if (skipBuffer) {
    console.log('Skipping buffer to set height:', height);
    actuallyMoveHeight(height, stateValue, callback);
    return;
  }

  const sourceHeight = state.height;

  // Pro-rate the duration depending on amount of change to tip of buffer.
  // TODO: Replace with cncserver.utils.getHeightChangeData()
  if (state.height) {
    const servo = botConf.get('servo');
    const range = parseInt(servo.max, 10) - parseInt(servo.min, 10);
    servoDuration = Math.round(
      (Math.abs(height - state.height) / range) * servoDuration
    ) + 1;
  }

  // Actually set tip of buffer to given sanitized state & servo height.
  state.height = height;
  state.state = stateValue;

  // Run the height into the command buffer
  run('height', { z: height, source: sourceHeight }, servoDuration);

  // Height movement callback servo movement duration offset
  const delay = servoDuration - gConf.get('bufferLatencyOffset');
  if (callback) {
    setTimeout(() => {
      callback(1);
    }, Math.max(delay, 0));
  }
}

/**
  * Reset state of pen to current head (actualPen).
  */
export function resetState() {
  applyObjectTo(actualPen.state, state);
}

/**
  * Park the pen.
  *
  * @param {boolean} direct
  *   True to send direct and skip the buffer.
  * @param {function} callback
  *   Ya know.
  */
export function park(direct = false, callback = () => { }) {
  setHeight('up', () => {
    setPen({
      x: bot.park.x,
      y: bot.park.y,
      park: true,
      skipBuffer: direct,
    }, callback);
  }, direct);
}

/**
  * Force the values of a given set of keys within the pen state.
  *
  * @param {object} inState
  *   Flat object of key/value pairs to FORCE into the pen state. Only used to
  *   correct head state or to update position along the buffer.
  */
export function forceState(inState) {
  for (const [key, value] of Object.entries(inState)) {
    // Only set a value if the key exists in the state already.
    if (key in state) {
      state[key] = value;
    }
  }
}

/**
  * Set the internal state hash value.
  *
  * @param {string} hash
  *   Buffer hash to set.
  */
export function setHash(hash) {
  state.bufferHash = hash;
}

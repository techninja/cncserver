/**
 * @file Abstraction module for functions that generate movement or help
 * functions for calculating movement command generation for CNC Server!
 */
import * as utils from 'cs/utils';
import { bot, gConf } from 'cs/settings';
import { state as bufferState, render } from 'cs/buffer';
import * as pen from 'cs/pen';
import * as actualPen from 'cs/actualPen';
import * as tools from 'cs/tools';
import run from 'cs/run';
import { sendPenUpdate } from 'cs/sockets';
import { colors, base, accell } from 'cs/drawing';
import { trigger } from 'cs/binder';
import { sendMessage } from 'cs/ipc';

// Command state variables.
export const state = {
  commandDuration: 0,
};

/**
  * Triggered when the pen is requested to move across the bounds of the draw
  * area (either in or out).
  *
  * @param {boolean} newValue
  *   Pass true when moving "off screen", false when moving back into bounds
  */
export function offCanvasChange(newValue) {
  // Only do anything if the value is different
  if (pen.state.offCanvas !== newValue) {
    pen.forceState({ offCanvas: newValue });
    if (pen.state.offCanvas) { // Pen is now off screen/out of bounds
      if (pen.isDown()) {
        // Don't draw stuff while out of bounds (also, don't change the
        // current known state so we can come back to it when we return to
        // bounds),but DO change the buffer tip height so that is reflected on
        // actualPen if it's every copied over on buffer execution.
        run('callback', () => {
          pen.setHeight('up', false, true);
          const { height } = utils.stateToHeight('up');
          pen.forceState({ height });
        });
      }
    } else { // Pen is now back in bounds
      // Set the state regardless of actual change
      console.log('Go back to:', pen.state.back);

      // Assume starting from up state & height (ensures correct timing)
      pen.forceState({
        state: 'up',
        height: utils.stateToHeight('up').height,
      });
      pen.setHeight(pen.state.back);
    }
  }
}

/**
  * Actually move the position of the pen, called inside and outside buffer
  * runs, figures out timing/offset based on actualPen position.
  *
  * @param {{x: number, y: number}} destination
  *   Absolute destination coordinate position (in steps).
  * @param {function} callback
  *   Optional, callback for when operation should have completed.
  * @param {number} speedOverride
  *   Percent of speed to set for this movement only.
  */
export function actuallyMove(destination, callback, speedOverride = null) {
  // Get the amount of change/duration from difference between actualPen and
  // absolute position in given destination
  const change = pen.getPosChangeData(
    actualPen.state,
    destination,
    speedOverride
  );

  state.commandDuration = Math.max(change.d, 0);

  // Execute the command immediately via serial.direct.command.
  sendMessage('serial.direct.command',
    render({
      command: {
        type: 'absmove',
        x: destination.x,
        y: destination.y,
        source: actualPen.state,
      },
    }));

  // Set the correct duration and new position through to actualPen
  actualPen.forceState({
    lastDuration: change.d,
    x: destination.x,
    y: destination.y,
  });

  // If there's nothing in the buffer, reset pen to actualPen
  if (bufferState.data.length === 0) {
    pen.resetState();
  }

  // Trigger an update for pen position
  sendPenUpdate();

  // Delayed callback (if used)
  if (callback) {
    setTimeout(() => {
      callback(1);
    }, Math.max(state.commandDuration, 0));
  }
}

/**
  * Actually change the height of the pen, called inside and outside buffer
  * runs, figures out timing offset based on actualPen position.
  *
  * @param {integer} height
  *   Write-ready servo "height" value calculated from "state"
  * @param {string} stateValue
  *   Optional, pass what the name of the state should be saved as in the
  *   actualPen object when complete.
  * @param {function} cb
  *   Optional, callback for when operation should have completed.
  */
export function actuallyMoveHeight(height, stateValue, cb) {
  const change = utils.getHeightChangeData(
    actualPen.state.height,
    height
  );

  state.commandDuration = Math.max(change.d, 0);

  // Pass along the correct height position through to actualPen.
  if (typeof stateValue !== 'undefined') {
    actualPen.forceState({ state: stateValue });
  }

  // Execute the command immediately via serial.direct.command.
  sendMessage('serial.direct.command',
    render({
      command: {
        type: 'absheight',
        z: height,
        source: actualPen.state.height,
      },
    }));

  actualPen.forceState({
    height,
    lastDuration: change.d,
  });

  // Trigger an update for pen position.
  sendPenUpdate();

  // Delayed callback (if used)
  if (cb) {
    setTimeout(() => {
      cb(1);
    }, Math.max(state.commandDuration, 0));
  }
}

/**
  * "Move" the pen (tip of the buffer) to an absolute point inside the maximum
  * available bot area. Includes cutoffs and sanity checks.
  *
  * @param {{x: number, y: number, [limit: string]}} inPoint
  *   Absolute coordinate measured in steps to move to. src is assumed to be
  *   "pen" tip of buffer. Also can contain optional "limit" key to set where
  *   movement should be limited to. Defaults to none, accepts "workArea".
  * @param {function} callback
  *   Callback triggered when operation should be complete.
  * @param {boolean} immediate
  *   Set to true to trigger the callback immediately.
  * @param {boolean} skip
  *    Set to true to skip adding to the buffer, simplifying this function
  *    down to just a sanity checker.
  * @param {number} speedOverride
  *   Percent of speed to set for this movement only.
  *
  * @returns {number}
  *   Distance moved from previous position, in steps.
  */
export function movePenAbs(
  inPoint, callback, immediate = true, skip, speedOverride = null
) {
  // Something really bad happened here...
  if (Number.isNaN(inPoint.x) || Number.isNaN(inPoint.y)) {
    console.error('INVALID Move pen input, given:', inPoint);
    if (callback) callback(false);
    return 0;
  }

  // Make a local copy of point as we don't want to mess with its values ByRef
  const point = utils.extend({}, inPoint);

  // Sanity check absolute position input point and round everything (as we
  // only move in whole number steps)
  point.x = Math.round(Number(point.x));
  point.y = Math.round(Number(point.y));

  // If moving in the workArea only, limit to allowed workArea, and trigger
  // on/off screen events when we go offscreen, retaining suggested position.
  let startOffCanvasChange = false;
  if (point.limit === 'workArea') {
    // Off the Right
    if (point.x > bot.workArea.right) {
      point.x = bot.workArea.right;
      startOffCanvasChange = true;
    }

    // Off the Left
    if (point.x < bot.workArea.left) {
      point.x = bot.workArea.left;
      startOffCanvasChange = true;
    }

    // Off the Top
    if (point.y < bot.workArea.top) {
      point.y = bot.workArea.top;
      startOffCanvasChange = true;
    }

    // Off the Bottom
    if (point.y > bot.workArea.bottom) {
      point.y = bot.workArea.bottom;
      startOffCanvasChange = true;
    }

    // Are we beyond our workarea limits?
    if (startOffCanvasChange) { // Yep.
      // We MUST trigger the start offscreen change AFTER the movement to draw
      // up to that point (which happens later).
      startOffCanvasChange = true;
    } else { // Nope!
      // The off canvas STOP trigger must happen BEFORE the move happens
      // (which is fine right here)
      offCanvasChange(false);
    }
  }

  // Ensure values don't go off the rails
  utils.sanityCheckAbsoluteCoord(point);

  // If we're skipping the buffer, just move to the point
  // Pen stays put as last point set in buffer
  if (skip) {
    console.log('Skipping buffer for:', point);
    actuallyMove(point, callback, speedOverride);
    return 0; // Don't return any distance for buffer skipped movements
  }

  // Calculate change from end of buffer pen position
  const source = { x: pen.state.x, y: pen.state.y };
  const change = {
    x: Math.round(point.x - pen.state.x),
    y: Math.round(point.y - pen.state.y),
  };

  // Don't do anything if there's no change
  if (change.x === 0 && change.y === 0) {
    if (callback) callback(pen.state);
    return 0;
  }

  /*
    Duration/distance is only calculated as relative from last assumed point,
    which may not actually ever happen, though it is likely to happen.
    Buffered items may not be pushed out of order, but previous location may
    have changed as user might pause the buffer, and move the actualPen
    position.
    @see executeNext - for more details on how this is handled.
  */
  const distance = utils.getVectorLength(change);
  const duration = pen.getDurationFromDistance(distance, 1, null, speedOverride);

  // Only if we actually moved anywhere should we queue a movement
  if (distance !== 0) {
    // Set the tip of buffer pen at new position
    pen.forceState({
      x: point.x,
      y: point.y,
    });

    // Adjust the distance counter based on movement amount, not if we're off
    // the canvas though.
    if (pen.isDown()
      && !pen.state.offCanvas
      && bot.inWorkArea(point)) {
      pen.forceState({
        distanceCounter: parseFloat(
          Number(distance) + Number(pen.state.distanceCounter)
        ),
      });
    }

    // Queue the final absolute move (serial command generated later)
    run('move', { x: pen.state.x, y: pen.state.y, source }, duration);
  }

  // Required start offCanvas change -after- movement has been queued
  if (startOffCanvasChange) {
    offCanvasChange(true);
  }

  if (callback) {
    if (immediate === true) {
      callback(pen.state);
    } else {
      // Set the timeout to occur sooner so the next command will execute
      // before the other is actually complete. This will push into the buffer
      // and allow for far smoother move runs.

      const latency = gConf.get('bufferLatencyOffset');
      const cmdDuration = Math.max(duration - latency, 0);

      if (cmdDuration < 2) {
        callback(pen.state);
      } else {
        setTimeout(() => {
          callback(pen.state);
        }, cmdDuration);
      }
    }
  }

  return distance;
}

export const accelMoveOnPath = path => new Promise((success, error) => {
  const move = (point, speed = null) => {
    const stepPoint = utils.absToSteps(point, 'mm', true);
    movePenAbs(stepPoint, null, true, null, speed);
  };

  // Pen up
  pen.setPen({ state: 'up' });

  // Move to start of path, then pen down.
  move(path.getPointAt(0));
  pen.setPen({ state: 'draw' });

  // Calculate groups of accell points and run them into moves.
  accell.getPoints(path, accellPoints => {
    // If we have data, move to those points.
    if (accellPoints && accellPoints.length) {
      // Move through all accell points from start to nearest end point
      accellPoints.forEach(pos => {
        move(pos.point, pos.speed);
      });
    } else {
      // Null means generation of accell points was cancelled.
      if (accellPoints !== null) {
        // No points? We're done. Wrap up the line.

        // Move to end of path...
        move(path.getPointAt(path.length));

        // If it's a closed path, overshoot back home.
        if (path.closed) {
          move(path.getPointAt(0));
        }

        // End with pen up.
        pen.setPen({ state: 'up' });

        // Fulfull the promise for this subpath.
        success();
        return;
      }

      // If we're here, path generation was cancelled, bubble it.
      error();
    }
  });
});

/**
  * Actually render Paper paths into movements
  *
  * @param {object} source
  *   Source paper object containing the children, defaults to preview layer.
  */
export function renderPathsToMoves(reqSettings = {}) {
  const source = base.layers.print;
  const settings = {
    parkAfter: true,
    ...reqSettings,
  };
  // TODO:
  // * Join extant non-closed paths with endpoint distances < 0.5mm
  // * Split work by colors
  // * Allow WCB bot support to inject tool changes for refill support
  // * Order paths by pickup/dropoff distance

  // Store work for all paths grouped by color
  const workGroups = colors.getWorkGroups();
  const validColors = Object.keys(workGroups);
  source.children.forEach(colorGroup => {
    if (workGroups[colorGroup.name]) {
      workGroups[colorGroup.name] = base.getPaths(colorGroup);
    }
  });

  let workGroupIndex = 0;
  function nextWorkGroup() {
    const colorID = validColors[workGroupIndex];
    if (colorID) {
      const paths = workGroups[colorID];

      if (paths.length) {
        // Bind trigger for implementors on work group begin.
        trigger('control.render.group.begin', colorID);

        // Do we have a tool for this colorID? If not, use manualswap.
        if (colors.doColorParsing()) {
          const changeTool = tools.has(colorID) ? colorID : 'manualswap';
          tools.changeTo(changeTool, colorID);
        }

        let pathIndex = 0;
        const nextPath = () => {
          if (paths[pathIndex]) {
            accelMoveOnPath(paths[pathIndex]).then(() => {
              // Trigger implementors for path render complete.
              trigger('control.render.path.finish', paths[pathIndex]);

              // Path in this group done, move to the next.
              pathIndex++;
              nextPath();
            }).catch(error => {
              // If we have an error object, it's an actual error!
              if (error) {
                console.error(error);
              }
              // Otherwise, path generation has been entirely cancelled.
              workGroupIndex = validColors.length;
            });
          } else {
            // No more paths in this group, move to the next.
            workGroupIndex++;
            nextWorkGroup();
          }
        };

        // Start processing paths in the initial workgroup.
        nextPath();
      } else {
        // There is no work for this group, move to the next one.
        workGroupIndex++;
        nextWorkGroup();
      }
    } else {
      // Actually complete with all paths in all work groups!
      // TODO: Fullfull a promise for the function?

      // Trigger binding for implementors on sucessfull rendering completion.
      trigger('control.render.finish');

      // If settings say to park.
      if (settings.parkAfter) pen.park();
    }
  }
  // Intitialize working on the first group on the next process tick.
  process.nextTick(nextWorkGroup);
}

'use strict';

/**
 * @file Abstraction module for functions that generate movement or help
 * functions for calculating movement command generation for CNC Server!
 */

module.exports = function(cncserver) {
  var extend = require('util')._extend;      // Util for cloning objects

  cncserver.control = {};

  /**
   * General logic sorting function for most "pen" requests.
   *
   * @param {object} inPen
   *   Raw object containing data from /v1/pen PUT requests. See API spec for
   *   pen to get an idea of what can live in this object.
   * @param callback
   *   Callback triggered when intended action should be complete.
   */
  cncserver.control.setPen = function(inPen, callback) {
    // Force the distanceCounter to be a number (was coming up as null)
    cncserver.pen.distanceCounter = parseFloat(cncserver.pen.distanceCounter);

    // Counter Reset
    if (inPen.resetCounter) {
      cncserver.pen.distanceCounter = Number(0);
      callback(true);
      return;
    }

    // Setting the value of the power to the pen
    if (typeof inPen.power !== "undefined") {
      var powers = cncserver.botConf.get('penpower');
      if(typeof powers === "undefined") { // We have no super powers
        powers = {min: 0, max: 0};  // Set the powers to zero
      }

      cncserver.run(
        'custom',
        cncserver.control.cmdstr(
          'penpower',
           {p: Math.round(inPen.power * powers.max) + Number(powers.min)}
        )
      );

      cncserver.pen.power = inPen.power;
      if (callback) callback(true);
      return;
    }

    // Setting the value of simulation
    if (typeof inPen.simulation !== "undefined") {

      // No change
      if (inPen.simulation === cncserver.pen.simulation) {
        callback(true);
        return;
      }

      if (inPen.simulation === '0') { // Attempt to connect to serial
        cncserver.serial.connect({complete: callback});
      } else {  // Turn off serial!
        // TODO: Actually nullify connection.. no use case worth it yet
        cncserver.serial.localTrigger('simulationStart');
      }

      return;
    }


    // State/z position has been passed
    if (typeof inPen.state !== "undefined") {
      // Disallow actual pen setting when off canvas (unless skipping buffer)
      if (!cncserver.pen.offCanvas || inPen.skipBuffer) {
        cncserver.control.setHeight(inPen.state, callback, inPen.skipBuffer);
      } else {
        // Save the state anyways so we can come back to it
        cncserver.pen.state = inPen.state;
        if (callback) callback(1);
      }
      return;
    }

    // Absolute positions are set
    if (inPen.x !== undefined){
      // Input values are given as percentages of working area (not max area)

      // Don't accept bad input
      var penNaN = isNaN(inPen.x) || isNaN(inPen.y);
      var penFinite = isFinite(inPen.x) && isFinite(inPen.y);
      if ( penNaN || !penFinite ) {
        callback(false);
        return;
      }

      // Convert the percentage values into real absolute and appropriate values
      var absInput = cncserver.utils.centToSteps(inPen);
      absInput.limit = 'workArea';

      // Are we parking?
      if (inPen.park) {
        // Don't repark if already parked (but not if we're skipping the buffer)
        var park = cncserver.utils.centToSteps(cncserver.bot.park, true);
        var pen = cncserver.pen;
        if (pen.x === park.x && pen.y === park.y && !inPen.skipBuffer) {
          if (callback) callback(false);
          return;
        }

        // Set Absolute input value to park position in steps
        absInput.x = park.x;
        absInput.y = park.y;
        absInput.limit = 'maxArea';
      }

      // Sanity check and format ignoreTimeout as clean triple equals boolean.
      if (typeof inPen.ignoreTimeout !== 'undefined') {
        inPen.ignoreTimeout = parseInt(inPen.ignoreTimeout) === 1;
      }

      cncserver.control.movePenAbs(
        absInput,
        callback,
        inPen.ignoreTimeout,
        inPen.skipBuffer
      );

      return;
    }

    if (callback) callback(cncserver.pen);
  };


  /**
   * Run a servo position from a given percentage or named height value into
   * the buffer, or directly via skipBuffer.
   *
   * @param {number|string} state
   *   Named height preset machine name, or float between 0 & 1.
   * @param callback
   *   Callback triggered when operation should be complete.
   * @param skipBuffer
   *   Set to true to skip adding the command to the buffer and run it
   *   immediately.
   */
  cncserver.control.setHeight = function(state, callback, skipBuffer) {
    var stateValue = null; // Placeholder for what to normalize the pen state to
    var height = 0; // Placeholder for servo height value
    var servoDuration = cncserver.botConf.get('servo:duration');

    // Convert the incoming state
    var conv = cncserver.utils.stateToHeight(state);
      height = conv.height;
      stateValue = conv.state;

    // If we're skipping the buffer, just set the height directly
    if (skipBuffer) {
      console.log('Skipping buffer to set height:', height);
      cncserver.control.actuallyMoveHeight(height, stateValue, callback);
      return;
    }

    var sourceHeight = cncserver.pen.height;

    // Pro-rate the duration depending on amount of change to tip of buffer.
    // TODO: Replace with cncserver.utils.getHeightChangeData()
    if (cncserver.pen.height) {
      var servo = cncserver.botConf.get('servo');
      var range = parseInt(servo.max) - parseInt(servo.min);
      servoDuration = Math.round(
        (Math.abs(height - cncserver.pen.height) / range) * servoDuration
      ) + 1;
    }

    // Actually set tip of buffer to given sanitized state & servo height.
    cncserver.pen.height = height;
    cncserver.pen.state = stateValue;

    // Run the height into the command buffer
    cncserver.run('height', {z: height, source: sourceHeight}, servoDuration);

    // Height movement callback servo movement duration offset
    var delay = servoDuration - cncserver.gConf.get('bufferLatencyOffset');
    if (callback) {
      setTimeout(function(){
        callback(1);
      }, Math.max(delay, 0));
    }
  };


  /**
   * Run the operation to set the current tool (and any aggregate operations
   * required) into the buffer
   *
   * @param toolName
   *   The machine name of the tool (as defined in the bot config file).
   * @param callback
   *   Triggered when the full tool change is to have been completed, or on
   *   failure.
   *
   * @returns {boolean}
   *   True if success, false on failure.
   */
  cncserver.control.setTool = function(toolName, callback, ignoreTimeout) {
    // Parse out any virtual indexes (pipe delimited) from the tool name.
    // These are passed by clients to assist users for manual tool swaps, but
    // doesn't actually do anything differently.
    var toolNameData = toolName.split('|');
    var vIndex = toolNameData[1];
    toolName = toolNameData[0];

    // Get the matching tool object from the bot configuration.
    var tool = cncserver.botConf.get('tools:' + toolName);

    // No tool found with that name? Augh! Run AWAY!
    if (!tool) {
      if (callback) {
        cncserver.run('callback', callback);
      }
      return false;
    }

    // Set the height based on what kind of tool it is
    // TODO: fold this into bot specific tool change logic
    var downHeight = toolName.indexOf('water') !== -1 ? 'wash' : 'draw';

    // Pen Up
    cncserver.control.setHeight('up');

    // Move to the tool
    cncserver.control.movePenAbs(tool);

    // A "wait" tool requires user feedback before it can continue.
    if (typeof tool.wait !== "undefined") {
      // Queue a callback to pause continued execution on tool.wait value
      if (tool.wait) {
        var moveDuration = cncserver.pen.lastDuration;
        cncserver.run('callback', function() {
          cncserver.buffer.pause();
          cncserver.buffer.newlyPaused = true;

          // Trigger the manualswap with virtual index for the client/user.
          cncserver.buffer.pauseCallback = function() {
            cncserver.buffer.pauseCallback = null;
            cncserver.buffer.newlyPaused = false;
            setTimeout(function() {
              cncserver.io.manualSwapTrigger(vIndex);
            }, moveDuration);
          };
        });
      }
    } else { // "Standard" WaterColorBot toolchange

      // Pen down
      cncserver.control.setHeight(downHeight);

      // Wiggle the brush a bit
      cncserver.control.wigglePen(
        tool.wiggleAxis,
        tool.wiggleTravel,
        tool.wiggleIterations
      );

      // Put the pen back up when done!
      cncserver.control.setHeight('up');
    }

    // If there's a callback to run...
    if (callback){
      if (!ignoreTimeout) { // Run inside the buffer
        cncserver.run('callback', callback);
      } else { // Run as soon as items have been buffered
        callback(1);
      }
    }

    return true;
  };

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
   *
   * @returns {number}
   *   Distance moved from previous position, in steps.
   */
  cncserver.control.movePenAbs = function(inPoint, callback, immediate, skip) {
    // Something really bad happened here...
    if (isNaN(inPoint.x) || isNaN(inPoint.y)){
      console.error('INVALID Move pen input, given:', inPoint);
      if (callback) callback(false);
      return 0;
    }

    // Make a local copy of point as we don't want to mess with its values ByRef
    var point = extend({}, inPoint);

    // Sanity check absolute position input point and round everything (as we
    // only move in whole number steps)
    point.x = Math.round(Number(point.x));
    point.y = Math.round(Number(point.y));

    // If moving in the workArea only, limit to allowed workArea, and trigger
    // on/off screen events when we go offscreen, retaining suggested position.
    var startOffCanvasChange = false;
    if (point.limit === 'workArea') {
      // Off the Right
      if (point.x > cncserver.bot.workArea.right) {
        point.x = cncserver.bot.workArea.right;
        startOffCanvasChange = true;
      }

      // Off the Left
      if (point.x < cncserver.bot.workArea.left) {
        point.x = cncserver.bot.workArea.left;
        startOffCanvasChange = true;
      }

      // Off the Top
      if (point.y < cncserver.bot.workArea.top) {
        point.y = cncserver.bot.workArea.top;
        startOffCanvasChange = true;
      }

      // Off the Bottom
      if (point.y > cncserver.bot.workArea.bottom) {
        point.y = cncserver.bot.workArea.bottom;
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
        cncserver.control.offCanvasChange(false);
      }
    }

    // Ensure values don't go off the rails
    cncserver.utils.sanityCheckAbsoluteCoord(point);

    // If we're skipping the buffer, just move to the point
    // Pen stays put as last point set in buffer
    if (skip) {
      console.log('Skipping buffer for:', point);
      cncserver.control.actuallyMove(point, callback);
      return 0; // Don't return any distance for buffer skipped movements
    }

    // Calculate change from end of buffer pen position
    var source = {x: cncserver.pen.x, y: cncserver.pen.y};
    var change = {
      x: Math.round(point.x - cncserver.pen.x),
      y: Math.round(point.y - cncserver.pen.y)
    };

    // Don't do anything if there's no change
    if (change.x === 0 && change.y === 0) {
      if (callback) callback(cncserver.pen);
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
    var distance = cncserver.utils.getVectorLength(change);
    var duration = cncserver.utils.getDurationFromDistance(distance);

    // Only if we actually moved anywhere should we queue a movement
    if (distance !== 0) {
      // Set the tip of buffer pen at new position
      cncserver.pen.x = point.x;
      cncserver.pen.y = point.y;

      // Adjust the distance counter based on movement amount, not if we're off
      // the canvas though.
      if (cncserver.utils.penDown() &&
          !cncserver.pen.offCanvas &&
          cncserver.bot.inWorkArea(point)) {
        cncserver.pen.distanceCounter = parseFloat(
          Number(distance) + Number(cncserver.pen.distanceCounter)
        );
      }

      // Queue the final absolute move (serial command generated later)
      cncserver.run(
        'move',
        {
          x: cncserver.pen.x,
          y: cncserver.pen.y,
          source: source
        },
        duration
      );
    }

    // Required start offCanvas change -after- movement has been queued
    if (startOffCanvasChange) {
      cncserver.control.offCanvasChange(true);
    }

    if (callback) {
      if (immediate === true) {
        callback(cncserver.pen);
      } else {
        // Set the timeout to occur sooner so the next command will execute
        // before the other is actually complete. This will push into the buffer
        // and allow for far smoother move runs.

        var latency = cncserver.gConf.get('bufferLatencyOffset');
        var cmdDuration = Math.max(duration - latency, 0);

        if (cmdDuration < 2) {
          callback(cncserver.pen);
        } else {
          setTimeout(function(){
            callback(cncserver.pen);
          }, cmdDuration);
        }

      }
    }

    return distance;
  };

  /**
   * Triggered when the pen is requested to move across the bounds of the draw
   * area (either in or out).
   *
   * @param {boolean} newValue
   *   Pass true when moving "off screen", false when moving back into bounds
   */
  cncserver.control.offCanvasChange = function (newValue) {
    // Only do anything if the value is different
    if (cncserver.pen.offCanvas !== newValue) {
      cncserver.pen.offCanvas = newValue;
      if (cncserver.pen.offCanvas) { // Pen is now off screen/out of bounds
        if (cncserver.utils.penDown()) {
          // Don't draw stuff while out of bounds (also, don't change the
          // current known state so we can come back to it when we return to
          // bounds),but DO change the buffer tip height so that is reflected on
          // actualPen if it's every copied over on buffer execution.
          cncserver.run('callback', function() {
            cncserver.control.setHeight('up', false, true);
            cncserver.pen.height = cncserver.utils.stateToHeight('up').height;
          });
        }
      } else { // Pen is now back in bounds
        // Set the state regardless of actual change
        var back = cncserver.pen.state;
        console.log('Go back to:', back);

        // Assume starting from up state & height (ensures correct timing)
        cncserver.pen.state = "up";
        cncserver.pen.height = cncserver.utils.stateToHeight('up').height;
        cncserver.control.setHeight(back);
      }
    }
  };

  /**
   * Actually move the position of the pen, called inside and outside buffer
   * runs, figures out timing/offset based on actualPen position.
   *
   * @param {{x: number, y: number}} destination
   *   Absolute destination coordinate position (in steps).
   * @param {function} callback
   *   Optional, callback for when operation should have completed.
   */
  cncserver.control.actuallyMove = function(destination, callback) {
    // Get the amount of change/duration from difference between actualPen and
    // absolute position in given destination
    var change = cncserver.utils.getPosChangeData(
      cncserver.actualPen,
      destination
    );

    cncserver.control.commandDuration = Math.max(change.d, 0);

    // Execute the command immediately via serial.direct.command.
    cncserver.ipc.sendMessage('serial.direct.command', {
      commands: cncserver.buffer.render({
        command: {
          type: 'absmove',
          x: destination.x,
          y: destination.y,
          source: cncserver.actualPen
        },
        duration: cncserver.control.commandDuration
      })
    });

    // Set the correct duration and new position through to actualPen
    cncserver.actualPen.lastDuration = change.d;
    cncserver.actualPen.x = destination.x;
    cncserver.actualPen.y = destination.y;

    // If there's nothing in the buffer, reset pen to actualPen
    if (cncserver.buffer.data.length === 0) {
      cncserver.pen = cncserver.utils.extend({}, cncserver.actualPen);
    }

    // Trigger an update for pen position
    cncserver.io.sendPenUpdate();

    // Delayed callback (if used)
    if (callback) {
      setTimeout(function(){
        callback(1);
      }, Math.max(cncserver.control.commandDuration, 0));
    }
  };

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
  cncserver.control.actuallyMoveHeight = function(height, stateValue, cb) {
    var change = cncserver.utils.getHeightChangeData(
      cncserver.actualPen.height,
      height
    );

    cncserver.control.commandDuration = Math.max(change.d, 0);

    // Pass along the correct height position through to actualPen.
    if (typeof stateValue !== 'undefined') {
      cncserver.actualPen.state = stateValue;
    }

    // Execute the command immediately via serial.direct.command.
    cncserver.ipc.sendMessage('serial.direct.command', {
      commands: cncserver.buffer.render({
        command: {
          type: 'absheight',
          z: height,
          source: cncserver.actualPen.height
        },
        duration: cncserver.control.commandDuration
      })
    });

    cncserver.actualPen.height = height;
    cncserver.actualPen.lastDuration = change.d;

    // Trigger an update for pen position.
    cncserver.io.sendPenUpdate();

    // Delayed callback (if used)
    if (cb) {
      setTimeout(function(){
        cb(1);
      }, Math.max(cncserver.control.commandDuration, 0));
    }
  };

  /**
   * Util function to buffer the "wiggle" movement for WaterColorBot Tool
   * changes. TODO: Replace this with a real API for tool changes.
   *
   * @param {string} axis
   *   Which axis to move along. Either 'xy' or 'y'
   * @param {integer} travel
   *   How much to move during the wiggle.
   * @param {integer} iterations
   *   How many times to move.
   */
  cncserver.control.wigglePen = function(axis, travel, iterations){
    var start = {x: Number(cncserver.pen.x), y: Number(cncserver.pen.y)};
    var i = 0;
    travel = Number(travel); // Make sure it's not a string

    // Start the wiggle!
    _wiggleSlave(true);

    function _wiggleSlave(toggle){
      var point = {x: start.x, y: start.y};

      if (axis === 'xy') {
        var rot = i % 4; // Ensure rot is always 0-3

        // This convoluted series ensure the wiggle moves in a proper diamond
        if (rot % 3) { // Results in F, T, T, F
          if (toggle) {
            point.y+= travel/2; // Down
          } else {
            point.x-= travel; // Left
          }
        } else {
           if (toggle) {
             point.y-= travel/2; // Up
           } else {
             point.x+= travel; // Right
           }
        }
      } else {
        point[axis]+= (toggle ? travel : travel * -1);
      }

      cncserver.control.movePenAbs(point);

      i++;

      if (i <= iterations){ // Wiggle again!
        _wiggleSlave(!toggle);
      } else { // Done wiggling, go back to start
        cncserver.control.movePenAbs(start);
      }
    }
  };

  // Exports...
  cncserver.exports.setPen = cncserver.control.setPen;
  cncserver.exports.setHeight = cncserver.control.setHeight;
  cncserver.exports.setTool = cncserver.control.setTool;
  cncserver.exports.movePenAbs = cncserver.control.movePenAbs;
};

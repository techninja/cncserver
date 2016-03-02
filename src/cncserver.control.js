"use strict";

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
    if (typeof inPen.simulation != "undefined") {

      // No change
      if (inPen.simulation === cncserver.pen.simulation) {
        callback(true);
        return;
      }

      if (inPen.simulation === '0') { // Attempt to connect to serial
        connectSerial({complete: callback});
      } else {  // Turn off serial!
        // TODO: Actually nullify connection.. no use case worth it yet
        simulationModeInit();
      }

      return;
    }


    // State/z position has been passed
    if (typeof inPen.state != "undefined") {
      // Disallow actual cncserver.pen setting when off canvas (unless skipping buffer)
      if (!cncserver.pen.offCanvas || inPen.skipBuffer) {
        setHeight(inPen.state, callback, inPen.skipBuffer);
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
      if (isNaN(inPen.x) || isNaN(inPen.y) || !isFinite(inPen.x) || !isFinite(inPen.y)) {
        callback(false);
        return;
      }

      // Convert the percentage values into real absolute and appropriate values
      var absInput = centToSteps(inPen);
      absInput.limit = 'workArea';

      // Are we parking?
      if (inPen.park) {
        // Don't repark if already parked (but not if we're skipping the buffer)
        var park = centToSteps(cncserver.bot.park, true);
        if (cncserver.pen.x === park.x && cncserver.pen.y === park.y && !inPen.skipBuffer) {
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
        inPen.ignoreTimeout = parseInt(inPen.ignoreTimeout) === 1 ? true : false;
      }

      movePenAbs(absInput, callback, inPen.ignoreTimeout, inPen.skipBuffer);
      return;
    }

    if (callback) callback(cncserver.pen);
  }


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
  exports.setHeight = setHeight;
  cncserver.setHeight = setHeight;
  function setHeight(state, callback, skipBuffer) {
    var stateValue = null; // Placeholder for what to normalize the pen state to
    var height = 0; // Placeholder for servo height value
    var servoDuration = cncserver.botConf.get('servo:duration');

    // Convert the incoming state
    var conv = stateToHeight(state);
      height = conv.height;
      stateValue = conv.state;

    // If we're skipping the buffer, just set the height directly
    if (skipBuffer) {
      console.log('Skipping buffer to set height:', height);
      actuallyMoveHeight(height, stateValue, callback);
      return;
    }

    // Pro-rate the duration depending on amount of change from current to tip of buffer
    if (cncserver.pen.height) {
      var range = parseInt(cncserver.botConf.get('servo:max')) - parseInt(cncserver.botConf.get('servo:min'));
      servoDuration = Math.round((Math.abs(height - cncserver.pen.height) / range) * servoDuration)+1;
    }

    // Actually set tip of buffer to given sanitized state & servo height.
    cncserver.pen.height = height;
    cncserver.pen.state = stateValue;

    // Run the height into the command buffer
    run('height', height, servoDuration);

    // Height movement callback servo movement duration offset
    if (callback) {
      setTimeout(function(){
        callback(1);
      }, Math.max(servoDuration - cncserver.gConf.get('bufferLatencyOffset'), 0));
    }
  }

  /**
   * Perform conversion from named/0-1 number state value to given pen height
   * suitable for outputting to a Z axis control statement.
   *
   * @param state
   * @returns {object}
   *   Object containing normalized state, and numeric height value. As:
   *   {state: [integer|string], height: [float]}
   */
  cncserver.stateToHeight = stateToHeight;
  function stateToHeight(state) {
    // Whether to use the full min/max range (used for named presets only)
    var fullRange = false;
    var min = parseInt(cncserver.botConf.get('servo:min'));
    var max = parseInt(cncserver.botConf.get('servo:max'));
    var range = max - min;
    var normalizedState = state; // Normalize/sanitize the incoming state

    var presets = cncserver.botConf.get('servo:presets');
    var height = 0; // Placeholder for height output

    // Validate Height, and conform to a bottom to top based percentage 0 to 100
    if (isNaN(parseInt(state))){ // Textual position!
      if (typeof presets[state] !== 'undefined') {
        height = parseFloat(presets[state]);
      } else { // Textual expression not found, default to UP
        height = presets.up;
        normalizedState = 'up';
      }

      fullRange = true;
    } else { // Numerical position (0 to 1), moves between up (0) and draw (1)
      height = Math.abs(parseFloat(state));
      height = height > 1 ?  1 : height; // Limit to 1
      normalizedState = height;

      // Reverse value and lock to 0 to 100 percentage with 1 decimal place
      height = parseInt((1 - height) * 1000) / 10;
    }

    // Lower the range when using 0 to 1 values to between up and draw
    if (!fullRange) {
      min = ((presets.draw / 100) * range) + min;
      max = ((presets.up / 100) * range) + parseInt(cncserver.botConf.get('servo:min'));

      range = max - min;
    }

    // Sanity check incoming height value to 0 to 100
    height = height > 100 ? 100 : height;
    height = height < 0 ? 0 : height;

    // Calculate the final servo value from percentage
    height = Math.round(((height / 100) * range) + min);
    return {height: height, state: normalizedState};
  }


  /**
   * Run the operation to set the current tool (and any aggregate operations
   * required) into the buffer
   *
   * @param toolName
   *   The machine name of the tool (as defined in the bot config file).
   * @param callback
   *   Triggered when the full tool change is to have been completed, or on
   *   failure.
   * @returns {boolean}
   *   True if success, false if failuer
   */
  exports.setTool = setTool;
  cncserver.setTool = setTool;
  function setTool(toolName, callback, ignoreTimeout) {
    var tool = cncserver.botConf.get('tools:' + toolName);

    // No tool found with that name? Augh! Run AWAY!
    if (!tool) {
      if (callback) run('callback', callback);
      return false;
    }

    if (cncserver.gConf.get('debug')) console.log('Changing to tool: ' + toolName);

    // Set the height based on what kind of tool it is
    // TODO: fold this into bot specific tool change logic
    var downHeight = toolName.indexOf('water') !== -1 ? 'wash' : 'draw';

    // Pen Up
    setHeight('up');

    // Move to the tool
    movePenAbs(tool);

    // "wait" tools need user feedback to let cncserver know that it can continue
    if (typeof tool.wait !== "undefined") {

      if (callback){
        run('callback', callback);
      }

      // Pause or resume continued execution based on tool.wait value
      // In theory: a wait tool has a complementary resume tool to bring it back
      if (tool.wait) {
        bufferPaused = true;
      } else {
        bufferPaused = false;
        executeNext();
      }

      sendBufferVars();
    } else { // "Standard" WaterColorBot toolchange

      // Pen down
      setHeight(downHeight);

      // Wiggle the brush a bit
      wigglePen(tool.wiggleAxis, tool.wiggleTravel, tool.wiggleIterations);

      // Put the pen back up when done!
      setHeight('up');

      // If there's a callback to run...
      if (callback){
        if (!ignoreTimeout) { // Run inside the buffer
          run('callback', callback);
        } else { // Run as soon as items have been buffered
          callback(1);
        }
      }
      return true;
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
   * @param {boolean} skipBuffer
   *    Set to true to skip adding to the buffer, simplifying this function
   *    down to just a sanity checker.
   * @returns {number}
   *   Distance moved from previous position, in steps.
   */
  cncserver.control.movePenAbs = function(inPoint, callback, immediate, skipBuffer) {
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
        offCanvasChange(false);
      }
    }

    sanityCheckAbsoluteCoord(point); // Ensure values don't go off the rails

    // If we're skipping the buffer, just move to the point
    // Pen stays put as last point set in buffer
    if (skipBuffer) {
      console.log('Skipping buffer for:', point);
      actuallyMove(point, callback);
      return 0; // Don't return any distance for buffer skipped movements
    }

    // Calculate change from end of buffer pen position
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
    var distance = getVectorLength(change);
    var duration = getDurationFromDistance(distance);

    // Only if we actually moved anywhere should we queue a movement
    if (distance !== 0) {
      // Set the tip of buffer pen at new position
      cncserver.pen.x = point.x;
      cncserver.pen.y = point.y;

      // Adjust the distance counter based on movement amount, not if we're off
      // the canvas though.
      if (cncserver.penDown() && !cncserver.pen.offCanvas && cncserver.bot.inWorkArea(point)) {
        cncserver.pen.distanceCounter = parseFloat(Number(distance) + Number(cncserver.pen.distanceCounter));
      }

      // Queue the final absolute move (serial command generated later)
      run('move', {x: cncserver.pen.x, y: cncserver.pen.y}, duration);
    }

    // Required start offCanvas change -after- movement has been queued
    if (startOffCanvasChange) {
      offCanvasChange(true);
    }

    if (callback) {
      if (immediate === true) {
        callback(cncserver.pen);
      } else {
        // Set the timeout to occur sooner so the next command will execute
        // before the other is actually complete. This will push into the buffer
        // and allow for far smoother move runs.

        var cmdDuration = Math.max(duration - cncserver.gConf.get('bufferLatencyOffset'), 0);

        if (cmdDuration < 2) {
          callback(cncserver.pen);
        } else {
          setTimeout(function(){callback(cncserver.pen);}, cmdDuration);
        }

      }
    }

    return distance;
  }

  /**
   * Triggered when the pen is requested to move across the bounds of the draw
   * area (either in or out).
   *
   * @param {boolean} newValue
   *   Pass true when moving "off screen", false when moving back into bounds
   */
  cncserver.controloffCanvasChange = function (newValue) {
    // Only do anything if the value is different
    if (cncserver.pen.offCanvas !== newValue) {
      cncserver.pen.offCanvas = newValue;
      if (cncserver.pen.offCanvas) { // Pen is now off screen/out of bounds
        if (cncserver.penDown()) {
          // Don't draw stuff while out of bounds (also, don't change the current
          // known state so we can come back to it when we return to bounds),
          // but DO change the buffer tip height so that is reflected on actualPen
          // if it's every copied over on buffer execution.
          cncserver.pen.height = cncserver.stateToHeight('up').height;
          cncserver.run('callback', function() {
            exports.setHeight('up', false, true);
          });
        }
      } else { // Pen is now back in bounds
        // Set the state regardless of actual change
        var back = cncserver.pen.state;
        console.log('Go back to:', back);

        // Assume starting from up state & height (ensures correct timing)
        cncserver.pen.state = "up";
        cncserver.pen.height = cncserver.stateToHeight('up').height;
        exports.setHeight(back);
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
   */
  cncserver.control.actuallyMove = function(destination, callback) {
    // Get the amount of change/duration from difference between actualPen and
    // absolute position in given destination
    var change = getPosChangeData(cncserver.actualPen, destination);
    commandDuration = Math.max(change.d, 0);

    // Pass along the correct duration and new position through to actualPen
    cncserver.actualPen.lastDuration = change.d - cncserver.gConf.get('bufferLatencyOffset');
    cncserver.actualPen.x = destination.x;
    cncserver.actualPen.y = destination.y;

    // Trigger an update for pen position
    sendPenUpdate();

    serialCommand(cmdstr('movexy', change)); // Send the actual X, Y and Duration

    // Delayed callback (if used)
    if (callback) {
      setTimeout(function(){
        callback(1);
      }, Math.max(commandDuration - cncserver.gConf.get('bufferLatencyOffset'), 0));
    }
  };

  /**
   * Run to the buffer direct low level setup commands (for EiBotBoard only).
   *
   * @param {integer} id
   *   Numeric ID of EBB setting to change the value of
   * @param {integer} value
   *   Value to set to
   */
  exports.sendSetup = sendSetup;
  cncserver.control.sendSetup = function(id, value) {
    // TODO: Make this WCB specific, or refactor to be general
    run('custom', 'SC,' + id + ',' + value);
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
   * @param {function} callback
   *   Optional, callback for when operation should have completed.
   */
  function actuallyMoveHeight(height, stateValue, callback) {
    var sd = cncserver.botConf.get('servo:duration');

    // Get the amount of change from difference between actualPen and absolute
    // height position, pro-rating the duration depending on amount of change
    if (cncserver.actualPen.height) {
      var range = parseInt(cncserver.botConf.get('servo:max')) - parseInt(cncserver.botConf.get('servo:min'));
      commandDuration = Math.round((Math.abs(height - cncserver.actualPen.height) / range) * sd) + 1;
    }

    // Pass along the correct height position through to actualPen
    if (typeof stateValue !== 'undefined') cncserver.actualPen.state = stateValue;
    cncserver.actualPen.height = height;
    cncserver.actualPen.lastDuration = commandDuration;

    // Trigger an update for pen position
    sendPenUpdate();

    // Set the pen up position (EBB)
    serialCommand(cmdstr('movez', {z: height}));

    // If there's a togglez, run it after setting Z
    if (cncserver.bot.commands.togglez) {
      serialCommand(cmdstr('togglez', {t: cncserver.gConf.get('flipZToggleBit') ? 1 : 0}));
    }

    // Force cncserver.bot to wait
    serialCommand(cmdstr('wait', {d: commandDuration}));

    // Delayed callback (if used)
    if (callback) {
      setTimeout(function(){
        callback(1);
      }, Math.max(commandDuration - cncserver.gConf.get('bufferLatencyOffset'), 0));
    }
  }

  /**
   * Util function to buffer the "wiggle" movement for WaterColorBot Tool
   * changes. TODO: Replace this with a real API for tool changes.
   *
   * @param {string} axis
   *   Which axis to move along. Either 'xy' or 'y'
   * @param travel
   *   How much to move during the wiggle.
   * @param iterations
   *   How many times to move.
   */
  function wigglePen(axis, travel, iterations){
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

      movePenAbs(point);

      i++;

      if (i <= iterations){ // Wiggle again!
        _wiggleSlave(!toggle);
      } else { // Done wiggling, go back to start
        movePenAbs(start);
      }
    }
  }

  // Exports...
  cncserver.exports.setPen = cncserver.control.setPen;
};

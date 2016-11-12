"use strict";

/**
 * @file Abstraction module for generic util helper functions for CNC Server!
 */

module.exports = function(cncserver) {
  var crypto = require('crypto');       // Crypto library for hashing.

  cncserver.utils = {
    extend: require('util')._extend      // Util for cloning objects
  };

  /**
   * Sanity check a given coordinate within the absolute area.
   * @param  {object} point
   *   The point to be checked and operated on by reference.
   *
   * @return {null}
   */
  cncserver.utils.sanityCheckAbsoluteCoord = function(point) {
    var maxArea = cncserver.bot.maxArea;
    point.x = point.x > maxArea.width ? maxArea.width : point.x;
    point.y = point.y > maxArea.height ? maxArea.height : point.y;
    point.x = point.x < 0 ? 0 : point.x;
    point.y = point.y < 0 ? 0 : point.y;
  };


  /**
   * Create has using passed data (and current time).
   *
   * @param  {mixed} data
   *   Data to be hashed, either an object or array.
   *
   * @return {string}
   *   16 char hash of data and current time in ms.
   */
  var hashSequence = 0;
  cncserver.utils.getHash = function(data) {
    var md5sum = crypto.createHash('md5');
    md5sum.update(JSON.stringify(data) + hashSequence);
    hashSequence++;
    return md5sum.digest('hex').substr(0, 16);
  };

  /**
   * Calculate the duration for a pen movement from the distance.
   * Takes into account whether pen is up or down
   *
   * @param {float} distance
   *   Distance in steps that we'll be moving
   * @param {int} min
   *   Optional minimum value for output duration, defaults to 1.
   * @param {object} inPen
   *   Incoming pen object to check (buffer tip or bot current).
   * @returns {number}
   *   Millisecond duration of how long the move should take
   */
  cncserver.utils.getDurationFromDistance = function(distance, min, inPen) {
    if (typeof min === "undefined") min = 1;

    var minSpeed = parseFloat(cncserver.botConf.get('speed:min'));
    var maxSpeed = parseFloat(cncserver.botConf.get('speed:max'));
    var drawingSpeed = cncserver.botConf.get('speed:drawing');
    var movingSpeed = cncserver.botConf.get('speed:moving');

    // Use given speed over distance to calculate duration
    var speed = (cncserver.utils.penDown(inPen)) ? drawingSpeed : movingSpeed;
    speed = parseFloat(speed) / 100;

    // Convert to steps from percentage
    speed = (speed * (maxSpeed - minSpeed)) + minSpeed;

    // Sanity check speed value
    speed = speed > maxSpeed ? maxSpeed : speed;
    speed = speed < minSpeed ? minSpeed : speed;

    // How many steps a second?
    return Math.max(Math.abs(Math.round(distance / speed * 1000)), min);
  };

  /**
   * Given two points, find the difference and duration at current speed
   *
   * @param {{x: number, y: number}} src
   *   Source position coordinate (in steps).
   * @param {{x: number, y: number}} dest
   *   Destination position coordinate (in steps).
   *
   * @returns {{d: number, x: number, y: number}}
   *   Object containing the change amount in steps for x & y, along with the
   *   duration in milliseconds.
   */
  cncserver.utils.getPosChangeData = function(src, dest) {
     var change = {
      x: Math.round(dest.x - src.x),
      y: Math.round(dest.y - src.y)
    };

    // Calculate distance
    var duration = cncserver.utils.getDurationFromDistance(
      cncserver.utils.getVectorLength(change),
      1,
      src
    );

    // Adjust change direction/inversion
    if (cncserver.botConf.get('controller').position === "relative") {
      // Invert X or Y to match stepper direction
      change.x = cncserver.gConf.get('invertAxis:x') ? change.x * -1 : change.x;
      change.y = cncserver.gConf.get('invertAxis:y') ? change.y * -1 : change.y;
    } else { // Absolute! Just use the "new" absolute X & Y locations
      change.x = cncserver.pen.x;
      change.y = cncserver.pen.y;
    }

    // Swap motor positions
    if (cncserver.gConf.get('swapMotors')) {
      change = {
        x: change.y,
        y: change.x
      };
    }

    return {d: duration, x: change.x, y: change.y};
  };

  /**
   * Given two height positions, find the difference and pro-rate duration.
   *
   * @param {integer} src
   *   Source position.
   * @param {integer} dest
   *   Destination position.
   *
   * @returns {{d: number, a: number}}
   *   Object containing the change amount in steps for x & y, along with the
   *   duration in milliseconds.
   */
  cncserver.utils.getHeightChangeData = function(src, dest) {
    var sd = cncserver.botConf.get('servo:duration');

    // Get the amount of change from difference between actualPen and absolute
    // height position, pro-rating the duration depending on amount of change
    var range = parseInt(cncserver.botConf.get('servo:max'), 10) -
      parseInt(cncserver.botConf.get('servo:min'));

    var duration = Math.round((Math.abs(dest - src) / range) * sd);

    return {d: duration, a: dest - src};
  };

  /**
   * Helper abstraction for checking if the tip of buffer pen is "down" or not.
   *
   * @param {object} inPen
   *   The pen object to check for donw status, defaults to buffer tip.
   * @returns {Boolean}
   *   False if pen is considered up, true if pen is considered down.
   */
  cncserver.utils.penDown = function(inPen) {
    if (!inPen || !inPen.state) inPen = cncserver.pen;

    if (inPen.state === 'up' || inPen.state < 0.5) {
      return false;
    } else {
      return true;
    }
  };


  /**
   * Convert percent of total area coordinates into absolute step coordinate
   * values
   * @param {{x: number, y: number}} point
   *   Coordinate (measured in steps) to be converted.
   * @param {boolean} inMaxArea
   *   Pass "true" if percent vals should be considered within the maximum area
   *   otherwise steps will be calculated as part of the global work area.
   *
   * @returns {{x: number, y: number}}
   *   Converted coordinate in steps.
   */
  cncserver.utils.centToSteps = function(point, inMaxArea) {
    var bot = cncserver.bot;
    if (!inMaxArea) { // Calculate based on workArea
      return {
        x: bot.workArea.left + ((point.x / 100) * bot.workArea.width),
        y: bot.workArea.top + ((point.y / 100) * bot.workArea.height)
      };
    } else { // Calculate based on ALL area
      return {
        x: (point.x / 100) * bot.maxArea.width,
        y: (point.y / 100) * bot.maxArea.height
      };
    }
  };


  /**
   * Get the distance/length of the given vector coordinate
   *
   * @param {{x: number, y: number}} vector
   *   Object representing coordinate away from (0,0)
   * @returns {number}
   *   Length (in steps) of the given vector point
   */
  cncserver.utils.getVectorLength = function(vector) {
    return Math.sqrt( Math.pow(vector.x, 2) + Math.pow(vector.y, 2));
  };

  /**
   * Perform conversion from named/0-1 number state value to given pen height
   * suitable for outputting to a Z axis control statement.
   *
   * @param {string/integer} state
   *
   * @returns {object}
   *   Object containing normalized state, and numeric height value. As:
   *   {state: [integer|string], height: [float]}
   */
  cncserver.utils.stateToHeight = function(state) {
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
      max = ((presets.up / 100) * range);
      max+= parseInt(cncserver.botConf.get('servo:min'));

      range = max - min;
    }

    // Sanity check incoming height value to 0 to 100
    height = height > 100 ? 100 : height;
    height = height < 0 ? 0 : height;

    // Calculate the final servo value from percentage
    height = Math.round(((height / 100) * range) + min);
    return {height: height, state: normalizedState};
  };

};

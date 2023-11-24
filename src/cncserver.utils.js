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
    cncserver.utils.constrainPoint(point, {
      left: 0,
      right: maxArea.width,
      top: 0,
      bottom: maxArea.height
    });
  };

  /**
   * Constrain a given point to the given bounds
   * @param {{x: number, y: number}} point
   *   The point to be checked and possibly modified.
   * @param {{
   *   top: number,
   *   right: number,
   *   bottom: number,
   *   left: number
   * }} bounds
   *   The bounds to constrain the point to.
   */
    cncserver.utils.constrainPoint = function(point, bounds) {
      point.x = Math.max(point.x, bounds.left);
      point.x = Math.min(point.x, bounds.right);
      point.y = Math.max(point.y, bounds.top);
      point.y = Math.min(point.y, bounds.bottom);
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
   * @param {object} inPen
   *   Incoming pen object to check (buffer tip or bot current).
   * @returns {number}
   *   Millisecond duration of how long the move should take
   */
  cncserver.utils.getDurationFromDistance = function(distance, inPen) {
    const min = 1;

    const minSpeed = parseFloat(cncserver.botConf.get('speed:min'));
    const maxSpeed = parseFloat(cncserver.botConf.get('speed:max'));
    const drawingSpeed = cncserver.botConf.get('speed:drawing');
    const movingSpeed = cncserver.botConf.get('speed:moving');

    // Use given speed over distance to calculate duration
    let speed = (cncserver.utils.penDown(inPen)) ? drawingSpeed : movingSpeed;
    speed = parseFloat(speed) / 100;

    // Convert to steps from percentage
    speed = (speed * (maxSpeed - minSpeed)) + minSpeed;

    // Sanity check speed value
    speed = speed > maxSpeed ? maxSpeed : speed;
    speed = speed < minSpeed ? minSpeed : speed;

    // Calculate duration in milliseconds
    return Math.max(Math.abs(Math.round(distance / speed * 1000)), min);
  };

  /**
   * Given the a pen and a destination, compute the duration, and distance of
   * the movement, along with the change and destination updated to avoid
   * impossibly slow axis speeds
   *
   * @param {object} inPen
   *   Incoming pen object to check (buffer tip or bot current).
   * @param {{x: number, y: number}} dest
   *   Destination position coordinate (in steps).
   *
   * @returns {{
   *   duration: number,
   *   distance: number,
   *   change: {x: number, y: number}},
   *   destination: {x: number, y: number}},
   * }}
   *   Object containining data secribing the movement, after adjustments to
   *   avoid impossibly slow axis speeds
   */
  cncserver.utils.getMovementData = function(inPen, dest) {
    const change = {
      x: Math.round(dest.x - inPen.x),
      y: Math.round(dest.y - inPen.y)
    };

    const distance = cncserver.utils.getVectorLength(change);
    const duration = cncserver.utils.getDurationFromDistance(distance, inPen);

    cncserver.utils.sanityCheckMovement(change, duration);

    const destination = {
      x: Math.round(inPen.x + change.x),
      y: Math.round(inPen.y + change.y)
    }

    return {duration, distance, change, destination};
  }

  /**
   * Given the a pen and a destination, find the difference and duration at
   * current speed, as needed to render our move command
   *
   * @param {object} inPen
   *   Incoming pen object to check (buffer tip or bot current).
   * @param {{x: number, y: number}} dest
   *   Destination position coordinate (in steps).
   *
   * @returns {{d: number, x: number, y: number}}
   *   Object containing the change amount in steps for x & y, along with the
   *   duration in milliseconds.
   */
  cncserver.utils.getMoveCommandData = function(inPen, dest) {
     let change = {
      x: Math.round(dest.x - inPen.x),
      y: Math.round(dest.y - inPen.y)
    };

    // Calculate duration
    const distance = cncserver.utils.getVectorLength(change);
    const duration = cncserver.utils.getDurationFromDistance(distance, inPen);

    // Adjust change direction/inversion
    if (cncserver.botConf.get('controller').position === "relative") {
      // Invert X or Y to match stepper direction
      change.x = cncserver.gConf.get('invertAxis:x') ? change.x * -1 : change.x;
      change.y = cncserver.gConf.get('invertAxis:y') ? change.y * -1 : change.y;
    } else { // Absolute! Just use the "new" absolute X & Y locations
      change.x = dest.x;
      change.y = dest.y;
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
   * Given the a change and a duration, upate the change (if neccessary) to
   * avoid falling below the minimum number of steps per second for each axis.
   *
   * @param {{x: number, y: number}} change
   *   The movement to sanitize.
   * @param {number} duration
   *   The duration of the movement in seconds.
   */
  cncserver.utils.sanityCheckMovement = function(change, duration) {
    const axes = cncserver.botConf.get('controller').axes;
    const axisMin = parseFloat(cncserver.botConf.get('speed:axisMin'));

    const orthogonal = axes === 'orthogonal';

    const minStepsPerAxis = Math.floor(duration * axisMin / 1000);

    let changeA = orthogonal ? change.x : change.x + change.y;
    let changeB = orthogonal ? change.y : change.x - change.y;
    
    // Where change in a given axis is too slow, we set the change on that axis
    // to zero, and treat this as 'close enough' to the movement requested by
    // the user
    if (changeA !== 0 && Math.abs(changeA) <= minStepsPerAxis) {
      changeA = 0;
    }

    if (changeB !== 0 && Math.abs(changeB) <= minStepsPerAxis) {
      changeB = 0;
    }

    change.x = orthogonal ? changeA : Math.round((changeA + changeB) / 2);
    change.y = orthogonal ? changeB : Math.round((changeA - changeB) / 2);
  }

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

    var duration = Math.max(1, Math.round((Math.abs(dest - src) / range) * sd));

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

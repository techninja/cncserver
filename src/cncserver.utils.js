"use strict";

/**
 * @file Abstraction module for generic util helper functions for CNC Server!
 */

module.exports = function(cncserver) {
  cncserver.utils = {};

  /**
   * Sanity check a given coordinate within the absolute area.
   * @param  {object} point
   *   The point to be checked and operated on by reference.
   *
   * @return {null}
   */
  cncserver.utils.sanityCheckAbsoluteCoord = function(point) {
    point.x = point.x > cncserver.bot.maxArea.width ? cncserver.bot.maxArea.width : point.x;
    point.y = point.y > cncserver.bot.maxArea.height ? cncserver.bot.maxArea.height : point.y;
    point.x = point.x < 0 ? 0 : point.x;
    point.y = point.y < 0 ? 0 : point.y;
  }

  /**
   * Calculate the duration for a pen movement from the number of steps distance,
   * takes into account whether pen is up or down
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

    // Use given speed over distance to calculate duration
    var speed = (cncserver.penDown(inPen)) ? cncserver.botConf.get('speed:drawing') : cncserver.botConf.get('speed:moving');
    speed = parseFloat(speed) / 100;
    speed = speed * ((maxSpeed - minSpeed) + minSpeed); // Convert to steps from percentage

    // Sanity check speed value
    speed = speed > maxSpeed ? maxSpeed : speed;
    speed = speed < minSpeed ? minSpeed : speed;
    return Math.max(Math.abs(Math.round(distance / speed * 1000)), min); // How many steps a second?
  }

  /**
   * Given two points, find the difference and duration at current speed
   *
   * @param {{x: number, y: number}} src
   *   Source position coordinate (in steps).
   * @param {{x: number, y: number}} dest
   *   Destination position coordinate (in steps).
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
   * Helper abstraction for checking if the tip of buffer pen is "down" or not.
   *
   * @param {object} inPen
   *   The pen object to check for donw status, defaults to buffer tip.
   * @returns {Boolean}
   *   False if pen is considered up, true if pen is considered down.
   */
  cncserver.utils.penDown = function(inPen) {
    if (!inPen) inPen = cncserver.pen;

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
  }


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
  }
}

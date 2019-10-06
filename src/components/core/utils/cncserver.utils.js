/**
 * @file Abstraction module for generic util helper functions for CNC Server!
 */
const crypto = require('crypto'); // Crypto library for hashing.
const extend = require('util')._extend; // Util for cloning objects

const utils = { extend }; // Final Object to be exported.

module.exports = (cncserver) => {
  /**
   * Sanity check a given coordinate within the absolute area.
   * @param  {object} point
   *   The point to be checked and operated on by reference.
   *    // TODO: It's an antipattern to operate by ref, refactor.
   * @return {null}
   */
  utils.sanityCheckAbsoluteCoord = ({ x, y }) => {
    const { maxArea } = cncserver.settings.bot;
    return {
      x: Math.max(0, x > maxArea.width ? maxArea.width : x),
      y: Math.max(0, y > maxArea.height ? maxArea.height : y),
    };
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
  let hashSequence = 0;
  utils.getHash = (data) => {
    const md5sum = crypto.createHash('md5');
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
   * @param {number} speedOverride
   *   Optional speed override, overrides calculated speed percent.
   *
   * @returns {number}
   *   Millisecond duration of how long the move should take
   */
  utils.getDurationFromDistance = (distance, min = 1, inPen, speedOverride = null) => {
    const minSpeed = parseFloat(cncserver.settings.botConf.get('speed:min'));
    const maxSpeed = parseFloat(cncserver.settings.botConf.get('speed:max'));
    const drawingSpeed = cncserver.settings.botConf.get('speed:drawing');
    const movingSpeed = cncserver.settings.botConf.get('speed:moving');

    // Use given speed over distance to calculate duration
    let speed = (utils.penDown(inPen)) ? drawingSpeed : movingSpeed;
    if (speedOverride != null) {
      speed = speedOverride;
    }

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
   * @param {number} speed
   *   Speed override for this movement in percent.
   *
   * @returns {{d: number, x: number, y: number}}
   *   Object containing the change amount in steps for x & y, along with the
   *   duration in milliseconds.
   */
  utils.getPosChangeData = (src, dest, speed = null) => {
    let change = {
      x: Math.round(dest.x - src.x),
      y: Math.round(dest.y - src.y),
    };

    // Calculate distance
    const duration = utils.getDurationFromDistance(
      utils.getVectorLength(change),
      1,
      src,
      speed
    );

    // Adjust change direction/inversion
    if (cncserver.settings.botConf.get('controller').position === 'relative') {
      // Invert X or Y to match stepper direction
      change.x = cncserver.settings.gConf.get('invertAxis:x') ? change.x * -1 : change.x;
      change.y = cncserver.settings.gConf.get('invertAxis:y') ? change.y * -1 : change.y;
    } else { // Absolute! Just use the "new" absolute X & Y locations
      change.x = cncserver.pen.state.x;
      change.y = cncserver.pen.state.y;
    }

    // Swap motor positions
    if (cncserver.settings.gConf.get('swapMotors')) {
      change = {
        x: change.y,
        y: change.x,
      };
    }

    return { d: duration, x: change.x, y: change.y };
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
  utils.getHeightChangeData = (src, dest) => {
    const sd = cncserver.settings.botConf.get('servo:duration');

    // Get the amount of change from difference between actualPen and absolute
    // height position, pro-rating the duration depending on amount of change
    const range = parseInt(cncserver.settings.botConf.get('servo:max'), 10)
      - parseInt(cncserver.settings.botConf.get('servo:min'), 10);

    const duration = Math.max(1, Math.round((Math.abs(dest - src) / range) * sd));

    return { d: duration, a: dest - src };
  };

  /**
   * Helper abstraction for checking if the tip of buffer pen is "down" or not.
   *
   * @param {object} inPen
   *   The pen object to check for down status, defaults to buffer tip.
   * @returns {Boolean}
   *   False if pen is considered up, true if pen is considered down.
   */
  utils.penDown = (inPen) => {
    // TODO: Refactor to ensure no modification by reference/intent.
    if (!inPen || !inPen.state) inPen = cncserver.pen.state;

    if (inPen.state === 'up' || inPen.state < 0.5) {
      return false;
    }

    return true;
  };

  /**
   * Convert an incoming pen object absolute step coordinate values.
   *
   * @param {{x: number, y: number, abs: [in|mm]}} pen
   *   Pen/Coordinate measured in percentage of total draw area, or absolute
   *   distance to be converted to steps.
   *
   * @returns {{x: number, y: number}}
   *   Converted coordinate in absolute steps.
   */
  utils.inPenToSteps = (inPen) => {
    if (inPen.abs === 'in' || inPen.abs === 'mm') {
      return utils.absToSteps({ x: inPen.x, y: inPen.y }, inPen.abs);
    }

    return utils.centToSteps({ x: inPen.x, y: inPen.y });
  };

  /**
   * Convert an absolute point object to absolute step coordinate values.
   *
   * @param {{x: number, y: number, abs: [in|mm]}} point
   *   Coordinate measured in percentage of total draw area, or absolute
   *   distance to be converted to steps.
   * @param {string} scale
   *   Either 'in' for inches, or 'mm' for millimeters.
   * @param {boolean} inMaxArea
   *   Pass "true" if percent vals should be considered within the maximum area
   *   otherwise steps will be calculated as part of the global work area.
   *
   * @returns {{x: number, y: number}}
   *   Converted coordinate in absolute steps.
   */
  utils.absToSteps = (point, scale, inMaxArea) => {
    const { settings: { bot } } = cncserver;

    // TODO: Don't operate by reference (intionally or otherwise), refactor.
    // ALSO move '25.4' value to config.
    // Convert Inches to MM.
    if (scale === 'in') {
      point = { x: point.x * 25.4, y: point.y * 25.4 };
    }

    // Return absolute calculation.
    return {
      x: (!inMaxArea ? bot.workArea.left : 0) + (point.x * bot.stepsPerMM.x),
      y: (!inMaxArea ? bot.workArea.top : 0) + (point.y * bot.stepsPerMM.y),
    };
  };

  /**
   * Convert an absolute step coordinate to absolute point object.
   *
   * @param {{x: number, y: number}} point
   *   Coordinate measured in steps to be converted to absolute in scale.
   * @param {string} scale
   *   Either 'in' for inches, or 'mm' for millimeters.
   *
   * @returns {{x: number, y: number}}
   *   Converted coordinate in absolute steps.
   */
  utils.stepsToAbs = (point, scale) => {
    const { settings: { bot } } = cncserver;

    // Setup output, less workarea boundaries, divided by mm per step.
    let out = {
      x: (point.x - bot.workArea.left) / bot.stepsPerMM.x,
      y: (point.y - bot.workArea.top) / bot.stepsPerMM.y,
    };

    if (scale === 'in') {
      out = { x: point.x / 25.4, y: point.y / 25.4 };
    }

    // Return absolute calculation.
    return out;
  };

  /**
   * Convert percent of total area coordinates into absolute step coordinates.
   *
   * @param {{x: number, y: number}} point
   *   Coordinate (measured in steps) to be converted.
   * @param {boolean} inMaxArea
   *   Pass "true" if percent vals should be considered within the maximum area
   *   otherwise steps will be calculated as part of the global work area.
   *
   * @returns {{x: number, y: number}}
   *   Converted coordinate in steps.
   */
  utils.centToSteps = (point, inMaxArea) => {
    const { bot } = cncserver.settings;
    if (!inMaxArea) { // Calculate based on workArea
      return {
        x: bot.workArea.left + ((point.x / 100) * bot.workArea.width),
        y: bot.workArea.top + ((point.y / 100) * bot.workArea.height),
      };
    }
    // Calculate based on ALL area
    return {
      x: (point.x / 100) * bot.maxArea.width,
      y: (point.y / 100) * bot.maxArea.height,
    };
  };

  /**
   * Get the distance/length of the given vector coordinate
   *
   * @param {{x: number, y: number}} vector
   *   Object representing coordinate away from (0,0)
   * @returns {number}
   *   Length (in steps) of the given vector point
   */
  utils.getVectorLength = vector => Math.sqrt((vector.x ** 2) + (vector.y ** 2));

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
  utils.stateToHeight = (state) => {
    // Whether to use the full min/max range (used for named presets only)
    let fullRange = false;
    let min = parseInt(cncserver.settings.botConf.get('servo:min'), 10);
    let max = parseInt(cncserver.settings.botConf.get('servo:max'), 10);
    let range = max - min;
    let normalizedState = state; // Normalize/sanitize the incoming state

    const presets = cncserver.settings.botConf.get('servo:presets');
    let height = 0; // Placeholder for height output

    // Validate Height, and conform to a bottom to top based percentage 0 to 100
    if (Number.isNaN(parseInt(state, 10))) { // Textual position!
      if (typeof presets[state] !== 'undefined') {
        height = parseFloat(presets[state]);
      } else { // Textual expression not found, default to UP
        height = presets.up;
        normalizedState = 'up';
      }

      fullRange = true;
    } else { // Numerical position (0 to 1), moves between up (0) and draw (1)
      height = Math.abs(parseFloat(state));
      height = height > 1 ? 1 : height; // Limit to 1
      normalizedState = height;

      // Reverse value and lock to 0 to 100 percentage with 1 decimal place
      height = parseInt((1 - height) * 1000, 10) / 10;
    }

    // Lower the range when using 0 to 1 values to between up and draw
    if (!fullRange) {
      min = ((presets.draw / 100) * range) + min;
      max = ((presets.up / 100) * range);
      max += parseInt(cncserver.settings.botConf.get('servo:min'), 10);

      range = max - min;
    }

    // Sanity check incoming height value to 0 to 100
    height = height > 100 ? 100 : height;
    height = height < 0 ? 0 : height;

    // Calculate the final servo value from percentage
    height = Math.round(((height / 100) * range) + min);
    return { height, state: normalizedState };
  };

  return utils;
};

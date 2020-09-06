/**
 * @file Abstraction module for generic util helper functions for CNC Server!
 */
const crypto = require('crypto'); // Crypto library for hashing.
const extend = require('util')._extend; // Util for cloning objects
const glob = require('glob');
const merge = require('merge-deep');

// File Utils.
const { homedir } = require('os');
const fs = require('fs');
const path = require('path');

const utils = { extend }; // Final Object to be exported.

module.exports = (cncserver) => {
  /**
   * Sanity check a given coordinate within the absolute area.
   * @param  {object} point
   *   The point in absolute steps to be checked and operated on by reference.
   *
   * @return {object}
   *   The final sanitized coordinate.
   */
  utils.sanityCheckAbsoluteCoord = ({ x, y }) => {
    const { maxArea } = cncserver.settings.bot;
    return {
      x: Math.round(Math.max(0, x > maxArea.width ? maxArea.width : x)),
      y: Math.round(Math.max(0, y > maxArea.height ? maxArea.height : y)),
    };
  };

  /**
   * Create a 16char hash using passed data (and a salt).
   *
   * @param  {mixed} data
   *   Data to be hashed, either an object or array.
   * @param  {string} salt
   *   Type of salt to adjust the hash with. Pass null to disable, otherwise:
   *     "increment" (default): will increment each has salt by 1, providing
   *       consecutive data similarty hash safety.
   *     "date": Inserts the ISO date as a salt.
   *
   * @return {string}
   *   16 char hash of data and current time in ms.
   */
  let hashSequence = 0;
  utils.getHash = (data, saltMethod = 'increment') => {
    const md5sum = crypto.createHash('md5');
    let salt = '';

    switch (saltMethod) {
      case 'increment':
        salt = hashSequence++;
        break;

      case 'date':
        salt = new Date().toISOString();
        break;

      default:
        break;
    }

    md5sum.update(`${JSON.stringify(data)}${salt}`);
    return md5sum.digest('hex').substr(0, 16);
  };

  /**
   * Get a named user content directory.
   *
   * @param {string} name
   *   The arbitrary name of the dir.
   *
   * @return {string}
   *   The full path of the writable path.
   */
  utils.getUserDir = (name) => {
    // Ensure we have the base user folder.
    const home = utils.getDir(path.resolve(homedir(), 'cncserver'));
    const botHome = utils.getDir(path.resolve(home, cncserver.settings.gConf.get('botType')));

    // Home base dir? or bot specific?
    if (['projects', 'colorsets', 'implements', 'toolsets'].includes(name)) {
      return utils.getDir(path.resolve(botHome, name));
    }
    return utils.getDir(path.resolve(home, name));
  };

  /**
   * Get an object of all JSON data in a given folder.
   *
   * @param {string} dir
   *   The full path of the directory to search in.
   *
   * @return {object}
   *   Object keyed on "name" of all items in dir. Empty object if invalid or no files.
   */
  utils.getJSONList = (dir) => {
    const out = {};

    if (fs.existsSync(dir)) {
      const files = glob.sync(path.join(dir, '*.json'));
      files.forEach((jsonPath) => {
        const data = utils.getJSONFile(jsonPath);
        if (data && data.name) {
          out[data.name] = data;
        }
      });
    }

    return out;
  };

  /**
   * Get JSON data from a file in a given folder. Null if problem.
   *
   * @param {string} file
   *   The full file path of the JSON file.
   *
   * @return {object}
   *   Data in file, null if not found or bad JSON.
   */
  utils.getJSONFile = (file) => {
    let data = null;

    if (fs.existsSync(file)) {
      try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        data = require(file);

        // Clean out metadata header here.
        // TODO: Validate header somehow?
        delete data._meta;
      } catch (error) {
        console.error(`Problem loading JSON file: '${file}'`, error);
      }
    }

    return data;
  };

  /**
   * Get an object of all JSON data in a given preset/custom folders.
   *
   * @param {string} name
   *   The name of the preset type.
   * @param {boolean} customOnly
   *   If true will only return custom presets.
   *
   * @return {object}
   *   Object keyed on "name" of all items.
   */
  utils.getPresets = (name, customOnly) => {
    const presetDir = path.join(__basedir, 'presets', name);
    const customDir = cncserver.utils.getUserDir(name);

    if (customOnly) {
      return utils.getJSONList(customDir);
    }
    return { ...utils.getJSONList(presetDir), ...utils.getJSONList(customDir) };
  };

  /**
   * Get the direct data of a preset/custom by type and machine name.
   *
   * @param {string} type
   *   The type of preset (folder).
   * @param {string} name
   *   The machine name of the preset (filename).
   * @param {boolean} customOnly
   *   If true, will not failover to read-only presets.
   *
   * @return {object}
   *   Raw data from the JSON file, null if there's a problem.
   */
  utils.getPreset = (type, name, customOnly) => {
    const presetPath = path.join(__basedir, 'presets', type, `${name}.json`);
    const customPath = path.join(cncserver.utils.getUserDir(type), `${name}.json`);

    if (customOnly) {
      return utils.getJSONFile(customPath);
    } else {
      if (fs.existsSync(customPath)) {
        return utils.getJSONFile(customPath);
      }
      return utils.getJSONFile(presetPath);
    }
  };

  /**
   * Save the data of a preset/custom by type and data.
   *
   * @param {string} type
   *   The type of preset (folder).
   * @param {string} data
   *   The data to save, with a required key "name" used as machine name.
   *
   * @return {object}
   *   Raw data from the JSON file, null if there's a problem.
   */
  utils.savePreset = (type, data) => {
    const customPath = path.join(cncserver.utils.getUserDir(type), `${data.name}.json`);
    // TODO: Pull version dynamically.
    const _meta = { cncserverVersion: '3.0.0-beta1', fileType: type };
    fs.writeFileSync(customPath, JSON.stringify({ _meta, ...data }, null, 2));
  };

  /**
   * Delete custom by type and name.
   *
   * @param {string} type
   *   The type of preset (folder).
   * @param {string} name
   *   The machine name of the preset.
   */
  utils.deletePreset = (type, name) => {
    const customPath = path.join(cncserver.utils.getUserDir(type), `${name}.json`);
    const trashPath = path.resolve(utils.getUserDir('trash'), `${type}-${name}.json`);
    // Try to rename to trash. If there's one existing, delete.
    try {
      if (fs.existsSync(trashPath)) fs.unlinkSync(trashPath);
      fs.renameSync(customPath, trashPath);
    } catch (error) {
      // Basically ignore errors for now.
      console.error(error);
    }
  };

  // String literal translation function to keep code line lengths down.
  utils.singleLineString = (strings, ...values) => {
    // Interweave the strings with the
    // substitution vars first.
    let output = '';
    for (let i = 0; i < values.length; i++) {
      output += strings[i] + values[i];
    }
    output += strings[values.length];

    // Split on newlines.
    const lines = output.split(/(?:\r\n|\n|\r)/);

    // Rip out the leading whitespace.
    return lines.map(line => line.replace(/^\s+/gm, '')).join(' ').trim();
  };

  /**
   * Validate that a directory at the given path exists.
   *
   * @param {string} dir
   *   The full path of the dir.
   *
   * @return {string}
   *   The full path dir, or an error is thrown if there's permission issues.
   */
  utils.getDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    return dir;
  };

  // Externalize Merge Deep:
  // @see https://github.com/jonschlinkert/merge-deep
  utils.merge = merge;

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
    const sd = cncserver.settings.botConf.get('servo:minduration');

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
   * Convert any string into a machine name.
   *
   * @param {string} string
   *   Object representing coordinate away from (0,0)
   * @returns {number}
   *   Length (in steps) of the given vector point
   */
  utils.getMachineName = (string = '', limit = 32) => string
    .replace(/[^A-Za-z0-9 ]/g, '') // Remove unwanted characters.
    .replace(/\s{2,}/g, ' ') // Replace multi spaces with a single space
    .replace(/\s/g, '-') // Replace space with a '-' symbol
    .toLowerCase() // Lowercase only.
    .substr(0, limit); // Limit

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

  utils.round = (number, precision) => {
    const p = 10 ** precision;
    return Math.round(number * p) / p;
  };

  utils.roundPoint = (point, precision = 2) => {
    if (Array.isArray(point)) {
      return [
        utils.round(point[0], precision),
        utils.round(point[1], precision),
      ];
    }

    return {
      x: utils.round(point.x, precision),
      y: utils.round(point.y, precision),
    };
  };

  // Wrap SVG string content with a header and footer.
  utils.wrapSVG = (content, size) => {
    const header = `<?xml version="1.0" encoding="utf-8"?>
    <svg version="1.1" baseProfile="full" xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}">`;
    return `${header}${content}</svg>`;
  };

  /**
   * Map a value in a given range to a new range.
   *
   * @param {number} x
   *   The input number to be mapped.
   * @param {number} inMin
   *   Expected minimum of the input number.
   * @param {number} inMax
   *   Expected maximum of the input number.
   * @param {number} outMin
   *   Expected minimum of the output map.
   * @param {number} outMax
   *   Expected maximum of the output map.
   *
   * @return {number}
   *   The output number after mapping.
   */
  utils.map = (x, inMin, inMax, outMin, outMax) => (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;


  /**
   * Perform conversion from array structure to a map based on ID.
   *
   * @param {array} data
   *
   * @returns {Map}
   *   Map of array data keyed by "id" in array data.
   */
  utils.arrayToIDMap = (data) => {
    const m = new Map();
    data.forEach(d => {
      m.set(d.id, d);
    });

    return m;
  };

  return utils;
};

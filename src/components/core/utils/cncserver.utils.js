/**
 * @file Abstraction module for generic util helper functions for CNC Server!
 */
import crypto from 'crypto'; // Crypto library for hashing.
import glob from 'glob';

// File Utils.
import { homedir } from 'os';
import fs from 'fs';
import path from 'path';

// Settings.
import { gConf, bot, botConf } from 'cs/settings';

// Directly exported imports.
export { _extend as extend } from 'util'; // Util for cloning objects
export { default as merge } from 'merge-deep';

// MM to Inches const.
export const MM_TO_INCHES = 25.4;

/**
 * Apply byref all keys and values from left to right.
 *
 * @export
 * @param {object} source
 *   Source single level object with key/values to set from.
 * @param {object} dest
 *   Destination single level object to be modified.
 * @param {bool} strict
 *   If true, only keys existing on the destination will be set.
 */
export function applyObjectTo(source, dest, strict = false) {
  Object.entries(source).forEach(([key, value]) => {
    // eslint-disable-next-line no-param-reassign
    if (strict) {
      if (key in dest) {
        // eslint-disable-next-line no-param-reassign
        dest[key] = value;
      }
    } else {
      // eslint-disable-next-line no-param-reassign
      dest[key] = value;
    }
  });
}

// ES Module basedir replacement.
export const __basedir = path.resolve('./src/');

/**
 * Sanity check a given coordinate within the absolute area.
 * @param  {object} point
 *   The point in absolute steps to be checked and operated on by reference.
 *
 * @return {object}
 *   The final sanitized coordinate.
 */
export function sanityCheckAbsoluteCoord({ x, y }) {
  const { maxArea } = bot;

  return {
    x: Math.round(Math.max(0, x > maxArea.width ? maxArea.width : x)),
    y: Math.round(Math.max(0, y > maxArea.height ? maxArea.height : y)),
  };
}

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
export function getHash(data, saltMethod = 'increment') {
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
}

/**
  * Validate that a directory at the given path exists.
  *
  * @param {string} dir
  *   The full path of the dir.
  *
  * @return {string}
  *   The full path dir, or an error is thrown if there's permission issues.
  */
export function getDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  return dir;
}

/**
  * Get a named user content directory.
  *
  * @param {string} name
  *   The arbitrary name of the dir.
  *
  * @return {string}
  *   The full path of the writable path.
  */
export function getUserDir(name) {
  // Ensure we have the base user folder.
  const home = getDir(path.resolve(homedir(), 'cncserver'));
  const botType = gConf.get('botType');

  // Only if we have a bot type, use its specific home dir.
  // This happens when this function is used before settings are available.
  if (botType) {
    const botHome = getDir(path.resolve(home, botType));

    // Home base dir? or bot specific?
    if (['projects', 'colorsets', 'implements', 'toolsets'].includes(name)) {
      return getDir(path.resolve(botHome, name));
    }
  }
  return getDir(path.resolve(home, name));
}

/**
  * Get list of files from a named user content directory.
  *
  * @param {string} name
  *   The arbitrary name of the dir.
  * @param {string} pattern
  *   The file pattern to filter to, defaults to all files.
  * @param {function} mapFunc
  *   The function to map over the array of files.
  *
  * @return {array}
  *   List of file paths matching the pattern, after running through the map.
  */
export function getUserDirFiles(name, pattern = '*.*', mapFunc = x => x) {
  let files = [];
  try {
    const dir = getUserDir(name);
    files = glob.sync(path.join(dir, pattern));
  } catch (error) {
    console.error(error);
  }

  return files.map(mapFunc);
}

/**
  * Get JSON data from a file in a given folder. Null if problem.
  *
  * @param {string} file
  *   The full file path of the JSON file.
  *
  * @return {object}
  *   Data in file, null if not found or bad JSON.
  */
export function getJSONFile(file) {
  let data = null;

  if (fs.existsSync(file)) {
    try {
      data = JSON.parse(fs.readFileSync(file));

      // Clean out metadata header here.
      // TODO: Validate header somehow?
      delete data._meta;
    } catch (error) {
      console.error(`Problem loading JSON file: '${file}'`, error);
    }
  }

  return data;
}

/**
  * Get an object of all JSON data in a given folder.
  *
  * @param {string} dir
  *   The full path of the directory to search in.
  *
  * @return {object}
  *   Object keyed on "name" of all items in dir. Empty object if invalid or no files.
  */
export function getJSONList(dir) {
  const out = {};

  if (fs.existsSync(dir)) {
    const files = glob.sync(path.join(dir, '*.json'));
    files.forEach(jsonPath => {
      const data = getJSONFile(jsonPath);
      if (data && data.name) {
        out[data.name] = data;
      }
    });
  }

  return out;
}

/**
  * Get an object of all JSON data in a given custom folder.
  *
  * @param {string} name
  *   The name of the preset type.
  *
  * @return {object}
  *   Object keyed on "name" of all items.
  */
export function getCustomPresets(name) {
  return getJSONList(getUserDir(name));
}

/**
  * Get an object of all JSON data in a given internal preset folder.
  *
  * @param {string} name
  *   The name of the preset type.
  *
  * @return {object}
  *   Object keyed on "name" of all items.
  */
export function getInternalPresets(name) {
  return getJSONList(path.join(__basedir, 'presets', name));
}

/**
  * Get an object of all JSON data in a given preset/custom folders.
  *
  * @param {string} name
  *   The name of the preset type.
  *
  * @return {object}
  *   Object keyed on "name" of all items.
  */
export function getPresets(name) {
  return {
    ...getInternalPresets(name),
    ...getCustomPresets(name),
  };
}

/**
  * Curried promise to validate an existing key in set of type presets.
  *
  * @param {string} key
  *   Key off of source object to check for valid machine name.
  * @param {boolean} allowInherit
  *   When true, allows '[inherit]' machine name.
  * @param {string} type
  *   The type of preset, defaults to pluralized keyname "[key]s".
  *
  * @return {Function > Promise}
  *   Curried function, to promise that resolves if the value is valid, rejects
  *   with error and allowed value list if invalid.
  */
export function isValidPreset(key, allowInherit = false, type = `${key}s`) {
  return source => new Promise((resolve, reject) => {
    const keys = Object.keys(getPresets(type));
    if (allowInherit) keys.unshift('[inherit]');
    if (!keys.includes(source[key])) {
      const err = new Error(`Invalid ${key}, must be one of allowed values`);
      err.allowedValues = keys;
      reject(err);
    }
    resolve(source);
  });
}

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
export function getPreset(type, name, customOnly) {
  const presetPath = path.join(__basedir, 'presets', type, `${name}.json`);
  const customPath = path.join(getUserDir(type), `${name}.json`);

  if (customOnly) {
    return getJSONFile(customPath);
  }

  if (fs.existsSync(customPath)) {
    return getJSONFile(customPath);
  }
  return getJSONFile(presetPath);
}

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
export function savePreset(type, data) {
  const customPath = path.join(getUserDir(type), `${data.name}.json`);
  // TODO: Pull version dynamically.
  const _meta = { cncserverVersion: '3.0.0-beta1', fileType: type };
  fs.writeFileSync(customPath, JSON.stringify({ _meta, ...data }, null, 2));
}

/**
  * Delete custom by type and name.
  *
  * @param {string} type
  *   The type of preset (folder).
  * @param {string} name
  *   The machine name of the preset.
  */
export function deletePreset(type, name) {
  const customPath = path.join(getUserDir(type), `${name}.json`);
  const trashPath = path.resolve(getUserDir('trash'), `${type}-${name}.json`);
  // Try to rename to trash. If there's one existing, delete.
  try {
    if (fs.existsSync(trashPath)) fs.unlinkSync(trashPath);
    fs.renameSync(customPath, trashPath);
  } catch (error) {
    // Basically ignore errors for now.
    console.error(error);
  }
}

// String literal translation function to keep code line lengths down.
export function singleLineString(strings, ...values) {
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
export function getHeightChangeData(src, dest) {
  const sd = botConf.get('servo:minduration');

  // Get the amount of change from difference between actualPen and absolute
  // height position, pro-rating the duration depending on amount of change
  const range = parseInt(botConf.get('servo:max'), 10)
    - parseInt(botConf.get('servo:min'), 10);

  const duration = Math.max(1, Math.round((Math.abs(dest - src) / range) * sd));

  return { d: duration, a: dest - src };
}

/**
  * Convert an absolute point object to absolute step coordinate values.
  *
  * @param {{x: number, y: number}} point
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
export function absToSteps({ x, y }, scale, inMaxArea) {
  // Convert Inches to MM.
  let point = { x, y };
  if (scale === 'in') {
    point = { x: x * MM_TO_INCHES, y: y * MM_TO_INCHES };
  }

  // Return absolute calculation.
  // TODO: validate this works for inches.
  return {
    x: (!inMaxArea ? bot.workArea.left : 0) + (point.x * bot.stepsPerMM.x),
    y: (!inMaxArea ? bot.workArea.top : 0) + (point.y * bot.stepsPerMM.y),
  };
}

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
export function stepsToAbs(point, scale) {
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
}

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
export function centToSteps(point, inMaxArea) {
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
}

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
export function inPenToSteps(inPen) {
  if (inPen.abs === 'in' || inPen.abs === 'mm') {
    return absToSteps({ x: inPen.x, y: inPen.y }, inPen.abs);
  }

  return centToSteps({ x: inPen.x, y: inPen.y });
}

/**
  * Convert any string into a machine name.
  *
  * @param {string} string
  *   Object representing coordinate away from (0,0)
  * @returns {number}
  *   Length (in steps) of the given vector point
  */
export function getMachineName(string = '', limit = 32) {
  return string
    .replace(/[^A-Za-z0-9- ]/g, '') // Remove unwanted characters.
    .replace(/\s{2,}/g, ' ') // Replace multi spaces with a single space
    .replace(/\s/g, '-') // Replace space with a '-' symbol
    .toLowerCase() // Lowercase only.
    .substr(0, limit); // Limit
}

/**
  * Get the distance/length of the given vector coordinate
  *
  * @param {{x: number, y: number}} vector
  *   Object representing coordinate away from (0,0)
  * @returns {number}
  *   Length (in steps) of the given vector point
  */
export function getVectorLength(vector) {
  return Math.sqrt((vector.x ** 2) + (vector.y ** 2));
}

/**
  * Perform conversion from named/0-1 number state value to given pen height
  * suitable for outputting to a Z axis control statement.
  *
  * @param {string|integer} state
  *
  * @returns {object}
  *   Object containing normalized state, and numeric height value. As:
  *   {state: [integer|string], height: [float]}
  */
export function stateToHeight(state) {
  // Whether to use the full min/max range (used for named presets only)
  let fullRange = false;
  let min = parseInt(botConf.get('servo:min'), 10);
  let max = parseInt(botConf.get('servo:max'), 10);
  let range = max - min;
  let normalizedState = state; // Normalize/sanitize the incoming state

  const presets = botConf.get('servo:presets');
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
    max += parseInt(botConf.get('servo:min'), 10);

    range = max - min;
  }

  // Sanity check incoming height value to 0 to 100
  height = height > 100 ? 100 : height;
  height = height < 0 ? 0 : height;

  // Calculate the final servo value from percentage
  height = Math.round(((height / 100) * range) + min);
  return { height, state: normalizedState };
}

export function round(number, precision) {
  const p = 10 ** precision;
  return Math.round(number * p) / p;
}

export function roundPoint(point, precision = 2) {
  if (Array.isArray(point)) {
    return [
      round(point[0], precision),
      round(point[1], precision),
    ];
  }

  return {
    x: round(point.x, precision),
    y: round(point.y, precision),
  };
}

/**
 * Wrap SVG string content with a header and footer.
 *
 * @export
 * @param {string} content
 *   SVG inner content to be wrapped.
 * @param {{width: number, height: number}} size
 *   Object containing width and height in SVG size.
 *
 * @returns {string}
 *   Final complete SVG text content.
 */
export function wrapSVG(content, size) {
  return singleLineString`<?xml version="1.0" encoding="utf-8"?>\n
  <svg version="1.1" baseProfile="full" xmlns="http://www.w3.org/2000/svg"
  width="${size.width}" height="${size.height}">${content}</svg>`;
}

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
export function map(x, inMin, inMax, outMin, outMax) {
  return ((x - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

/**
  * Perform conversion from array structure to a map based on ID.
  *
  * @param {array} data
  *
  * @returns {Map}
  *   Map of array data keyed by "id" in array data.
  */
export function arrayToIDMap(data) {
  const m = new Map();
  data.forEach(d => {
    m.set(d.id, d);
  });

  return m;
}

/**
  * Reverse conversion from map flat array.
  *
  * @param {Map} data
  *
  * @returns {array}
  *   Flat array of data.
  */
export function mapToArray(data) {
  return data ? Array.from(data.values()) : [];
}

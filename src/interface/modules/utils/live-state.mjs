/**
 * @file Browser utility for getting and keeping object state up to date.
 */
/* globals cncserver */
import apiInit from './api-init.mjs';

// Initialize live export data objects.
export const colorset = {};
export const project = {};
export const pen = {};
export const actualPen = {};
export const liveItems = {
  colorset, project, pen, actualPen,
};

// Keyed callback arrays.
const callbacks = {};

/**
 * Exported live state update callback registrar.
 *
 * @export
 * @param {string} key
 *   Key of the variable to check.
 * @param {Function} cb
 *   Callback function to be called when key data is updated.
 */
export function onUpdate(key, cb) {
  const keys = Object.keys(liveItems);

  // Validate bind key.
  if (!keys.includes(key)) {
    throw new Error(
      `Invalid live state variable "${key}", must be one of: ${keys.join(', ')}`
    );
  }

  // Validate callback.
  if (typeof cb !== 'function') {
    throw new Error(
      'Second argument must be callable function.'
    );
  }

  if (!callbacks[key]) callbacks[key] = [];
  callbacks[key].push(cb);
}

/**
 * Apply byref all keys and values from left to right.
 *
 * @param {object} source
 *   Source single level object with key/values to set from.
 * @param {object} dest
 *   Destination single level object to be modified.
 * @param {bool} strict
 *   If true, only keys existing on the destination will be set.
 */
function applyObjectTo(source, dest, strict = false) {
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

/**
 * Trigger live state update (called directly from data sockets below)
 *
 * @param {string} key
 *   Name of the live state variable.
 * @param {object} base
 *   Actual reference to the object to be modified.
 * @param {object} data
 *   Data to be meshed into base.
 */
function triggerUpdate(key, base, data) {
  // Push the data into the live object.
  applyObjectTo(data, base);

  // Call all callbacks.
  if (callbacks[key]) {
    callbacks[key].forEach(cb => cb(base));
  }
}

// On initialization of the API...
apiInit(() => {
  cncserver.api.colors.stat().then(
    ({ data: { set } }) => triggerUpdate('colorset', colorset, set)
  );

  cncserver.api.projects.current.stat().then(
    ({ data }) => triggerUpdate('project', project, data)
  );

  cncserver.api.pen.stat().then(({ data }) => triggerUpdate('pen', pen, data));
  cncserver.api.pen.stat(true).then(
    ({ data }) => triggerUpdate('actualPen', actualPen, data)
  );

  // Bind socket livestate updates.
  Object.entries(liveItems).forEach(([key, base]) => {
    cncserver.socket.on(`livestate ${key}`, data => triggerUpdate(key, base, data));
  });
});

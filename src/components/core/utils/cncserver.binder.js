/**
 * @file Util helper for binding to arbitrary events.
 */
const binder = {}; // Exposed export.


module.exports = () => {
  const hooks = {};

  /**
   * Binder binder! Registers a callback for an arbitrary event.
   *
   * @param {string} event
   *   Named event to trigger on.
   * @param {string} caller
   *   Who's binding this? ensures there's only one binding for each caller.
   * @param {function} callback
       Function called when the event is triggered.
   */
  binder.bindTo = (event, caller, callback) => {
    if (typeof hooks[event] !== 'object') {
      hooks[event] = {};
    }

    hooks[event][caller] = callback;
  };

  /**
   * Trigger an event callback for any bound event callers.
   *
   * @param {string} event
   *   Event name being triggered.
   * @param {object} payload
   *   Optional data payload to hand to bound callbacks.
   */
  binder.trigger = (event, payload = {}) => {
    if (typeof hooks[event] === 'object') {
      for (const [caller, callback] of Object.entries(hooks[event])) {
        if (typeof callback === 'function') {
          console.log(`Event "${event}" triggered for "${caller}" with`, payload);
          callback(payload);
        }
      }
    }
  };

  return binder;
};

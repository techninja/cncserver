/**
 * @file Util helper for binding to arbitrary events.
 */
const hooks = { };
const lateTrigger = {};

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
export function bindTo(event, caller, callback) {
  if (typeof hooks[event] !== 'object') {
    hooks[event] = {};
  }

  hooks[event][caller] = callback;

  // Immediately trigger binding if there's a late binding trigger.
  if (lateTrigger[event]) {
    callback(lateTrigger[event]);
  }
}

/**
  * Trigger an event callback for any bound event callers.
  *
  * @param {string} event
  *   Event name being triggered.
  * @param {object} payload
  *   Optional data payload to hand to bound callbacks.
  * @param {bool} allowLateTrigger
  *   If true, late bindings will trigger with last payload.
  */
export function trigger(event, payload = {}, allowLateTrigger = false) {
  let runningPayload = payload;

  // Allow late triggering for lazy binders?
  if (allowLateTrigger) {
    lateTrigger[event] = payload;
  }

  if (typeof hooks[event] === 'object') {
    // Debug for unbound triggers.
    // if (gConf.get('debug') && !Object.keys(hooks[event]).length) {
    //  console.log(`Event "${event}" triggered with NO BOUND IMPLEMENTORS`);
    // }
    for (const [caller, callback] of Object.entries(hooks[event])) {
      if (typeof callback === 'function') {
        // if (gConf.get('debug')) {
        //   console.log(`Event "${event}" triggered for "${caller}" with`, payload);
        // }
        runningPayload = callback(runningPayload);

        // If a binder implementation doesn't return, reset the payload.
        if (runningPayload === undefined) {
          runningPayload = payload;
        }
      }
    }
  }

  return runningPayload;
}

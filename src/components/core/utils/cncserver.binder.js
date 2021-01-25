/**
 * @file Util helper for binding to arbitrary events.
 */

//import { gConf } from 'cs/settings';

const hooks = { };

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
}

/**
  * Trigger an event callback for any bound event callers.
  *
  * @param {string} event
  *   Event name being triggered.
  * @param {object} payload
  *   Optional data payload to hand to bound callbacks.
  */
export function trigger(event, payload = {}) {
  let runningPayload = payload;

  if (typeof hooks[event] === 'object') {
    // Debug for unbound triggers.
    //if (gConf.get('debug') && !Object.keys(hooks[event]).length) {
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

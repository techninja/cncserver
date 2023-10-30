/**
 * @file CNC Server runner IPC wrapper code, used to manage communication and
 * events between processes.
 */
import ipc from 'node-ipc';

export default function initIPC(options) {
  // Setup passed config.
  for (const [key, val] of Object.entries(options.config)) {
    ipc.config[key] = val;
  }

  const exp = {
    /**
     * Attempt to connect to the given host.
     *
     * @param {object} bindings
     *   Key/value pair object of event bindings.
     */
    connect: (bindings = {}) => {
      ipc.connectTo(options.ipcHost, () => {
        for (const [name, callback] of Object.entries(bindings)) {
          exp.bindTo(name, callback);
        }
      });
    },

    /**
     * Send an IPC message to the server.
     *
     * @param {string} command
     *   Command name, in dot notation.
     * @param {object} data
     *   Command data (optional).
     *
     * @return {null}
     */
    sendMessage: (command, data = {}) => {
      const packet = { command, data };

      ipc.of.cncserver.emit('app.message', packet);
    },

    /**
     * Bind to an IPC event.
     *
     * @param  {string} name
     *   The named or custom IPC data event.
     * @param  {function} callback
     *   Callback to trigger when the event happens.
     *
     * @return {null}
     */
    bindTo: (name, callback) => {
      ipc.of[options.ipcHost].on(name, callback);
    },
  };

  return exp;
}

/**
 * @file Standard image vectorization algortihm module app utils.
 *
 * Holds all standardized processes for managing IPC, paper setup, and export
 * so the vectorization algorithm can do whatever it needs.
 */
const { Project, Size } = require('paper');
const ipc = require('node-ipc');

const workingHash = process.argv[2];
const hostname = 'cncserver';

console.log('Hash should be', workingHash);

// Config IPC.
ipc.config.silent = true;

// Generic message sender.
const send = (command, data = {}) => {
  const packet = { command, data };
  ipc.of[hostname].emit('vectorizer.message', packet);
};

const exp = {
  connect: (initCallback) => {
    ipc.connectTo(hostname, () => {
      // Setup bindings now that the socket is ready.
      ipc.of[hostname].on('connect', () => {
        // Connected! Tell the server we're ready for data.
        send('ready', workingHash);
      });

      // Bind central init, this gives us everything we need to do the work!
      ipc.of[hostname].on('vectorizer.init', ({
        size, image, settings, bounds,
      }) => {
        exp.project = new Project(new Size(size));
        const item = exp.project.activeLayer.importJSON(image);
        item.onLoad = () => {
          item.fitBounds(bounds);
          initCallback(item, settings);
        };
      });
    });
  },

  // Report progress on processing.
  progress: (status, value) => {
    send('progress', { status, value });
  },

  // Final vectorized paths! Send and shutdown when done.
  finish: (paths = {}) => {
    send('complete', {
      hash: workingHash,
      paths: paths.exportJSON(), // exp.project.activeLayer.exportJSON()
    });
  },

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
  map: (x, inMin, inMax, outMin, outMax) => (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin,
};

process.addListener('uncaughtException', (err) => {
  console.error(err);
  process.exit(1);
});

module.exports = exp;

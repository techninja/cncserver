/**
 * @file Standard path fill algortihm module app utils.
 *
 * Holds all standardized processes for managing IPC, paper setup, and export
 * so the fill algorithm can do whatever it needs.
 */
const { Project, Size } = require('paper');
const ipc = require('node-ipc');

const hostname = 'cncserver';

// Config IPC.
ipc.config.silent = true;

// Generic message sender.
const send = (command, data = {}) => {
  const packet = { command, data };
  ipc.of[hostname].emit('filler.message', packet);
};

const exp = {
  connect: (initCallback) => {
    ipc.connectTo(hostname, () => {
      // Setup bindings now that the socket is ready.
      ipc.of[hostname].on('connect', () => {
        // Connected! Tell the server we're ready for data.
        send('ready');
      });

      // Bind central init, this gives us everything we need to do the work!
      ipc.of[hostname].on('filler.init', ({ size, path, settings }) => {
        exp.project = new Project(new Size(size));
        const item = exp.project.activeLayer.importJSON(path);
        console.log('Path imported:', item.name, `${item.length}mm long`);
        initCallback(item, settings);
      });
    });
  },

  // Report progress on processing.
  progress: (status, value) => {
    send('progress', { status, value });
  },

  // Final fill paths! Send and shutdown when done.
  finish: (paths = {}) => {
    send('complete', paths.exportJSON());
    // send('complete', exp.project.activeLayer.exportJSON());

    ipc.disconnect(hostname);
    process.exit();
  },

  // Get only the ID of closest point in an intersection array.
  getClosestIntersectionID: (srcPoint, points) => {
    let closestID = 0;
    let closest = srcPoint.getDistance(points[0].point);

    points.forEach((destPoint, index) => {
      const dist = srcPoint.getDistance(destPoint.point);
      if (dist < closest) {
        closest = dist;
        closestID = index;
      }
    });

    return closestID;
  },
};

module.exports = exp;

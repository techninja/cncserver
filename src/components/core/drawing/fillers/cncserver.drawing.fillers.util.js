/**
 * @file Standard path fill algortihm module app utils.
 *
 * Holds all standardized processes for managing IPC, paper setup, and export
 * so the fill algorithm can do whatever it needs.
 */
const {
  Project, Size, Path, CompoundPath,
} = require('paper');
const clipperLib = require('js-angusj-clipper');
const ipc = require('node-ipc');

const hostname = 'cncserver';
const ipcBase = {
  hash: process.argv[2],
  type: 'filler',
};

// Config IPC.
ipc.config.silent = true;

// Generic message sender.
const send = (command, data = {}) => {
  const packet = { command, data };
  ipc.of[hostname].emit('spawner.message', packet);
};

// Clipper helper utilities.
const clipper = {
  scalePrecision: 10000,
  getInstance: async () => clipperLib.loadNativeClipperLibInstanceAsync(
    clipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback
  ),
  translatePoint: point => ({
    x: Math.round(point.x * clipper.scalePrecision),
    y: Math.round(point.y * clipper.scalePrecision),
  }),
  getPathGeo: (item, resolution) => {
    // Work on a copy.
    const p = item.clone();
    const geometries = [];

    // Is this a compound path?
    if (p.children) {
      p.children.forEach((c, pathIndex) => {
        if (c && c.length && c.segments) {
          if (c.segments.length <= 1 && c.closed) {
            c.closed = false;
          }

          c.flatten(resolution);
          geometries[pathIndex] = [];
          c.segments.forEach((s) => {
            geometries[pathIndex].push(clipper.translatePoint(s.point));
          });

          // If closed, add one last segment for the original connection.
          if (c.closed) {
            geometries[pathIndex].push(clipper.translatePoint(c.segments[0].point));
          }
        }
      });
    } else { // Single path.
      // With no path length, we're done.
      if (!p.length) {
        p.remove();
        // inPath.remove();
        return false;
      }

      geometries[0] = [];
      p.flatten(resolution);
      p.segments.forEach((s) => {
        geometries[0].push(clipper.translatePoint(s.point));
      });
    }

    return geometries;
  },

  // Offset passed geometry by a given delta, returns complete offset paths.
  getOffsetPaths: (data, delta, clipperInstance) => {
    const result = clipperInstance.offsetToPaths({
      delta: delta * -clipper.scalePrecision,
      offsetInputs: [{
        data,
        joinType: 'miter',
        endType: 'closedPolygon',
      }],
    });

    return clipper.resultToPaths(result);
  },

  // Convert an array of result geometries into an array of Paper paths.
  resultToPaths: (result, closed = true) => {
    const out = [];

    if (result && result.length) {
      result.forEach((subPathPoints) => {
        const subPath = new Path();
        subPathPoints.forEach((point) => {
          subPath.add({
            x: point.x / clipper.scalePrecision,
            y: point.y / clipper.scalePrecision,
          });
        });
        subPath.closed = closed;
        out.push(subPath);
      });
      return out;
    }

    // Return null if no result.
    return null;
  },
};

const exp = {
  connect: (initCallback) => {
    ipc.connectTo(hostname, () => {
      // Setup bindings now that the socket is ready.
      ipc.of[hostname].on('connect', () => {
        // Connected! Tell the server we're ready for data.
        send('ready', ipcBase);
      });

      // Bind central init, this gives us everything we need to do the work!
      ipc.of[hostname].on('spawner.init', ({ size, object, settings }) => {
        exp.project = new Project(new Size(size));
        const item = exp.project.activeLayer.importJSON(object);
        // console.log('Path:', item.name, `${Math.round(item.length * 10) / 10}mm long`);

        // For any non-zero value, we want to inset the object before it gets in.
        if (settings.inset) {
          clipper.getInstance().then((clipperInstance) => {
            const geo = clipper.getPathGeo(item, settings.flattenResolution);
            const paths = clipper.getOffsetPaths(geo, settings.inset, clipperInstance);

            initCallback(new CompoundPath(paths), settings);
          });
        } else {
          initCallback(item, settings);
        }
      });
    });
  },

  // Report progress on processing.
  progress: (status, value) => {
    send('progress', { ...ipcBase, status, value });
  },

  // Final fill paths! Send and host will shutdown when done.
  finish: (paths = {}) => {
    send('complete', {
      ...ipcBase,
      result: paths.exportJSON(), // exp.project.activeLayer.exportJSON()
    });
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

  // Will return true if the given point is in either the top left or bottom
  // right otuside the realm of the bound rect:
  //         |
  //   (true)| (false)
  // ----------------+
  //         | Bounds|
  // (false) |(false)| (false)
  //         +----------------
  //         (false) | (true)
  //                 |
  pointBeyond: (point, bounds) => {
    // Outside top left
    if (point.x < bounds.left && point.y < bounds.top) return true;

    // Outside bottom right
    if (point.x > bounds.right && point.y > bounds.bottom) return true;

    // Otherwise, not.
    return false;
  },

  // Add in the Clipper utilities.
  clipper,
};

process.addListener('uncaughtException', (err) => {
  console.error(err);
  process.exit(1);
});

module.exports = exp;

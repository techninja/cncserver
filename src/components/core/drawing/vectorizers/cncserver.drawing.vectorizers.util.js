/**
 * @file Standard image vectorization algortihm module app utils.
 *
 * Holds all standardized processes for managing IPC, paper setup, and export
 * so the vectorization algorithm can do whatever it needs.
 */
import Paper from 'paper';
import { tmpdir } from 'os';
import ipc from 'node-ipc';
import Jimp from 'jimp';
import path from 'path';

const {
  Project, Size, Path, Rectangle, Raster, Color
} = Paper;
const hostname = 'cncserver';
const ipcBase = {
  hash: process.argv[2],
  subIndex: process.argv[3],
  type: 'vectorizer',
};

// Vectorizer state.
export const state = {
  project: {}, // Paper project placeholder.
};

// Config IPC.
ipc.config.silent = true;

// Catch errors and quit cleanly.
process.addListener('uncaughtException', err => {
  console.error(err);
  process.exit(1);
});

// Generic message sender.
const send = (command, data = {}) => {
  const packet = { command, data };
  ipc.of[hostname].emit('spawner.message', packet);
};

export function connect(outputFormat, initCallback) {
  ipc.connectTo(hostname, () => {
    // Setup bindings now that the socket is ready.
    ipc.of[hostname].on('connect', () => {
      // Connected! Tell the server we're ready for data.
      send('ready', ipcBase);
    });

    // Bind central init, this gives us everything we need to do the work!
    ipc.of[hostname].on('spawner.init', ({ size, object: imagePath, settings }) => {
      state.project = new Project(new Size(size));

      // Use JIMP to apply raster/pixel based modifications & work from that.
      const ext = outputFormat === 'paper' ? 'png' : outputFormat;
      const outputImagePath = path.resolve(
        tmpdir(),
        `cncserver_vectorizer_image_${ipcBase.hash}.${ext}`
      );
      const { raster } = settings;

      // eslint-disable-next-line no-eval
      const flattenColor = eval(
        `${new Color(raster.flattenColor).toCSS(true).replace('#', '0x')}ff`
      );
      Jimp.read(imagePath).then(img => new Promise(resolve => {
        img.brightness(raster.brightness);
        img.contrast(raster.contrast);

        if (raster.grayscale) img.greyscale(); // Spelling much? 🤣
        if (raster.invert) img.invert();
        if (raster.normalize) img.normalize();
        if (raster.blur) img.blur(raster.blur);
        if (raster.flatten || ext !== 'png') img.background(flattenColor);
        // TODO: apply image resolution adjustment/resize.

        return img.write(outputImagePath, resolve);
      })).then(() => {
        // If the vectorizer requests paper, load that in from the JIMP output.
        if (outputFormat === 'paper') {
          const item = new Raster(outputImagePath);
          item.onLoad = () => {
            item.fitBounds(settings.bounds);
            initCallback(item, settings);
          };
        } else {
          // Otherwise, just hand it the output image path.
          initCallback(outputImagePath, settings);
        }
      });
    });

    // Cancel/quit the process.
    ipc.of[hostname].on('cancel', () => { process.exit(0); });
  });
}

// Get information about this spawn process.
export const info = { ...ipcBase };

// Report progress on processing.
export function progress(status, value) {
  send('progress', { ...ipcBase, status, value });
}

// Final vectorized paths! Send and shutdown when done.
export function finish(paths = {}) {
  send('complete', {
    ...ipcBase,
    result: paths.exportJSON(), // state.project.activeLayer.exportJSON()
  });
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
  return ((x - inMin) * (outMax - outMin)) / ((inMax - inMin) + outMin)
}

export function generateSpiralPath(inputSpacing, spiralBounds, offset = { x: 0, y: 0 }) {
  // Calculate a single spiral coordinate given a distance and spacing.
  function calculateSpiral(distance, spacing = 1, center) {
    return {
      x: (spacing * distance * Math.cos(distance)) + center.x,
      y: (spacing * distance * Math.sin(distance)) + center.y,
    };
  }

  // Make a list of points along a spiral.
  function makeSpiral(turns, spacing, startOn, center) {
    const start = startOn ? startOn * Math.PI * 2 : 0;
    const points = [];
    const stepAngle = Math.PI / 4; // We want at least 8 points per turn

    for (let i = start; i < turns * Math.PI * 2; i += stepAngle) {
      points.push(calculateSpiral(i, spacing, center));
    }

    return points;
  }

  // Setup the spiral:
  const viewBounds = new Rectangle(spiralBounds) || state.project.view.bounds;
  const spiral = new Path();
  const spacing = inputSpacing / (Math.PI * 2);

  // This is the diagonal distance of the area in which we will be filling.
  let boundsSize = viewBounds.topLeft.getDistance(viewBounds.bottomRight) / 2;

  // Add extra for offset.
  boundsSize += viewBounds.center.getDistance(viewBounds.center.add(offset)) / 2;

  // Estimate the number of turns based on the spacing and boundsSize
  const turns = Math.ceil(boundsSize / (spacing * 2 * Math.PI));

  spiral.position = viewBounds.center.add(offset);
  spiral.addSegments(makeSpiral(turns, spacing, null, spiral.position));

  spiral.smooth();

  // The last few segments are not spiralular so remove them
  spiral.removeSegments(spiral.segments.length - 4);
  return spiral;
}

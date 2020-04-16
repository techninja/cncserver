/**
 * @file Stipple vectorizer
 */

const { Group } = require('paper');
const { exec } = require('child_process');
const { tmpdir } = require('os');
const fs = require('fs');
const path = require('path');
const dataUriToBuffer = require('data-uri-to-buffer');
const util = require('./cncserver.drawing.vectorizers.util');

const bin = path.resolve(__dirname, 'bin', process.platform, 'voronoi_stippler');
const tmp = path.resolve(tmpdir());

let settings = {
  useColor: false,
  noOverlap: false,
  fixedRadius: false,
  points: 500,
  maxDensity: 4,
  sizingFactor: 1,
  brightness: 0.05,
  rasterDPI: 300,
  subPixels: 5,
  input: path.resolve(tmp, 'stipple_input.png'),
  output: path.resolve(tmp, 'stipple_output.svg'),
};

// Map settings values to verbose command line options.
const optionMap = {
  input: 'input-file',
  output: 'output-file',
  points: 'stipples',
  useColor: 'colour-output',
  noOverlap: 'no-overlap',
  fixedRadius: 'fixed-radius',
  sizingFactor: 'sizing-factor',
  subPixels: 'subpixels',
};

const writeImage = (source, dest) => new Promise((success, error) => {
  const exportRaster = source.rasterize(settings.rasterDPI);
  const b = dataUriToBuffer(exportRaster.toDataURL());
  fs.writeFile(dest, b, (err) => {
    if (err) {
      error(err);
    } else {
      success();
    }
  });
});

const buildOptions = () => {
  const opts = [];
  Object.entries(optionMap).forEach(([key, optName]) => {
    if (typeof settings[key] === 'boolean') {
      if (settings[key]) {
        opts.push(`--${optName}`); // Option boolean
      }
    } else {
      opts.push(`--${optName} ${settings[key]}`); // Option -> Value
    }
  });
  return opts;
};

// Connect to the main process, start the vectorization operation.
util.connect((image, settingsOverride) => {
  settings = { ...settings, ...settingsOverride };
  const { input, output } = settings;

  // How does this work?
  // - Take in the image, size/brighten appropriately.
  // - Rasterize image and save PNG
  // - Run the command
  // - When it finishes, import the SVG

  // Remove any previous run output file.
  if (fs.existsSync(output)) {
    fs.unlinkSync(output);
  }

  // Write the PNG for input.
  writeImage(image, input).then(() => {
    const opts = buildOptions();
    const fullExec = `${bin} ${opts.join(' ')}`;
    console.log('Executing:', fullExec);
    const child = exec(fullExec);

    child.stdout.on('data', (data) => {
      if (data.includes('% Complete')) {
        const progress = Math.min(100, parseInt(data.split('%')[0], 10));
        console.log('Progres:', progress);
      }
    });

    child.on('close', () => {
      if (fs.existsSync(output)) {
        console.log('Importing file', output);

        util.project.importSVG(output, {
          expandShapes: true,
          onLoad: (group) => {
            group.fitBounds(image.bounds);

            // Should be a flat list of circles converted to 4 segment paths.
            group.children.forEach((item) => {
              item.strokeColor = item.fillColor;
              item.strokeWidth = 0.5;
              item.fillColor = null;
            });
            util.finish(group);
          },
        });
      } else {
        console.log('No output file 😢', output);
        util.finish(new Group());
      }
    });
  });
});

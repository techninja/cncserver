/* eslint-disable no-param-reassign */
/**
 * @file Stipple vectorizer
 */
import Paper from 'paper';
import { exec } from 'child_process';
import { tmpdir } from 'os';
import fs from 'fs';
import path from 'path';
import * as utils from '../cncserver.drawing.vectorizers.util.js';

const { Group } = Paper;
const bin = path.resolve('.', 'bin', process.platform, 'voronoi_stippler');
const tmp = tmpdir();

let settings = { }; // Globalize settings.vectorize >

// Map settings values to verbose command line options.
const optionMap = {
  input: 'input-file',
  output: 'output-file',
  points: 'stipples',
  useColor: 'colour-output',
  noOverlap: 'no-overlap',
  fixedRadius: 'fixed-radius',
  sizingFactor: 'sizing-factor',
  subpixels: 'subpixels',
};

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
utils.connect('png', (input, rawSettings) => {
  const output = path.resolve(tmp, `stipple_output_${utils.info.hash}.svg`);
  settings = {
    ...rawSettings.stipple,
    input,
    output,
  };

  // Remove any previous run output file.
  if (fs.existsSync(output)) fs.unlinkSync(output);

  // Push the input image and spawn the child process.
  const opts = buildOptions();
  const fullExec = `${bin} ${opts.join(' ')}`;
  console.log('Executing:', fullExec);
  const child = exec(fullExec);

  child.stderr.on('data', data => {
    console.error('ERROR:', data);
  });

  child.stdout.on('data', data => {
    if (data.includes('% Complete')) {
      const progress = Math.min(100, parseInt(data.split('%')[0], 10));
      console.log('Progress:', progress);
    }
  });

  child.on('close', () => {
    if (fs.existsSync(output)) {
      console.log('Importing file', output);

      utils.state.project.importSVG(output, {
        expandShapes: true,
        onLoad: group => {
          group.fitBounds(rawSettings.bounds);

          // Should be a flat list of circles converted to 4 segment paths.
          group.children.forEach(item => {
            item.strokeColor = item.fillColor;
            item.strokeWidth = 0.5;
            item.fillColor = null;
          });
          utils.finish(group);
        },
      });
    } else {
      console.log('No output file 😢', output);
      utils.finish(new Group());
    }
  });
});

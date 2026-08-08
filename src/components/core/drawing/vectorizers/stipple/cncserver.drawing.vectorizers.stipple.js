/* eslint-disable no-param-reassign */
/**
 * @file Stipple vectorizer
 */
import Paper from 'paper';
import { exec, spawn } from 'child_process';
import readline from 'readline';
import { tmpdir } from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as utils from '../cncserver.drawing.vectorizers.util.js';

const { Group } = Paper;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bin = path.resolve(__dirname, '..', 'bin', process.platform, 'voronoi_stippler');
const cncrenderBin = path.resolve(
  __dirname, '..', '..', '..', '..', 'cncrender', 'bin', process.platform, 'cncrender'
);
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

// Run a TSP job through cncrender, returns promise resolving to ordered points.
function tspOrder(hash, points) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cncrenderBin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', line => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.type === 'result') resolve(msg.ordered);
      else if (msg.type === 'progress') utils.progress('tsp', msg.pct);
    });
    proc.stderr.on('data', d => console.error(`CNCRENDER: ${d}`));
    proc.on('error', reject);
    proc.on('close', code => { if (code) reject(new Error(`cncrender exit ${code}`)); });
    proc.stdin.write(`${JSON.stringify({ job: 'tsp', hash, points })}\n`);
    proc.stdin.end();
  });
}

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

          // Extract circle centers for TSP ordering.
          const points = group.children.map(item => ({
            x: item.position.x,
            y: item.position.y,
          }));

          tspOrder(utils.info.hash, points).then(ordered => {
            // Build a position→child lookup, reorder group children in-place.
            const byPos = new Map(
              group.children.map(item => [
                `${Math.round(item.position.x)},${Math.round(item.position.y)}`,
                item,
              ])
            );
            const reordered = ordered.map(({ x, y }) => (
              byPos.get(`${Math.round(x)},${Math.round(y)}`)
            )).filter(Boolean);

            // Append in new order (Paper moves on append, no clone needed).
            reordered.forEach(item => group.addChild(item));
            utils.finish(group);
          }).catch(err => {
            console.error('TSP ordering failed, using original order:', err.message);
            utils.finish(group);
          });
        },
      });
    } else {
      console.log('No output file 😢', output);
      utils.finish(new Group());
    }
  });
});

/**
 * @file Abstraction module for print API and print rendering.
 */

import * as projects from 'cs/projects';
import png from 'png-metadata';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as utils from 'cs/utils';
import { colors, base } from 'cs/drawing';
import { snapPathsToColorset, isMatcherReady, set as colorSet } from 'cs/drawing/colors';
import { trigger } from 'cs/binder';
import { botConf } from 'cs/settings';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CNCRENDER_BIN = path.resolve(
  __dirname, '..', '..', '..', 'cncrender', 'bin', process.platform, 'cncrender'
);

const MOVE_FILE = 'cncserver.moves.ndjson';

// Track all live cncrender child processes for cleanup.
const activeProcs = new Set();

export function killAllCncrenderProcs() {
  activeProcs.forEach(proc => { try { proc.kill(); } catch { /* already gone */ } });
  activeProcs.clear();
}

process.on('exit', killAllCncrenderProcs);
process.on('SIGINT', () => { killAllCncrenderProcs(); process.exit(0); });
process.on('SIGTERM', () => { killAllCncrenderProcs(); process.exit(0); });

// Get the move file path for the current project.
function getMoveFilePath() {
  const project = projects.getCurrent();
  return path.resolve(project.dir, MOVE_FILE);
}

// Send a single non-streaming job to cncrender, resolve with result message.
function cncrenderJob(job) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CNCRENDER_BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    activeProcs.add(proc);
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', line => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.type === 'result') resolve(msg);
    });
    proc.stderr.on('data', d => console.error(`CNCRENDER: ${d}`));
    proc.on('error', reject);
    proc.on('close', code => {
      activeProcs.delete(proc);
      if (code) reject(new Error(`cncrender exit ${code}`));
    });
    proc.stdin.write(`${JSON.stringify(job)}\n`);
    proc.stdin.end();
  });
}

// Stream a render_stroke job, appending each move line to the project move file.
// Resolves when stroke_done sentinel is received.
// The caller is responsible for writing the pen-up transit and z:0 pen-down
// before calling this — so we skip cncrender's leading z:0.
function renderStrokeToFile(job, moveFilePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CNCRENDER_BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    activeProcs.add(proc);
    const rl = readline.createInterface({ input: proc.stdout });
    const stream = fs.createWriteStream(moveFilePath, { flags: 'a' });
    let done = false;
    let skippedPenDown = false;

    rl.on('line', line => {
      if (!line.trim()) return;
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.t === 'stroke_done') {
        done = true;
        stream.end(() => resolve());
        return;
      }
      // Skip the leading z:0 — caller already wrote it after the transit.
      if (!skippedPenDown && msg.t === 'z' && msg.z === 0) {
        skippedPenDown = true;
        return;
      }
      stream.write(`${line}\n`);
    });

    proc.stderr.on('data', d => console.error(`CNCRENDER: ${d}`));
    proc.on('error', err => { stream.end(); reject(err); });
    proc.on('close', code => {
      activeProcs.delete(proc);
      if (done) return; // already resolved via stroke_done
      stream.end();
      reject(new Error(`cncrender exit ${code ?? 0} without stroke_done`));
    });

    proc.stdin.write(`${JSON.stringify(job)}\n`);
    proc.stdin.end();
  });
}

// TODO:
// - Convert buffer render over to string render
// - Resettable render pen state (Don't do it like this below)
// - Render sections to work groups, output as ordered colorset item keyed "gcode" arrays
// - Ensure this render is still bufferable and supports all features (Inside, outside, tool positions)
// - Render progress updates.
// - Build PNG with info window in bottom left.
// - Write render data to PNG
// - Finish WCB options.

// Set of PNG chunk headers for C.NC S.erver P.rint PNGs.
export const pngPayloadChunks = {
  PRINT_CHUNK_TITLE: 'CSPt', // Plain: Title of the print.
  PRINT_CHUNK_PROJECT: 'CSPp', // JSON: Project specific dat (paper color, etc).
  PRINT_CHUNK_COLORSET: 'CSPc', // JSON: Colorset used to generate data.
  PRINT_CHUNK_SETTINGS: 'CSPs', // JSON: Print settings used to generate data.
  PRINT_CHUNK_DATA: 'CSPd', // JSON: Array of rendered work groupings.
};

/**
 * Using a loaded PNG file buffer, set a specified chunk by name.
 *
 * @param {Buffer} data
 *  PNG data buffer from readFileSync.
 * @param {string} name
 *   4 character chunk identifier.
 *
 * @returns {Buffer}
 *   Joined binary buffer containing new data.
 */
function addChunk(data, name, value, isJSON = true) {
  const chunks = png.splitChunk(data);
  const writeData = isJSON ? JSON.stringify(value) : value;
  chunks.splice(-1, 0, png.createChunk(name, writeData));
  return png.joinChunk(chunks);
}

/**
 * Using a loaded PNG file buffer, get the specified chunk by name.
 *
 * @param {Buffer} data
 *  PNG data buffer from readFileSync.
 * @param {string} name
 *   4 character chunk identifier.
 *
 * @returns {string|Object}
 *   Data pulled from PNG file data.
 */
function getChunk(data, name, isJSON = true) {
  const chunks = png.splitChunk(data);
  let outData = chunks.find(chunk => chunk.type === name);
  outData = outData?.data ?? null;
  if (isJSON) {
    try {
      outData = JSON.parse(outData);
    } catch (error) {
      // Oh well. Return the untouched data.
    }
  }
  return outData;
}

/**
 * Save the current project and rendered print content as a PNG file.
 *
 * @export
 */
export function saveFile() {
  const filePath = path.join(utils.__basedir, 'interface', 'test_zener.png');
  const data = png.readFileSync(filePath);

  /*
  data = addChunk(data, PRINT_CHUNK_COLORSET, 'colorset goes here');
  data = addChunk(data, PRINT_CHUNK_SETTINGS, 'settings goes here');
  data = addChunk(data, PRINT_CHUNK_DATA, 'data goes here');
  */

  const outFilePath = path.join(utils.__basedir, 'interface', 'test_png_write.png');
  png.writeFileSync(outFilePath, data, 'binary');
}

/**
 * Parse the data chunks from a given PNG file.
 *
 * @export
 * @param {string} filePath
 *   Path to file to be read.
 *
 * @returns {Object|null}
 *   Object of all print data from the PNG, null if invalid.
 */
export function getPrintData(filePath) {
  const data = png.readFileSync(filePath);

  const commands = getChunk(data, pngPayloadChunks.PRINT_CHUNK_DATA);

  const out = {};
  if (commands) {
    out.title = getChunk(data, pngPayloadChunks.PRINT_CHUNK_TITLE);
    out.colorset = getChunk(data, pngPayloadChunks.PRINT_CHUNK_COLORSET);
    out.settings = getChunk(data, pngPayloadChunks.PRINT_CHUNK_SETTINGS);
    out.data = commands;
  } else {
    return null;
  }

  return out;
}

/**
 * Recursively calculate acceleration along a given path.
 *
 * @export
 * @param {paper.Path} pathItem
 *   Path to file to be read.
 *
 * @returns {Object|null}
 *   Object of all print data from the PNG, null if invalid.
 */
export const accelMoveOnPath = (pathItem, prevEndPoint = null) => new Promise((success, error) => {
  // Flatten path to points for cncrender.
  const resolution = 0.5;
  const flatPoints = [];
  for (let o = 0; o <= pathItem.length; o += resolution) {
    const p = pathItem.getPointAt(o);
    if (p) flatPoints.push({ x: p.x, y: p.y });
  }

  const hash = pathItem.data?.hash || `path-${Date.now()}`;
  const implementName = colorSet.implement || botConf.get('implement');
  const imp = utils.getPreset('implements', implementName) || {};
  const implementParams = {
    width_mm: Number(imp.width ?? 3.0),
    length_mm: Number(imp.length ?? 10.75),
    stiffness: Number(imp.stiffness ?? 0.25),
    spm: 1.0,
    bounds_x: Number(botConf.get('maxAreaMM:width') ?? 361.5),
    bounds_y: Number(botConf.get('maxAreaMM:height') ?? 206.25),
  };

  const moveFilePath = getMoveFilePath();

  // Always write pen-up transit to stroke start, then pen-down.
  // For the first stroke (prevEndPoint=null) use park position {0,0}.
  if (flatPoints.length) {
    const from = prevEndPoint ?? { x: 0, y: 0 };
    const start = flatPoints[0];
    const dx = start.x - from.x;
    const dy = start.y - from.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.1) {
      const transitDur = Math.max(1, Math.round(d / 150 * 1000));
      fs.appendFileSync(moveFilePath, '{"t":"z","z":1,"dur":0}\n');
      fs.appendFileSync(moveFilePath, `${JSON.stringify({ t: 'move', x: start.x, y: start.y, dur: transitDur })}\n`);
    }
    fs.appendFileSync(moveFilePath, '{"t":"z","z":0,"dur":0}\n');
  }

  renderStrokeToFile(
    { job: 'render_stroke', hash, points: flatPoints, implement: implementParams },
    moveFilePath
  ).then(() => {
    const endPoint = flatPoints.length ? flatPoints[flatPoints.length - 1] : prevEndPoint;
    success(endPoint);
  }).catch(err => {
    console.error('render_stroke error:', err.message);
    error(err);
  });
});

/**
  * Actually render Paper paths into movements
  *
  * @param {object} source
  *   Source paper object containing the children, defaults to preview layer.
  */
export async function renderPathsToMoves(reqSettings = {}) {
  console.log('[print] renderPathsToMoves called');
  const source = base.layers.print;

  // Preview layer is empty — likely a fresh server start with no re-render.
  // Trigger a render first, then re-enter.
  if (!base.layers.preview?.children?.length) {
    console.log('Preview layer empty, rendering first...');
    projects.renderCurrentContent().then(() => {
      console.log('[print] render complete, re-entering renderPathsToMoves');
      projects.saveProjectFiles();
      renderPathsToMoves(reqSettings);
    }).catch(e => console.error('[print] renderCurrentContent error:', e));
    return;
  }

  console.log(`[print] preview children: ${base.layers.preview.children.length}, matcher ready: ${isMatcherReady()}`);

  // Ensure matcher is ready before snapping — apply default colorset if not.
  if (!isMatcherReady()) {
    console.log('[print] applying default colorset...');
    await colors.applyPreset(botConf.get('defaultColorset') || 'default-single-pen');
    console.log(`[print] colorset applied, matcher ready: ${isMatcherReady()}`);
  }
  snapPathsToColorset(base.layers.preview);
  console.log(`[print] print layer children after snap: ${base.layers.print.children.length}`);
  console.log(`[print] source children: ${source.children.length}`);
  const settings = {
    parkAfter: true,
    ...reqSettings,
  };

  // Truncate the move file for this print run — start with pen up.
  const moveFilePath = getMoveFilePath();
  fs.writeFileSync(moveFilePath, '{"t":"z","z":1,"dur":0}\n');
  trigger('print.movefile.ready', moveFilePath);

  // * Join extant non-closed paths with endpoint distances < 0.5mm
  // * Split work by colors
  // * Allow WCB bot support to inject tool changes for refill support
  // * Order paths by pickup/dropoff distance

  // Store work for all paths grouped by color
  const workGroups = colors.getWorkGroups();
  const validColors = Object.keys(workGroups);
  console.log(`[print] validColors: ${JSON.stringify(validColors)}`);
  console.log(`[print] source child names: ${source.children.map(c => c.name).join(', ')}`);
  source.children.forEach(colorGroup => {
    if (workGroups[colorGroup.name]) {
      const paths = base.getPaths(colorGroup);
      // Sort paths by nearest-neighbour from origin to minimize transit distance.
      const sorted = [];
      const remaining = [...paths];
      let curX = 0, curY = 0;
      while (remaining.length) {
        let bestIdx = 0, bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const p = remaining[i].getPointAt(0);
          if (!p) continue;
          const d = Math.hypot(p.x - curX, p.y - curY);
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        const chosen = remaining.splice(bestIdx, 1)[0];
        sorted.push(chosen);
        const end = chosen.getPointAt(chosen.length);
        if (end) { curX = end.x; curY = end.y; }
      }
      workGroups[colorGroup.name] = sorted;
    }
  });

  let workGroupIndex = 0;
  function nextWorkGroup() {
    const colorID = validColors[workGroupIndex];
    console.log(`[print] nextWorkGroup index=${workGroupIndex} colorID=${colorID} paths=${workGroups[colorID]?.length}`);
    if (colorID) {
      const paths = workGroups[colorID];

      if (paths.length) {
        let pathIndex = 0;
        let prevEndPoint = null;
        const nextPath = () => {
          if (paths[pathIndex]) {
            console.log(`[print] accelMoveOnPath path ${pathIndex}/${paths.length} in ${colorID}`);
            accelMoveOnPath(paths[pathIndex], prevEndPoint).then(endPoint => {
              prevEndPoint = endPoint;
              pathIndex++;
              nextPath();
            }).catch(error => {
              if (error) {
                console.error('[print] accelMoveOnPath error:', error.message || error);
              }
              workGroupIndex = validColors.length;
            });
          } else {
            // No more paths in this group, move to the next.
            workGroupIndex++;
            nextWorkGroup();
          }
        };

        // Start processing paths in the initial workgroup.
        nextPath();
      } else {
        // There is no work for this group, move to the next one.
        workGroupIndex++;
        nextWorkGroup();
      }
    } else {
      // All paths in all work groups rendered to move file.
      console.log('[print] all paths rendered to move file');
    }
  }
  // Intitialize working on the first group on the next process tick.
  process.nextTick(nextWorkGroup);
}

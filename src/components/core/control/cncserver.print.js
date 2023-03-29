/**
 * @file Abstraction module for print API and print rendering.
 */

import * as projects from 'cs/projects';
import png from 'png-metadata';
import path from 'path';
import * as utils from 'cs/utils';
import * as tools from 'cs/tools';
import { movePenAbs } from 'cs/control';
import { colors, base, accell } from 'cs/drawing';
import { trigger } from 'cs/binder';

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
export const accelMoveOnPath = pathItem => new Promise((success, error) => {
  const move = (point, speed = null) => {
    const stepPoint = utils.absToSteps(point, 'mm', true);
    movePenAbs(stepPoint, null, true, null, speed);
  };

  // Pen up
  pen.setPen({ state: 'up' });

  // Move to start of path, then pen down.
  move(pathItem.getPointAt(0));
  pen.setPen({ state: 'draw' });

  // Calculate groups of accell points and run them into moves.
  accell.getPoints(pathItem, accellPoints => {
    // If we have data, move to those points.
    if (accellPoints && accellPoints.length) {
      // Move through all accell points from start to nearest end point
      accellPoints.forEach(pos => {
        move(pos.point, pos.speed);
      });
    } else {
      // Null means generation of accell points was cancelled.
      if (accellPoints !== null) {
        // No points? We're done. Wrap up the line.

        // Move to end of path...
        move(pathItem.getPointAt(pathItem.length));

        // If it's a closed path, overshoot back home.
        if (pathItem.closed) {
          move(pathItem.getPointAt(0));
        }

        // End with pen up.
        pen.setPen({ state: 'up' });

        // Fulfull the promise for this subpath.
        success();
        return;
      }

      // If we're here, path generation was cancelled, bubble it.
      error();
    }
  });
});

/**
  * Actually render Paper paths into movements
  *
  * @param {object} source
  *   Source paper object containing the children, defaults to preview layer.
  */
export function renderPathsToMoves(reqSettings = {}) {
  const source = base.layers.print;
  const settings = {
    parkAfter: true,
    ...reqSettings,
  };
  // TODO:
  // * Join extant non-closed paths with endpoint distances < 0.5mm
  // * Split work by colors
  // * Allow WCB bot support to inject tool changes for refill support
  // * Order paths by pickup/dropoff distance

  // Store work for all paths grouped by color
  const workGroups = colors.getWorkGroups();
  const validColors = Object.keys(workGroups);
  source.children.forEach(colorGroup => {
    if (workGroups[colorGroup.name]) {
      workGroups[colorGroup.name] = base.getPaths(colorGroup);
    }
  });

  let workGroupIndex = 0;
  function nextWorkGroup() {
    const colorID = validColors[workGroupIndex];
    if (colorID) {
      const paths = workGroups[colorID];

      if (paths.length) {
        // Bind trigger for implementors on work group begin.
        trigger('print.render.group.begin', colorID);

        // Do we have a tool for this colorID? If not, use manualswap.
        if (colors.doColorParsing()) {
          const changeTool = tools.has(colorID) ? colorID : 'manualswap';
          tools.changeTo(changeTool, colorID);
        }

        let pathIndex = 0;
        const nextPath = () => {
          if (paths[pathIndex]) {
            accelMoveOnPath(paths[pathIndex]).then(() => {
              // Trigger implementors for path render complete.
              trigger('print.render.path.finish', paths[pathIndex]);

              // Path in this group done, move to the next.
              pathIndex++;
              nextPath();
            }).catch(error => {
              // If we have an error object, it's an actual error!
              if (error) {
                console.error(error);
              }
              // Otherwise, path generation has been entirely cancelled.
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
      // Actually complete with all paths in all work groups!
      // TODO: Fullfull a promise for the function?

      // Trigger binding for implementors on sucessfull rendering completion.
      trigger('print.render.finish');

      // If settings say to park.
      if (settings.parkAfter) pen.park();
    }
  }
  // Intitialize working on the first group on the next process tick.
  process.nextTick(nextWorkGroup);
}

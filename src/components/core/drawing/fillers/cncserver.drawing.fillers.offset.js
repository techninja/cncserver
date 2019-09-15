/**
 * @file Path fill algortihm module: Export function for running the dynamic
 * "cam" style offset fill utilizing the "clipper" and cam.js libraries.
 */

const { Path, Group } = require('paper');
const clipperLib = require('js-angusj-clipper');
const fillUtil = require('./cncserver.drawing.fillers.util');

let settings = {};
let exportGroup = {};
const clipperScalePrecision = 10000;

async function getClipperAsync() {
  // create an instance of the library (usually only do this once in your app)
  const clipper = await clipperLib.loadNativeClipperLibInstanceAsync(
    // let it autodetect which one to use, but also available WasmOnly and AsmJsOnly
    clipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback
  );
  return clipper;
}

function getClipperGeo(item) {
  // Work on a copy.
  const p = item.clone();
  const geometries = [];

  // Is this a compound path?
  if (p.children) {
    p.children.forEach((c, pathIndex) => {
      if (c.length) {
        if (c.segments.length <= 1 && c.closed) {
          c.closed = false;
        }

        c.flatten(settings.flattenResolution);
        geometries[pathIndex] = [];
        c.segments.forEach((s) => {
          geometries[pathIndex].push({
            x: Math.round(s.point.x * clipperScalePrecision),
            y: Math.round(s.point.y * clipperScalePrecision),
          });
        });
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
    p.flatten(settings.flattenResolution);
    p.segments.forEach((s) => {
      geometries[0].push({
        x: Math.round(s.point.x * clipperScalePrecision),
        y: Math.round(s.point.y * clipperScalePrecision),
      });
    });
  }

  return geometries;
}

function getOffsetPaths(data, delta, clipper) {
  const result = clipper.offsetToPaths({
    delta: delta * -clipperScalePrecision,
    offsetInputs: [{
      data,
      joinType: 'miter',
      endType: 'closedPolygon',
    }],
  });

  const out = [];

  if (result && result.length) {
    result.forEach((subPathPoints) => {
      const subPath = new Path();
      subPathPoints.forEach((point) => {
        subPath.add({
          x: point.x / clipperScalePrecision,
          y: point.y / clipperScalePrecision,
        });
      });
      subPath.closed = true;
      out.push(subPath);
    });
    return out;
  }

  return null;
}

// Connect to the main process, start the fill operation.
fillUtil.connect((path, settingsOverride) => {
  getClipperAsync().then((clipper) => {
    settings = { ...settings, ...settingsOverride };
    exportGroup = new Group();

    let items = [];
    let increment = 0;
    const geo = getClipperGeo(path);
    while (items) {
      items = getOffsetPaths(geo, settings.spacing + increment, clipper);
      if (items) {
        exportGroup.addChildren(items);
        increment += settings.spacing;
      }
    }

    fillUtil.finish(exportGroup);
  });
});

/**
 * @file Path fill algortihm module: Export function for running the dynamic
 * "cam" style offset fill utilizing the "clipper" and cam.js libraries.
 */

const { Group } = require('paper');
const fillUtil = require('../cncserver.drawing.fillers.util');

let settings = {};
let exportGroup = {};

function getOffsetPaths(data, delta, clipper) {
  const result = clipper.offsetToPaths({
    delta: delta * -fillUtil.clipper.scalePrecision,
    offsetInputs: [{
      data,
      joinType: 'miter',
      endType: 'closedPolygon',
    }],
  });

  return fillUtil.clipper.resultToPaths(result);
}

// Connect to the main process, start the fill operation.
fillUtil.connect((path, settingsOverride) => {
  fillUtil.clipper.getInstance().then((clipper) => {
    settings = { ...settings, ...settingsOverride };
    exportGroup = new Group();

    let items = [];
    let increment = 0;
    const geo = fillUtil.clipper.getPathGeo(path, settings.flattenResolution);
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

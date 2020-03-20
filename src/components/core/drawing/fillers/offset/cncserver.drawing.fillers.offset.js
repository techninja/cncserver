/**
 * @file Path fill algortihm module: Export function for running the dynamic
 * "cam" style offset fill utilizing the "clipper" and cam.js libraries.
 */

const { Group } = require('paper');
const fillUtil = require('../cncserver.drawing.fillers.util');

let settings = {};
let exportGroup = {};

// Connect to the main process, start the fill operation.
fillUtil.connect((path, settingsOverride) => {
  fillUtil.clipper.getInstance().then((clipper) => {
    settings = { ...settings, ...settingsOverride };
    exportGroup = new Group();

    let items = [];
    let increment = 0;
    const geo = fillUtil.clipper.getPathGeo(path, settings.flattenResolution);
    while (items) {
      items = fillUtil.clipper.getOffsetPaths(geo, settings.spacing + increment, clipper);
      if (items) {
        exportGroup.addChildren(items);
        increment += settings.spacing;
      }
    }

    fillUtil.finish(exportGroup);
  });
});

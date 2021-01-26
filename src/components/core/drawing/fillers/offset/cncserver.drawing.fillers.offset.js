/**
 * @file Path fill algortihm module: Export function for running the dynamic
 * "cam" style offset fill utilizing the "clipper" and cam.js libraries.
 */

const { Group } = require('paper');
const fillUtil = require('../cncserver.drawing.fillers.util');

// Connect to the main process, start the fill operation.
fillUtil.connect((path, settings) => {
  fillUtil.clipper.getInstance().then((clipper) => {
    const exportGroup = new Group();

    let items = [];
    let increment = 0;
    const geo = fillUtil.clipper.getPathGeo(path, settings.flattenResolution);
    let angle = 0;
    while (items) {
      items = fillUtil.clipper.getOffsetPaths(geo, settings.spacing + increment, clipper);
      if (items) {

        // Try to connect the shells.
        if (settings.offset.connectShells && exportGroup.lastChild && items.length === 1) {
          exportGroup.lastChild.closed = false;
          angle += 4.2;
          items[0].rotate(angle);
          items[0].segments.forEach(({ point: { x, y } }) => {
            exportGroup.lastChild.add([x, y]);
          });
        } else {
          angle += 4.2;
          items[0].rotate(angle);
          items[0].smooth();
          exportGroup.addChildren(items);
        }
        increment += settings.spacing;
      }
    }

    // TODO: Add support for settings.offset.fillGaps
    //  - Add the centerline of the last fill shape(s).

    fillUtil.finish(exportGroup);
  });
});

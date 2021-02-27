/**
 * @file Path fill algortihm module: Export function for running the dynamic
 * "cam" style offset fill utilizing the "clipper" and cam.js libraries.
 */

import Paper from 'paper';
import { connect, clipper, finish } from '../cncserver.drawing.fillers.util.js';

const { Group } = Paper;

// Connect to the main process, start the fill operation.
connect((path, { flattenResolution, spacing, offset }) => {
  clipper.getInstance().then(clipperInstance => {
    const exportGroup = new Group();

    let items = [];
    let increment = 0;
    const geo = clipper.getPathGeo(path, flattenResolution);
    let angle = 0;
    while (items) {
      items = clipper.getOffsetPaths(geo, spacing + increment, clipperInstance);
      if (items) {
        // Try to connect the shells.
        if (offset.connectShells && exportGroup.lastChild && items.length === 1) {
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
        increment += spacing;
      }
    }

    // TODO: Add support for settings.offset.fillGaps
    //  - Add the centerline of the last fill shape(s).

    finish(exportGroup);
  });
});

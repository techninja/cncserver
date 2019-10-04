/**
 * @file Trace code for drawing base.
 */
const { Rectangle } = require('paper');

module.exports = (cncserver, drawing) => {
  const trace = (path, parent = null, bounds = null) => {
    // Create compound path (or use existing) on default layer.
    const importPath = drawing.base.normalizeCompoundPath(path);

    // If bounds set, resize the path.
    if (bounds) {
      importPath.fitBounds(new Rectangle(bounds));
    }

    // Update client preview.
    cncserver.sockets.sendPaperPreviewUpdate();

    // Move through all sub-paths within the compound path. For non-compound
    // paths, this will only iterate once.
    importPath.children.forEach((subPath) => {
      const accellPoints = drawing.accell(subPath);

      // Pen up
      cncserver.pen.setPen({ state: 'up' });

      // Move to start of path, then pen down.
      cncserver.pen.setPen({ ...subPath.getPointAt(0), abs: 'mm' });
      cncserver.pen.setPen({ state: 'draw' });

      accellPoints.forEach((pos) => {
        cncserver.pen.setPen({ ...pos.point, abs: 'mm' }, null, pos.speed);
      });

      // for (let pos = 0; pos < t.length; pos += 2) {
      // console.log(t.getPointAt(pos));
      // cncserver.pen.setPen({ ...t.getPointAt(pos), abs: 'mm' });
      // }

      // Move to end of path, pen up.
      cncserver.pen.setPen({ ...subPath.getPointAt(subPath.length), abs: 'mm' });

      // If it's a closed path, overshoot back home.
      if (subPath.closed) {
        cncserver.pen.setPen({ ...subPath.getPointAt(0), abs: 'mm' });
      }

      // End with pen up.
      cncserver.pen.setPen({ state: 'up' });
    });

    // If there's no parent, clear the project after this.
    if (!parent) {
      // drawing.base.project.clear();
    }
  };

  return trace;
};

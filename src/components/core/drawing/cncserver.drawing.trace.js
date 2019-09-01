/**
 * @file Trace code for drawing base.
 */
const { Path, Rectangle } = require('paper');

module.exports = (cncserver, drawing) => {
  const trace = (path, parent = null, bounds = null) => {
    // Create path (or use existing) on default layer.
    const t = path instanceof Path ? path : new Path(path);

    // If bounds set, resize the path.
    if (bounds) {
      t.fitBounds(new Rectangle(bounds));
    }
    const accellPoints = drawing.accell(t);
    // console.log('Done!'); return;

    // Pen up
    cncserver.pen.setPen({ state: 'up' });

    // Move to start of path, pen down.
    cncserver.pen.setPen({ ...t.getPointAt(0), abs: 'mm' });
    cncserver.pen.setPen({ state: 'draw' });

    accellPoints.forEach((pos) => {
      cncserver.pen.setPen({ ...pos.point, abs: 'mm' }, null, pos.speed);
    });

    // for (let pos = 0; pos < t.length; pos += 2) {
    // console.log(t.getPointAt(pos));
    // cncserver.pen.setPen({ ...t.getPointAt(pos), abs: 'mm' });
    // }

    // Move to end of path, pen up.
    cncserver.pen.setPen({ ...t.getPointAt(t.length), abs: 'mm' });
    cncserver.pen.setPen({ state: 'up' });

    // If there's no parent, clear the project after this.
    if (!parent) {
      drawing.base.project.clear();
    }
  };

  return trace;
};

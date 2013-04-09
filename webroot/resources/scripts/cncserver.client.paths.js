/**
 * @file Holds all CNC Server path management and tracing functions
 */

cncserver.paths = {
  // Find out what DOM object is directly below the point given
  // Will NOT work if point is outside visible screen range!
  getPointPathCollide: function(point) {
    return document.elementFromPoint(
      (point.x * cncserver.canvas.scale) + cncserver.canvas.offset.left,
      (point.y * cncserver.canvas.scale) + cncserver.canvas.offset.top
    );
  }
};

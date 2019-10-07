/**
 * @file Path fill algortihm module: Node filler app for running the pattern
 * path fill (overlaying a given large space filling path over the fill object).
 */
const { Path, Group } = require('paper');
const fillUtil = require('./cncserver.drawing.fillers.util');

let viewBounds = {};
let settings = {
  overlayFillAlignPath: true,
};

function spiralOutsideBounds(spiral, bounds) {
  const spiralSize = spiral.position.getDistance(spiral.lastSegment.point);
  const boundsSize = bounds.topLeft.getDistance(bounds.bottomRight);
  return spiralSize > boundsSize;
}

// Calculate a single spiral coordinate given a distance and spacing.
function calculateSpiral(distance, spacing = 1) {
  return {
    x: spacing * distance * Math.cos(distance),
    y: spacing * distance * Math.sin(distance)
  };
}

// Make a list of points along a spiral.
function makeSpiral(turns, spacing, startOn) {
  const start = startOn ? startOn * Math.PI * 2 : 0;
  const points = [];
  const stepAngle = Math.PI / 4; // We want at least 8 points per turn

  for (let i = start; i < turns * Math.PI * 2; i += stepAngle) {
    points.push(calculateSpiral(i, spacing));
  }

  return points;
}

function generateSpiralPath() {
  // Setup the spiral:
  const spiral = new Path();

  // The spacing value is double the value in the fill settings menu
  // 10 (20 here) is the default fill spacing in the fill settings menu
  const spacing = settings.spacing / 5;

  // This is the diagonal distance of the area in which we will be filling
  // paths. We will never be filling of g.view.bounds; by ensuring the radius of the
  // spiral is larger than this distance we ensure that when we reach the end
  // of the spiral we have checked the entire printable area.
  const boundsSize = viewBounds.topLeft.getDistance(viewBounds.bottomRight);

  // Estimate the number of turns based on the spacing and boundsSize
  // Add 1 to compensate for the points we remove from the end
  let turns = Math.ceil(boundsSize / (spacing * 2 * Math.PI)) + 1;

  spiral.addSegments(makeSpiral(turns, spacing));

  while (!spiralOutsideBounds(spiral, viewBounds)) {
    spiral.addSegments(makeSpiral(turns * 2, spacing, turns));
    turns *= 2;
  }

  spiral.smooth();

  // The last few segments are not spiralular so remove them
  spiral.removeSegments(spiral.segments.length - 4);

  return spiral;
}

// Actually connect to the main process, start the fill operation.
fillUtil.connect((path, settingsOverride) => {
  fillUtil.clipper.getInstance().then((clipper) => {
    settings = { ...settings, ...settingsOverride };
    viewBounds = fillUtil.project.view.bounds;
    const exportGroup = new Group();

    const pattern = generateSpiralPath();

    // Align spiral to center by default.
    pattern.position = fillUtil.project.view.center;

    // Otherwise align to center of fill path.
    if (settings.overlayFillAlignPath) {
      pattern.position = path.position;
    }

    // Convert the paths to clipper geometry.
    const spiralGeo = fillUtil.clipper.getPathGeo(
      pattern, settings.flattenResolution / 4
    );
    const pathGeo = fillUtil.clipper.getPathGeo(path, settings.flattenResolution / 4);

    // Clip the fill pattern into the positive fill path geometry.
    const result = clipper.clipToPolyTree({
      clipType: 'intersection',
      subjectFillType: 'evenOdd',
      subjectInputs: [{ data: spiralGeo, closed: false }],
      clipInputs: [{ data: pathGeo }],
    });

    // Convert the Polytrees to paths, then to paper paths.
    const paths = clipper.polyTreeToPaths(result);
    const items = fillUtil.clipper.resultToPaths(paths, false);
    exportGroup.addChildren(items);
    fillUtil.finish(exportGroup);
  });
});

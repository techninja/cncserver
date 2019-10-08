/**
 * @file Path fill algortihm module: Node filler app for running the pattern
 * path fill (overlaying a given large space filling path over the fill object).
 */
const { Path, Group } = require('paper');
const fs = require('fs');
const path = require('path');
const fillUtil = require('./cncserver.drawing.fillers.util');

let viewBounds = {};
let settings = {
  overlayFillAlignPath: true,
  pattern: 'spiral',
  spacing: 5,
  scale: 1,
  rotation: 0,
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

function generateFromLib(name, fillPath) {
  const libPath = path.resolve(__dirname, 'patterns', `${name}.svg`);
  const svg = fs.readFileSync(libPath, 'utf8');
  const p = fillUtil.project.importSVG(svg, {
    expandShapes: true,
  });

  let root = p.children[1];
  root.scale(settings.scale);

  let pattern = root.clone();

  // With our pattern, we have to tile it along X and y until it fits the bounds of our path.
  const { bounds } = fillPath;

  // Tile till we reach the width.
  while (pattern.bounds.width < bounds.width * 1.42) {
    root.position = [
      pattern.bounds.right + root.bounds.width / 2,
      pattern.position.y,
    ];

    const extendedPattern = pattern.unite(root);
    pattern.remove();
    pattern = extendedPattern;
  }

  // Make the full width pattern the new root.
  root.remove();
  root = pattern.clone();

  // Tile till we reach the height.
  while (pattern.bounds.height < bounds.height * 1.42) {
    root.position = [
      pattern.position.x,
      pattern.bounds.bottom + root.bounds.height / 2,
    ];

    const extendedPattern = pattern.unite(root);
    pattern.remove();
    pattern = extendedPattern;
  }

  // Remove our working path, apply settings rotation, and return!
  root.remove();
  pattern.rotate(settings.rotation);
  pattern.position = fillPath.position;
  return pattern;
}

// Generate a compound path pattern
function generatePattern(name, fillPath) {
  let pattern = null;

  switch (name) {
    case 'spiral':
      pattern = generateSpiralPath();
      pattern.scale(settings.scale);
      pattern.rotate(settings.rotation);

      if (!settings.overlayFillAlignPath) {
        // Align spiral to center by default.
        pattern.position = fillUtil.project.view.center;
      } else {
        // Otherwise align to center of fill path.
        pattern.position = fillPath.position;
      }
      break;

    default:
      pattern = generateFromLib(name, fillPath);
  }

  return pattern;
}

// Actually connect to the main process, start the fill operation.
fillUtil.connect((fillPath, settingsOverride) => {
  fillUtil.clipper.getInstance().then((clipper) => {
    settings = { ...settings, ...settingsOverride };
    viewBounds = fillUtil.project.view.bounds;
    const pattern = generatePattern(settings.pattern, fillPath);

    // Convert the paths to clipper geometry.
    const spiralGeo = fillUtil.clipper.getPathGeo(
      pattern, settings.flattenResolution / 4
    );
    const pathGeo = fillUtil.clipper.getPathGeo(fillPath, settings.flattenResolution / 4);

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
    const exportGroup = new Group(items);
    fillUtil.finish(exportGroup);
  });
});

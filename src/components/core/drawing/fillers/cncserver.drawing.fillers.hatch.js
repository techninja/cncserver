/**
 * @file Path fill algortihm module:
 *   Acts as a standalone app that takes in canvas dimensions, settings, and a
 *   path definition, and returns all the lines needed to fill it.
 */
const { Path, Point, Group } = require('paper');
const fillUtil = require('./cncserver.drawing.fillers.util');

// State vars.
let fillPath = {};
let settings = {};
let cFillIndex = 0; // Keep track of which line we're working on

let lines = []; // Lines to be regrouped during fill
let cStep = 0; // Which fill step are we on?
let cSubIndex = 0; // Keep track of which sub we're working on
let lastPath = null; // The last fillpath
let cGroup = null; // The current line grouping
let exportGroup = {}; // The final output grouping of paths
let canvasBounds = {};
let viewBounds = {};
let boundPath = {};

/**
 * If any given intersections that are outside the view bounds, move them to
 * the nearest view boundary intersection.
 *
 * @param  {Paper.Path.Line} line
 *   The line to be checked.
 * @param  {array} intersections
 *   An array of intersections along the line, checked against the current
 *   view.bounds.
 *
 * @return {array}
 *   A sanity checked list of valid points within the view bounds.
 */
function checkBoundaryIntersections(line, intersections) {
  const outPoints = [];

  const canvasBoundInts = line.getIntersections(canvasBounds);
  intersections.forEach((int) => {
    // If the path intersection is out of bounds...
    if (int.point.x < viewBounds.left || int.point.x > viewBounds.right
        || int.point.y < viewBounds.top || int.point.y > viewBounds.bottom) {
      // ...and only if the line intersects the boundary of the view:
      // Pick the closest boundary point add it as the incoming point.
      if (canvasBoundInts.length) {
        outPoints.push(
          canvasBoundInts[
            fillUtil.getClosestIntersectionID(int.point, canvasBoundInts)
          ]
        );
      } else { // jshint ignore:line
        // This point is part of a line that doesn't intersect the view bounds,
        // and is outside the view bounds, therefore it is not visible.
        // Do not add it to the output set of points.
      }

      /* Though somewhat counterintuitive, this can definitely happen:
       * Given a shape that extends "far" beyond a corner or side of the view,
       * the intersection fill line never touches the canvas boundary on that
       * fill iteration, even if it properly intersects the shape.
       *
       *        / < Fill line
       *  ____/_________
       * |  / _ _ _ _ _|_ _ _ _
       * |/  | ^(0,0)  | ^ View bounds
       * |__ |_________|
       *     |
       *     |
      * */
    } else {
      outPoints.push(int);
    }
  });

  return outPoints;
}

// Run everything needed to complete dynamic line fill for a given path.
function finishFillPath() {
  cFillIndex = 0;
  cSubIndex = 0;
  cStep = 0;
  lines = [];

  // For hatch, we just go run again and skip deletion.
  if (settings.hatch === true) {
    // Start the second (last) hatch fill on the same fillpath by not
    // deleting it.
    if (!fillPath.data.lastHatch) {
      fillPath.data.lastHatch = true;
      settings.angle += 90;
      return true;
    }

    // If we're at this point, the fill path is done and we can just let it
    // continue normally.
  }
  /*
  g.state.totalSteps++;
  if (g.state.currentTraceChild !== g.state.traceChildrenMax) {
    g.state.currentTraceChild++;
  }

  if (g.mode) {
    g.mode.run('status',
      i18n.t('libs.spool.fill', {
        id: `${g.state.currentTraceChild}/${g.state.traceChildrenMax}`,
      }),
      true);
    g.mode.run('progress', g.state.totalSteps);
  }
*/
  return false;
}

// Combine lines within position similarity groupings
function groupReGroupLines() {
  // If there are none, then the first step didn't ever actually touch the
  // shape. Must be pretty small! Finish up early.
  if (!lines[0]) {
    finishFillPath();
    return false;
  }

  if (cSubIndex === 0) {
    if (!lines[cFillIndex]) {
      // console.log(cFillIndex);
    }
    if (settings.pattern === 'zigsmooth' && cGroup) {
      cGroup.simplify();
      cGroup.flatten(settings.flattenResolution);
    }

    // Before we move on, store the group in the export.
    if (cGroup) {
      exportGroup.addChild(cGroup);
    }

    [cGroup] = lines[cFillIndex];
    cSubIndex = 1;
  }

  if (typeof lines[cFillIndex][cSubIndex] !== 'undefined') {
    // Don't join lines that cross outside the path
    const v = new Path({
      segments: [
        cGroup.lastSegment.point,
        lines[cFillIndex][cSubIndex].firstSegment.point,
      ],
    });

    // console.log('ints', v.getIntersections(p).length);

    // Find a point halfway between where these lines would be connected
    // If it's not within the path, don't do it!
    // TODO: This only removes the bad outliers, may need improvement!
    const hitCount = v.getIntersections(fillPath).length;
    if (!fillPath.contains(v.getPointAt(v.length / 2)) || hitCount > 3) {
      if (settings.pattern === 'zigsmooth') {
        cGroup.simplify();
        if (cGroup.segments.length <= 1 && cGroup.closed) {
          cGroup.closed = false;
        }
        cGroup.flatten(settings.flattenResolution);
      }

      // Not contained, store the previous l & start a new grouping;
      exportGroup.addChild(cGroup);
      cGroup = lines[cFillIndex][cSubIndex];
      // console.log('Tossed!');
    } else {
      // For straight/smooth zigzag, flip the lines around before joining
      // to ensure the line tries to join to the closest side.
      if (settings.pattern === 'zigstraight' || settings.pattern === 'zigsmooth') {
        const cLine = lines[cFillIndex][cSubIndex];
        const groupPoint = cGroup.lastSegment.point;
        const lastToFirst = groupPoint.getDistance(cLine.firstSegment.point);
        const lastToLast = groupPoint.getDistance(cLine.lastSegment.point);
        if (lastToFirst > lastToLast) {
          cLine.reverse();
        }

        // Add an extra point between the two ends being connected to keep
        // smoothing from going too crazy.
        if (settings.pattern === 'zigsmooth') {
          const midPoint = groupPoint.subtract(
            groupPoint.subtract(cLine.firstSegment.point).divide(2)
          );
          cGroup.add(midPoint);
        }
      }

      // Join the current grouping and the next line
      cGroup.join(lines[cFillIndex][cSubIndex]);
    }

    // Remove our test line
    v.remove();
  }

  cSubIndex++; // Iterate subIndex

  // End of SubIndex Loop (multi)
  if (cSubIndex >= lines[cFillIndex].length) {
    cSubIndex = 0;

    cFillIndex++;
    if (cFillIndex >= lines.length) { // End of fill index loop (single)
      exportGroup.addChild(cGroup);
      return finishFillPath();
    }
  }

  return true;
}

// Initially add the lines across the item.
function addFillLines() {
  // Set start & destination based on input angle
  // Divide the length of the bound ellipse into 1 part per angle
  const amt = boundPath.length / 360;

  // Set source position to calculate iterations and create dest vector.
  let pos = amt * (settings.angle);

  // The actual line used to find the intersections
  // Ensure line is far longer than the diagonal of the object
  const line = new Path({
    segments: [
      new Point(0, 0),
      new Point(fillPath.bounds.width + fillPath.bounds.height, 0),
    ],
    position: boundPath.getPointAt(pos),
    rotation: settings.angle - 90,
  });

  // Find destination position on other side of circle
  pos = settings.angle + 180; if (pos > 360) pos -= 360;
  const len = Math.min(boundPath.length, pos * amt);
  const destination = boundPath.getPointAt(len);

  if (!destination) {
    console.table({
      bplen: boundPath.length, pos, amt, ang: settings.angle,
    });
  }

  // Find vector and length divided by line spacing to get # iterations.
  const vector = destination.subtract(line.position);
  const iterations = parseInt(vector.length / settings.spacing, 10);

  // Move the line by a stefillPath.
  line.position = line.position.add(
    vector.divide(iterations).multiply(cFillIndex)
  );

  // Move through calculated iterations for given spacing
  const ints = checkBoundaryIntersections(line, line.getIntersections(fillPath));

  if (ints.length % 2 === 0) { // If not dividable by 2, we don't want it!
    for (let x = 0; x < ints.length; x += 2) {
      const groupingID = findLineFillGroup(
        ints[x].point,
        lines,
        settings.threshold
      );

      const y = new Path({
        segments: [ints[x].point, ints[x + 1].point],
        strokeColor: fillPath.fillColor, // Will become fill color
        data: { color: fillPath.data.color, name: fillPath.data.name, type: 'fill' },
        miterLimit: 40,
        strokeJoin: 'round',
      });

      // Make Water preview paths blue and transparent
      if (y.data.color === 'water2') {
        y.strokeColor = '#256d7b';
        y.opacity = 0.5;
      }

      if (!lines[groupingID]) lines[groupingID] = [];
      lines[groupingID].push(y);
    }
  }

  cFillIndex++;

  // Num of iterations reached? Move to the next step & reset fillIndex
  if (cFillIndex === iterations) {
    cStep++;
    cFillIndex = 0;
    cSubIndex = 0;
    // g.state.totalSteps++;
  }

  // Clean up our helper paths
  line.remove();
}


// Attempt to find the correct grouping for given line fills.
function findLineFillGroup(testPoint, lines, newGroupThresh) {
  // If we don't have any groups yet.. return 0
  if (lines.length === 0) {
    return 0;
  }

  // 1. We go in order, which means the first segment point of the last
  //    line in each group is the one to check distance against
  // 2. Compare each, use the shortest...
  // 3. ...unless it's above the new group threshold, then return a group id

  let bestDistance = newGroupThresh;
  let groupID = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i][lines[i].length - 1];
    const dist = line.firstSegment.point.getDistance(testPoint);

    if (dist < bestDistance) {
      groupID = i;
      bestDistance = dist;
    }
  }

  // Check if we went over the threshold, make a new group!
  if (bestDistance === newGroupThresh) {
    groupID = lines.length;
  }

  return groupID;
}

// Dyanamic line fill iterative function (called from traceFillNext)
function dynamicLineFillNext() {
  // 1. Assume line is ALWAYS bigger than the entire object
  // 2. If filled path, number of intersections will ALWAYS be multiple of 2
  // 3. Grouping pairs will always yield complete line intersections.

  // Run once per unique fillPath
  if (lastPath !== fillPath) {
    lastPath = fillPath;

    // Swap angle for random angle if randomizeAngle set.
    if (settings.randomizeAngle && !fillPath.data.randomAngleSet) {
      fillPath.data.randomAngleSet = true;
      settings.angle = Math.ceil(Math.random() * 179);
    }
  }

  // Choose the iteration fill step
  switch (cStep) {
    case 0: // Adding initial fill lines
      addFillLines();
      return true;

      break;
    case 1: // Grouping and re-grouping the lines
      // console.dir(lines);
      return groupReGroupLines();
      break;

    default:
      return false;
  }

  /* if (g.mode) {
    g.mode.run('progress', g.state.totalSteps);
  } */
  // return true;
}

// Actually connect to the main process, start the fill operation.
fillUtil.connect((path, settingsOverride) => {
  settings = { ...settings, ...settingsOverride };
  fillPath = path;
  viewBounds = fillUtil.project.view.bounds;
  exportGroup = new Group();

  // Init boundpath and traversal line
  // The path drawn around the object the line traverses
  boundPath = new Path.Ellipse({
    center: path.position,
    size: [path.bounds.width * 2, path.bounds.height * 2],
  });

  // Init canvas boundary line to intersect if beyond the printable area.
  canvasBounds = new Path.Rectangle({
    from: [0, 0],
    to: [viewBounds.width, viewBounds.height],
  });

  while (dynamicLineFillNext()) {
    // console.log('*');
  }

  fillUtil.finish(exportGroup);
});

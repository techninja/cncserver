/**
 * @file Draw preview Tool definitions.
 */
/* globals paper */

const { Path, CompoundPath, Group, Point, Rectangle } = paper;
const tool = new paper.Tool();
let selectRect;
let path;
let selectChangeOnly;
let marquee;

function deselect() {
  if (paper.selectRect) {
    // Completely deselect sub paths
    selectRect.ppaths.forEach(ppath => {
      ppath.selected = false;
      ppath.fullySelected = false;
    });

    selectRect.remove();
    selectRect = null;
  }
}

function select(path) {
  deselect();

  // Ensure we're selecting the right path.
  path = ensureSelectable(path, true);
  if (!path) return;

  const reset =
    path.rotation === 0 && path.scaling.x === 1 && path.scaling.y === 1;
  let bounds;

  if (reset) {
    // Actually reset bounding box
    bounds = path.bounds;
    path.pInitialBounds = path.bounds;
  } else {
    // No bounding box reset
    bounds = path.pInitialBounds ? path.pInitialBounds : path.bounds;
  }

  const b = bounds.clone().expand(10, 10);

  selectRect = new Path.Rectangle(b);
  selectRect.pivot = selectRect.position;
  selectRect.insert(2, new Point(b.center.x, b.top));
  selectRect.insert(2, new Point(b.center.x, b.top - 25));
  selectRect.insert(2, new Point(b.center.x, b.top));

  if (!reset) {
    selectRect.position = path.bounds.center;
    selectRect.rotation = path.rotation;
    selectRect.scaling = path.scaling;
  }

  selectRect.strokeWidth = 2;
  selectRect.strokeColor = 'blue';
  selectRect.name = 'selection rectangle';
  selectRect.selected = true;
  selectRect.ppath = path;
  selectRect.ppaths = [path];
  selectRect.ppath.pivot = selectRect.pivot;
}

// Make sure the passed path is selectable, returns null, the path (or parent)
function ensureSelectable(path, skipType) {
  // Falsey passed? Can't select that.
  if (!path) {
    return null;
  }

  // Is a child of a compound path? Select the parent.
  if (path.parent instanceof CompoundPath) {
    path = path.parent;
  }

  // Is a part of the overlay? Don't select that!
  if (path.layer.name === 'overlay') {
    return null;
  }

  console.log('Check path...', path);

  if (!skipType) {
    // Not a path or compound path? Can't select that.
    if (!(path instanceof Path) && !(path instanceof CompoundPath)) {
      return null;
    }
  }

  // If we have a selection...
  if (selectRect) {
    // Is the same path as the select rectangle? Can't select that.
    if (path === selectRect) {
      return null;
    }

    // Already selected? Can't select it.
    if (selectRect.ppaths.indexOf(path) !== -1) {
      return null;
    }
  }

  return path;
}

function getBoundSelection(point, ignoreSelectRect) {
  // Check for items that are overlapping a rect around the event point
  const items = paper.project.getItems({
    overlapping: new Rectangle(
      point.x - 2,
      point.y - 2,
      point.x + 2,
      point.y + 2
    ),
  });

  let selectedItem = null;
  items.forEach(item => {
    if (ignoreSelectRect) {
      if (item === selectRect) return; // Don't select select rect.
    }

    // TODO: Prioritize selection of paths completely inside of other paths
    if (item instanceof Path) {
      if (item.contains(point)) {
        selectedItem = item;
      }
    }
  });

  // If we're ignoring the select Rect, we want only somehting selctable.
  if (ignoreSelectRect) {
    return ensureSelectable(selectedItem);
  }
  return selectedItem;
}

function selectTestResult(event, options) {
  const hitOptions = {
    segments: true,
    stroke: true,
    fill: true,
    tolerance: 5,

    ...options,
  };

  let hitResult = paper.project.hitTest(event.point, hitOptions);

  // If we didn't hit anything with hitTest...
  if (!hitResult) {
    // Find any items that are Paths (not layers) that contain the point
    const item = getBoundSelection(event.point);

    // If we actually found something, fake a fill hitResult
    if (item) {
      hitResult = {
        type: 'bounds',
        item,
      };
    } else {
      return false;
    }
  }

  // From this point on, we must have clicked something.
  const path = hitResult.item;

  console.log('It\'s on ', path.layer.name);

  // Figure out useful selection state switches:
  hitResult.pickingSelectRect = false;
  hitResult.multiSelect = false;
  hitResult.itemSelected = false;
  hitResult.hasSelection = false;
  hitResult.insideItem = null;
  hitResult.insideItemSelected = false;

  if (selectRect) {
    const { ppaths } = selectRect;
    hitResult.hasSelection = true;
    hitResult.multiSelect = ppaths.length > 1;
    hitResult.itemSelected = ppaths.indexOf(path) > -1;
    hitResult.pickingSelectRect = selectRect === path;

    // If we're selecting the selectRect via bounds, try to find an item a
    // user might be trying to select inside of it.
    hitResult.insideItem = getBoundSelection(event.point, true);
    hitResult.insideItemSelected = ppaths.indexOf(hitResult.insideItem) > -1;

    // If not picking select rect and no inside item, default to current.
    if (!hitResult.insideItem && !hitResult.pickingSelectRect) {
      hitResult.insideItem = hitResult.item;
      hitResult.insideItemSelected = hitResult.itemSelected;
    }
  }

  return hitResult;
}

tool.name = 'tools.select';
tool.key = 'select';
tool.cursorOffset = '1 1'; // Position for cursor point

tool.onMouseDown = event => {
  const clickResult = selectTestResult(event);

  // Finish early and deselect if we didn't click anything.
  if (!clickResult) {
    // If we're pressing shift, don't deselect.
    if (!event.modifiers.shift) {
      deselect();
    }

    console.log('Nothing!');
    // Not selecting anything, create marquee!
    /* marquee = new Path.Rectangle({
      point: event.point,
      size: [1, 1],
      strokeColor: 'white',
      strokeWidth: 3,
      dashArray: [10, 4],
    }); */
    return;
  }

  path = clickResult.item;

  // Clicking one of the selection modifier hitbox nodes:
  if (clickResult.pickingSelectRect && clickResult.type === 'segment') {
    if (clickResult.segment.index >= 2 && clickResult.segment.index <= 4) {
      // Rotation hitbox
      //selectionRectangleRotation = 0;
      console.log('Rotate');
    } else {
      // Scale hitbox
      console.log('Scale');
      //var center = event.point.subtract(paper.selectRect.bounds.center);
      //selectionRectangleScale = center.length / path.scaling.x;
      //lastScaleRatio = 1;
    }
  }

  // If pressing shift, try to look for paths inside of selection.
  if (event.modifiers.shift) {
    if (!clickResult.insideItemSelected) {
      selectChangeOnly = true;
      //addToSelection(clickResult.insideItem);
    } else {
      selectChangeOnly = true;
      //removeFromSelection(clickResult.insideItem);
    }
  } else if (!clickResult.itemSelected && !clickResult.pickingSelectRect) {
    selectChangeOnly = true;
    select(path);
  }
};

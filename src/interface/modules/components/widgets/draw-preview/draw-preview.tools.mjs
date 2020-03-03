/**
 * @file Draw preview Tool definitions.
 */
/* globals paper */

const { Path, Point, Rectangle } = paper;
let selectRect;

// Deselect/destroy the selection rectangle.
function deselect() {
  if (selectRect) {
    // Completely deselect sub paths
    selectRect.ppaths.forEach((ppath) => {
      ppath.selected = false;
      ppath.fullySelected = false;
    });

    selectRect.remove();
    selectRect = null;
  }
}

// Create a selection rectangle with handles.
function select(item) {
  deselect();

  // Ensure we're selecting the right path.
  // ensureSelectable(item, true);
  if (!item) {
    return;
  }

  const reset = item.rotation === 0 && item.scaling.x === 1 && item.scaling.y === 1;
  let { bounds } = item;

  if (reset) {
    // Actually reset bounding box
    item.pInitialBounds = item.bounds;
  } else {
    // No bounding box reset
    bounds = item.pInitialBounds ? item.pInitialBounds : item.bounds;
  }

  const b = bounds.clone();

  paper.project.layers.overlay.activate();
  selectRect = new Path.Rectangle(b);
  selectRect.pivot = selectRect.position;

  // Add center position points.
  selectRect.insert(2, new Point(b.center.x, b.top));
  selectRect.insert(4, new Point(b.right, b.center.y));
  selectRect.insert(6, new Point(b.center.x, b.bottom));
  selectRect.insert(1, new Point(b.left, b.center.y));

  // Store name of item.
  selectRect.itemName = item.name;

  if (!reset) {
    selectRect.position = item.bounds.center;
    selectRect.rotation = item.rotation;
    selectRect.scaling = item.scaling;
  }

  selectRect.strokeWidth = 1;
  selectRect.strokeColor = 'black';
  selectRect.opacity = 0.7;
  selectRect.dashArray = [10, 4];
  selectRect.name = 'selection rectangle';
  selectRect.selected = true;
  selectRect.ppath = item;
  selectRect.ppaths = [item];
  selectRect.ppath.pivot = selectRect.pivot;
}

// Set the overall paper cursor via style adjustment.
function setCursor(name) {
  paper.view.element.style.cursor = name;
}

/**
 * Move up the heirarchy to find the parent level item at the layer level.
 *
 * @param { Paper.* } item
 *   Paper item from hitResult.
 *
 * @returns
 *   Item at the top level (Paper.Group if on stage).
 */
function getLayerParent(item) {
  if (!item) {
    return null;
  }

  if (item.parent instanceof paper.Layer) {
    return item;
  }

  return getLayerParent(item.parent);
}

// Test to see if we have a selection.
function testSelect(point, options = {}) {
  const hitOptions = {
    segments: true,
    stroke: true,
    fill: true,
    tolerance: 5,
    layer: 'stage',

    ...options,
  };

  const hitResult = paper.project.layers[hitOptions.layer].hitTest(point, hitOptions);

  // If we didn't hit anything with hitTest...
  if (!hitResult) {
    return null;
  }

  // From this point on, we must have clicked something.
  const { item } = hitResult;

  hitResult.layerParent = getLayerParent(item);

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
    hitResult.itemSelected = ppaths.indexOf(item) > -1;
    hitResult.pickingSelectRect = selectRect === item;

    // If we're selecting the selectRect via bounds, try to find an item a
    // user might be trying to select inside of it.
    // hitResult.insideItem = getBoundSelection(point, true);
    // hitResult.insideItemSelected = ppaths.indexOf(hitResult.insideItem) > -1;

    // If not picking select rect and no inside item, default to current.
    if (!hitResult.insideItem && !hitResult.pickingSelectRect) {
      hitResult.insideItem = hitResult.item;
      hitResult.insideItemSelected = hitResult.itemSelected;
    }
  }

  return hitResult;
}

/**
 * Figure out what kind of resize/rotate state we should be in given a box and
 * a point relative to that box.
 *
 * @param {Paper.Rectangle} b
 *   Rectangle that defines the dynabox bounds.
 * @param {Paper.Point} point
 *   Point to check against.
 *
 * @returns {String | null}
 *   String matching the css cursor, or null if not applicable.
 */
function getDynaboxState(b, point) {
  let state = null;
  const m = 10;
  const h = m / 2;

  // List of targets keyed by identifier.
  const targets = {
    move: b,
    'nw-resize': new Rectangle(b.left - h, b.top - h, m, m),
    'ne-resize': new Rectangle(b.right - h, b.top - h, m, m),
    'sw-resize': new Rectangle(b.left - h, b.bottom - h, m, m),
    'se-resize': new Rectangle(b.right - h, b.bottom - h, m, m),
    'n-resize': new Rectangle(b.left + h, b.top - h, b.width - m, m),
    's-resize': new Rectangle(b.left + h, b.bottom - h, b.width - m, m),
    'e-resize': new Rectangle(b.right - h, b.top + h, m, b.height - m),
    'w-resize': new Rectangle(b.left - h, b.top + h, m, b.height - m),
  };

  // Select target key based on box contain.
  Object.entries(targets).forEach(([target, box]) => {
    if (box.contains(point)) {
      state = target;
    }
  });

  return state;
}

// Adjust dynabox based on state.
function setDynaboxAdjust(item, state, delta) {
  switch (state) {
    case 'move':
      item.position = item.position.add(delta);
      break;

    case 'n-resize':
      selectRect.scale(1, 1 - delta.y / item.bounds.height, item.bounds.bottomCenter);
      break;

    case 's-resize':
      selectRect.scale(1, 1 + delta.y / item.bounds.height, item.bounds.topCenter);
      break;

    case 'e-resize':
      selectRect.scale(1 + delta.x / item.bounds.width, 1, item.bounds.leftCenter);
      break;

    case 'w-resize':
      selectRect.scale(1 - delta.x / item.bounds.width, 1, item.bounds.rightCenter);
      break;

    case 'nw-resize':
      selectRect.scale(
        1 - delta.x / item.bounds.width,
        1 - delta.y / item.bounds.height,
        item.bounds.bottomRight
      );
      break;

    case 'ne-resize':
      selectRect.scale(
        1 + delta.x / item.bounds.width,
        1 - delta.y / item.bounds.height,
        item.bounds.bottomLeft
      );
      break;

    case 'sw-resize':
      selectRect.scale(
        1 - delta.x / item.bounds.width,
        1 + delta.y / item.bounds.height,
        item.bounds.topRight
      );
      break;

    case 'se-resize':
      selectRect.scale(
        1 + delta.x / item.bounds.width,
        1 + delta.y / item.bounds.height,
        item.bounds.topLeft
      );
      break;


    default:
      break;
  }
}

// Force a standard rectangle path to batch a bounds rect.
function matchRectToBounds({ bounds }, dest) {
  dest.segments[0].point = bounds.bottomLeft;
  dest.segments[1].point = bounds.topLeft;
  dest.segments[2].point = bounds.topRight;
  dest.segments[3].point = bounds.bottomRight;
}

// Respect boundaries.
function respectWorkArea(workArea) {
  if (selectRect.bounds.left < workArea.left) {
    selectRect.pivot = selectRect.bounds.topLeft;
    selectRect.position.x = workArea.left;
  }

  if (selectRect.bounds.top < workArea.top) {
    selectRect.pivot = selectRect.bounds.topLeft;
    selectRect.position.y = workArea.top;
  }

  if (selectRect.bounds.right > workArea.right) {
    selectRect.pivot = selectRect.bounds.bottomRight;
    selectRect.position.x = workArea.right;
  }

  if (selectRect.bounds.bottom > workArea.bottom) {
    selectRect.pivot = selectRect.bounds.bottomRight;
    selectRect.position.y = workArea.bottom;
  }

  selectRect.pivot = selectRect.bounds.center;
}

// Default export, initialize all tools.
export default function initTools(host) {
  const tool = new paper.Tool();
  let lockState = null;

  tool.name = 'tools.select';
  tool.key = 'select';
  tool.cursorOffset = '1 1'; // Position for cursor point

  // Catch layer changes, just deselect.
  host.addEventListener('layerchange', () => {
    deselect();
  });

  // Catch layer updates: attempt to re-select.
  host.addEventListener('layerupdate', ({ detail: { layer } }) => {
    if (selectRect && layer === 'stage') {
      const hash = selectRect.itemName;
      select(host.layers.stage.children[hash]);
    }
  });

  // Click to select/deselect.
  tool.onMouseDown = (event) => {
    const scaledPoint = event.point.multiply(1 / host.scale);
    const hitResult = testSelect(scaledPoint);

    if (hitResult) {
      select(hitResult.layerParent);
      const state = getDynaboxState(selectRect.bounds, scaledPoint);
      lockState = state;
      setCursor(state);
    } else {
      deselect();
    }
  };


  // Hover state.
  tool.onMouseMove = (event) => {
    const scaledPoint = event.point.multiply(1 / host.scale);

    if (selectRect) {
      setCursor(getDynaboxState(selectRect.bounds, scaledPoint));
    } else {
      setCursor('');
    }
  };

  // Clicking and dragging with delta.
  tool.onMouseDrag = (event) => {
    const scaledPoint = event.point.multiply(1 / host.scale);
    const scaledDelta = event.delta.multiply(1 / host.scale);
    // const scaledDownPoint = event.downPoint.multiply(1 / host.scale);

    // If we have a selection...
    if (selectRect && lockState) {
      setDynaboxAdjust(selectRect, lockState, scaledDelta);

      // TODO: Add support for moving existing selection without being on object.

      respectWorkArea(host.workArea);

      // Manage the contained object.
      if (lockState === 'move') {
        // Move it to match.
        selectRect.ppath.position = selectRect.position;
      } else {
        // Scale the item.
        selectRect.ppath.children.content.fitBounds(selectRect.bounds);
        matchRectToBounds(selectRect, selectRect.ppath.children.bounds);
        matchRectToBounds(selectRect.ppath.children.content, selectRect.ppath.children['content-bounds']);
      }
    }
  };

  tool.onMouseUp = (event) => {
    // TODO: Send update to server after a bounds update.
    lockState = null;
  };
}

/**
 * @file Drawing base code used by other drawing utils.
 */
const {
  Point, Size, Project, Rectangle, Group, Path, CompoundPath, Layer,
} = require('paper');

// Central drawing base export
const base = { id: 'drawing.base' };

module.exports = (cncserver) => {
  base.project = {};

  cncserver.binder.bindTo('controller.setup', base.id, () => {
    const { settings: { bot } } = cncserver;
    console.log(bot);
    // Setup the project with the max cavas size in mm.
    base.size = new Size(bot.maxAreaMM.width, bot.maxAreaMM.height);

    // Setup the actual printable work space as a rectangle.
    base.workspace = new Rectangle({
      from: [bot.workAreaMM.left, bot.workAreaMM.top],
      to: [bot.workAreaMM.right, bot.workAreaMM.bottom],
    });

    base.project = new Project(base.size);

    // Setup layers: temp, working
    // Whatever the last layer added was, will be default.
    base.layers = {
      import: new Layer(),
      temp: new Layer(),
      preview: new Layer(),
    };
  });

  // Clear preview canvas on cancel/clear.
  cncserver.binder.bindTo('buffer.clear', base.id, () => {
    base.layers.preview.removeChildren();
    cncserver.sockets.sendPaperPreviewUpdate();
  });

  // Get a list of all simple paths from all children as an array.
  base.getPaths = (parent = base.layers.preview, items = []) => {
    if (parent.children && parent.children.length) {
      let moreItems = [];
      parent.children.forEach((child) => {
        moreItems = base.getPaths(child, moreItems);
      });
      return [...items, ...moreItems];
    }
    return [...items, parent];
  };

  // Get a default bound for high level drawings.
  base.defaultBounds = (margin = 10) => new Rectangle({
    point: [margin, margin],
    size: [base.workspace.width - margin * 2, base.workspace.height - margin * 2],
  });

  // Get the snapped stroke color ID of an item through its parentage.
  base.getColorID = (item) => {
    if (item.data.colorID) return item.data.colorID;
    if (item.parent) return base.getColorID(item.parent);
    return null;
  };

  // Offset any passed bounds to fit within the workspace.
  base.fitToWorkspace = (bounds) => {
    const adjBounds = bounds.clone();

    // No negative bounds positions.
    if (adjBounds.point.x < 0) adjBounds.point.x = 0;
    if (adjBounds.point.y < 0) adjBounds.point.y = 0;

    // Offset for top/left workspaces.
    adjBounds.point = adjBounds.point.add(base.workspace);

    return adjBounds;
  };

  // Fit the given item within either the drawing bounds, or custom one.
  base.fitBounds = (item, rawBounds) => {
    let bounds = rawBounds;

    if (!bounds) {
      bounds = base.defaultBounds();
    } else if (!(bounds instanceof Rectangle)) {
      bounds = new Rectangle(bounds);
    }

    bounds = base.fitToWorkspace(bounds);

    item.fitBounds(bounds);
    return bounds;
  };

  // Get the position of item via anchor from relative offset EG {x:0, y:-1}
  base.getAnchorPos = (item, anchor, relative = true) => {
    const { bounds } = item;
    const halfW = bounds.width / 2;
    const halfH = bounds.height / 2;
    let center = { x: 0, y: 0 };

    if (!relative) {
      center = bounds.center;
    }

    return new Point({
      x: center.x + (halfW * anchor.x),
      y: center.y + (halfH * anchor.y),
    });
  };

  // Set the position of item via anchor from relative offset EG {x:0, y:-1}
  base.setPosFromAnchor = (item, position, anchor) => {
    const offset = base.getAnchorPos(item, anchor);

    item.position = position.subtract(offset);
  };

  // Return true if the layer contains any groups at the top level
  base.layerContainsGroups = (layer = base.project.activeLayer) => {
    for (const i in layer.children) {
      if (layer.children[i] instanceof Group) return true;
    }
    return false;
  };

  // Ungroup any groups recursively
  base.ungroupAllGroups = (layer = base.project.activeLayer) => {
    // Remove all groups
    while (base.layerContainsGroups(layer)) {
      layer.children.forEach((path) => {
        if (path instanceof Group) {
          path.parent.insertChildren(0, path.removeChildren());
          path.remove();
        }
      });
    }
  };

  // Standardize path names to ensure everything has one.
  base.setName = (item) => {
    // eslint-disable-next-line no-param-reassign
    item.name = item.name || `draw_path_${item.id}`;
    return item;
  };

  // Simple helper to check if the path is one of the parsable types.
  base.isDrawable = item => item instanceof Path || item instanceof CompoundPath;

  // Normalize a 'd' string, JSON or path input into a compound path.
  base.normalizeCompoundPath = (importPath) => {
    let path = importPath;

    // Attempt to detect 'd' string or JSON import.
    if (typeof path === 'string') {
      if (path.includes('{')) {
        // If this fails the paper error will bubble up to the implementor.
        path = cncserver.drawing.base.layers.temp.importJSON(path);
      } else {
        // D string, create the compound path directly
        return base.setName(new CompoundPath(path));
      }
    }

    // If the passed object already is compounnd, return it directly.
    if (path instanceof CompoundPath) {
      return base.setName(path);
    }

    // Standard path, create a compound path from it.
    return base.setName(new CompoundPath({
      children: [path],
      fillColor: path.fillColor,
      strokeColor: path.strokeColor,
    }));
  };

  // Check if a fill/stroke color is "real".
  // Returns True if not null or fully transparent.
  base.hasColor = (color) => {
    if (!color) {
      return false;
    }
    return color.alpha !== 0;
  };

  // Takes a layer, and cleans up all the immediate children to verify they have
  // either: Stroke with no fill, stroke with fill (closed), fill only.
  // Removes or fixes all paths that don't fit here.
  base.cleanupInput = (layer, fillStroke = false) => {
    const { hasColor } = base;
    base.removeNonPaths(layer);

    const kids = [...layer.children];
    kids.forEach((item) => {
      const { name } = item;

      // Maybe a fill?
      if (hasColor(item.fillColor)) {
        console.log('Fill', item.name, item.fillColor.toCSS());
        item.closed = true;
        item.fillColor.alpha = 1;

        // Has a stroke?
        if (hasColor(item.strokeColor) || item.strokeWidth) {
          if (!hasColor(item.strokeColor)) {
            item.strokeColor = item.fillColor || 'black';
            item.strokeColor.alpha = 1;
          }
          if (!item.strokeWidth) {
            item.strokeWidth = 1;
          }
        } else if (fillStroke) {
          // Add a stroke to fills if requested.
          console.log('Adding stroke to fill', item.name, item.fillColor.toCSS());
          item.strokeColor = item.fillColor;
          item.strokeWidth = 1;
        }
      } else if (hasColor(item.strokeColor) || item.strokeWidth) {
        if (!hasColor(item.strokeColor)) {
          item.strokeColor = item.fillColor || 'black';
        } else {
          item.strokeColor.alpha = 1;
        }

        if (!item.strokeWidth) {
          item.strokeWidth = 1;
        }
      } else {
        console.log('Removing No fill/stroke', item.name);
        item.remove();
      }
    });
  };

  base.setPathOption = (path, options) => {
    Object.entries(options).forEach(([key, value]) => {
      path[key] = value;
    });
  };

  // Prepare a layer to remove anything that isn't a fill.
  base.cleanupFills = (tmp) => {
    const kids = [...tmp.children];
    kids.forEach((path) => {
      if (!base.hasColor(path.fillColor)) {
        path.remove();
      } else {
        // Bulk set path options.
        base.setPathOption(path, {
          closed: true,
          strokeWidth: 0,
          strokeColor: null,
        });
      }
    });
  };

  // At this point, simply removing anything that isn't a path.
  base.removeNonPaths = (layer = base.project.activeLayer) => {
    // If you modify the child list, you MUST operate on a COPY
    const kids = [...layer.children];
    kids.forEach((path) => {
      if (!base.isDrawable(path)) {
        path.remove();
      } else if (!path.length) {
        path.remove();
      } else {
        base.setName(path);
      }
    });
  };


  return base;
};

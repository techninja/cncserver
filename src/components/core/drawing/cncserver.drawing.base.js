/**
 * @file Drawing base code used by other drawing utils.
 */
const {
  Point, Size, Project, Group, Path, CompoundPath,
} = require('paper');

// Central drawing base export
const base = {};

module.exports = (cncserver) => {
  base.project = {};

  cncserver.binder.bindTo('controller.setup', 'drawing.base', () => {
    const { settings: { bot } } = cncserver;
    // Setup the project with the base cavas size in mm.
    base.size = new Size(
      bot.workArea.width / bot.stepsPerMM.x,
      bot.workArea.height / bot.stepsPerMM.y
    );

    base.project = new Project(base.size);
  });

  // Get a list of all simple paths from all children as an array.
  base.getPaths = (parent, items = []) => {
    if (parent.children && parent.children.length) {
      let moreItems = [];
      parent.children.forEach((child) => {
        moreItems = base.getPaths(child, moreItems);
      });
      return [...items, ...moreItems];
    }
    return [...items, parent];
  };

  // Fit the given item within either the drawing bounds, or custom one.
  base.fitBounds = (item, bounds, margin = 20) => {
    // TODO: figure out good way to default fit bounds.
    if (!bounds) {
      item.fitBounds({
        from: [margin, margin],
        to: [base.size.width - margin, base.size.height - margin],
      });
    } else {
      item.fitBounds(bounds);
    }
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

  // Normalize a string or path input into a compound path.
  base.normalizeCompoundPath = (importPath) => {
    if (importPath instanceof CompoundPath) {
      return base.setName(importPath);
    }

    return base.setName(new CompoundPath(importPath));
  };

  // At this point, simply removing anything that isn't a path.
  base.removeNonPaths = (layer = base.project.activeLayer) => {
    // If you modify the child list, you MUST operate on a COPY
    const kids = [...layer.children];
    kids.forEach((path) => {
      if (!base.isDrawable(path)) {
        path.remove();
      } else {
        base.setName(path);
      }
    });
  };


  return base;
};

/**
 * @file Drawing base code used by other drawing utils.
 */
const { Point, Size, Project } = require('paper');

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

  return base;
};

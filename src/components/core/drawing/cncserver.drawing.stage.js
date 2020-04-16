/**
 * @file Code for drawing stage layer management.
 */
const { Group, Path } = require('paper');

const stage = { id: 'drawing.stage' };

module.exports = (cncserver, drawing) => {
  const { layers } = drawing.base;

  // Default projects settings.
  stage.defaultSettings = () => ({
    // TODO
  });

  // Clear all items off the stage and update.
  stage.clearAll = () => {
    layers.stage.removeChildren();
    cncserver.sockets.sendPaperUpdate('stage');
  };

  // Remove an item from the stage, returns true if it worked.
  stage.remove = (hash) => {
    if (layers.stage.children[hash]) {
      layers.stage.children[hash].remove();
      return true;
    }
    return false;
  };

  // Get a full preview SVG of the stage layer content.
  stage.getPreviewSVG = () => {
    // Hide bounds rects.
    stage.toggleRects(false);

    const svgContent = layers.stage.exportSVG({ asString: true });

    // Show bounds rects.
    stage.toggleRects(true);

    return cncserver.utils.wrapSVG(svgContent);
  };

  // Toggle the visibility of the bound rects.
  stage.toggleRects = (state) => {
    layers.stage.children.forEach((group) => {
      group.children.bounds.opacity = state ? 1 : 0;
      group.children['content-bounds'].opacity = state ? 1 : 0;
    });
  };

  // Import an imported paper item into the stage layer.
  stage.import = (importItem, hash, bounds) => {
    const finalBounds = drawing.base.fitBounds(importItem, bounds);

    // console.log(importItem);
    // console.log(importItem.bounds);

    // If an existing item with a matching hash exists, remove it first.
    stage.remove(hash);

    // Build a group with the name/id of the hash, containing the content and a
    // path rectangle matching the bounds.

    // eslint-disable-next-line no-param-reassign
    importItem.name = 'content';
    layers.stage.addChild(
      new Group({
        name: hash,
        children: [
          new Path.Rectangle({
            name: 'bounds',
            point: finalBounds.point,
            size: finalBounds.size,
            strokeWidth: 1,
            strokeColor: 'green',
            dashArray: [2, 2],
          }),
          new Path.Rectangle({
            name: 'content-bounds',
            point: importItem.bounds.point,
            size: importItem.bounds.size,
            strokeWidth: 1,
            strokeColor: 'red',
            opacity: 0.5,
            dashArray: [2, 2],
          }),
          importItem,
        ],
      })
    );
    cncserver.sockets.sendPaperUpdate('stage');
    return importItem;
  };

  // Update an item on the stage with its action item.
  stage.updateItem = (item) => {
    // Update bounds.
    const stageGroup = layers.stage.children[item.hash];
    if (stageGroup) {
      return stage.import(stageGroup.children.content, item.hash, item.bounds);
    }
  };

  return stage;
};

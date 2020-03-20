/**
 * @file Code for drawing stage layer management.
 */
const { Group, Path } = require('paper');

const stage = { id: 'drawing.stage' };

module.exports = (cncserver, drawing) => {
  // Default projects settings.
  stage.defaultSettings = () => ({
    // TODO
  });

  // Remove an item from the stage, returns true if it worked.
  stage.remove = (hash) => {
    if (drawing.base.layers.stage.children[hash]) {
      drawing.base.layers.stage.children[hash].remove();
      return true;
    }
    return false;
  };

  // Import an imported paper item into the stage layer.
  stage.import = (importItem, hash, bounds) => {
    const finalBounds = drawing.base.fitBounds(importItem, bounds);

    // If an existing item with a matching hash exists, remove it first.
    stage.remove(hash);

    // Build a group with the name/id of the hash, containing the content and a
    // path rectangle matching the bounds.
    importItem.name = 'content';
    const newStageItem = drawing.base.layers.stage.addChild(
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
    return newStageItem;
  };

  // Update an item on the stage with its action item.
  stage.updateItem = (item) => {
    // Update bounds.
    const stageGroup = drawing.base.layers.stage.children[item.hash];
    if (stageGroup) {
      return stage.import(stageGroup.children.content, item.hash, item.bounds);
    }
  };

  // Render a linked object to the preview canvas from stage.
  stage.renderToPreview = (specificHash = null) => {
    // Clear out preview.
    drawing.base.layers.preview.removeChildren();
    cncserver.sockets.sendPaperUpdate('preview');

    // Render each item.
    // TODO: Render specifically passed hash.
    drawing.base.layers.stage.children.forEach((item) => {
      const hash = item.name;
      const actionItem = cncserver.actions.getItem(hash);
      cncserver.actions.addItem({
        body: item.children.content.clone({ insert: false }),
        name: `${item.name}-render`,
        type: 'project',
        operation: 'full',
        bounds: item.bounds,
        settings: actionItem.settings,
      });
    });
  };

  return stage;
};

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

  // Import an imported paper item into the stage layer.
  stage.import = (importItem, hash, bounds) => {
    const finalBounds = drawing.base.fitBounds(importItem, bounds);

    // Build a group with the name/id of the hash, containing the content and a
    // path rectangle matching the bounds.
    importItem.name = 'content';
    drawing.base.layers.stage.addChild(
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
  };

  // Render a linked object to the preview canvas from stage.
  stage.render = (hash) => {
    // TODO
  };

  return stage;
};

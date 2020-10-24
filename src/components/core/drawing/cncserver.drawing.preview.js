/**
 * @file Code for drawing preview/render layer management.
 */
/* eslint-disable implicit-arrow-linebreak */
const { Group } = require('paper');

const preview = { id: 'drawing.preview' };

module.exports = (cncserver, drawing) => {
  const { layers } = drawing.base;

  // Clear all items off the preview and update.
  preview.clearAll = () => {
    layers.preview.removeChildren();
    cncserver.sockets.sendPaperUpdate('preview');
  };

  // Remove an item from the preview layer, returns true if it worked.
  preview.remove = (hash, sendUpdate = false) => {
    if (layers.preview.children[hash]) {
      layers.preview.children[hash].remove();
      if (sendUpdate) cncserver.sockets.sendPaperUpdate('preview');
      return true;
    }
    return false;
  };

  // Get a full preview SVG of the preview layer content.
  preview.getPreviewSVG = () => {
    const svgContent = layers.stage.exportSVG({ asString: true });
    return cncserver.utils.wrapSVG(svgContent);
  };

  // Assumes clean internally rendered JSON.
  // Add the JSON and return the item within the hash group.
  preview.addRenderJSON = (json, hash, adjustments = {}) =>
    preview.addRender(layers.preview.importJSON(json), hash, adjustments);

  // Import rendered into the hash group.
  preview.addRender = (importItem, hash, adjustments = {}) => {
    layers.preview.activate();

    const renderGroup = layers.preview.children[hash] || new Group({ name: hash });
    renderGroup.addChild(importItem);

    // Apply adjustments to the item before sending final update.
    Object.entries(adjustments).forEach(([key, value]) => { importItem[key] = value; });

    // Send final update for the addition of this item.
    cncserver.sockets.sendPaperUpdate('preview');

    return importItem;
  };

  return preview;
};

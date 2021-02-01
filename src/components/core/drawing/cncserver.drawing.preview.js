/**
 * @file Code for drawing preview/render layer management.
 */
import Paper from 'paper';
import { layers } from 'cs/drawing/base';
import { sendPaperUpdate } from 'cs/sockets';
import { wrapSVG } from 'cs/utils';

const { Group } = Paper;

// Clear all items off the preview and update.
export function clearAll() {
  layers.preview.removeChildren();
  sendPaperUpdate('preview');
}

// Remove an item from the preview layer, returns true if it worked.
export function remove(hash, sendUpdate = false) {
  if (layers.preview.children[hash]) {
    layers.preview.children[hash].remove();
    if (sendUpdate) sendPaperUpdate('preview');
    return true;
  }
  return false;
}

// Get a full preview SVG of the preview layer content.
export function getPreviewSVG() {
  const svgContent = layers.stage.exportSVG({ asString: true });
  return wrapSVG(svgContent);
}

// Import rendered content into the hash group.
export function addRender(importItem, hash, adjustments = {}) {
  layers.preview.activate();

  const renderGroup = layers.preview.children[hash] || new Group({ name: hash });
  renderGroup.addChild(importItem);

  // Apply adjustments to the item before sending final update.
  // eslint-disable-next-line no-param-reassign
  Object.entries(adjustments).forEach(([key, value]) => { importItem[key] = value; });

  // Send final update for the addition of this item.
  sendPaperUpdate('preview');

  return importItem;
}

// Assumes clean internally rendered JSON.
// Add the JSON and return the item within the hash group.
export function addRenderJSON(json, hash, adjustments = {}) {
  return addRender(layers.preview.importJSON(json), hash, adjustments);
}

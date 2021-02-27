/* eslint-disable no-param-reassign */
/**
 * @file Code for drawing stage layer management.
 */
import Paper from 'paper';
import { layers, fitBounds, workspace } from 'cs/drawing/base';
import { sendPaperUpdate } from 'cs/sockets';
import { wrapSVG } from 'cs/utils';

const { Group, Path } = Paper;

// Default projects settings.
export function defaultSettings() {
  // TODO
}

// Clear all items off the stage and update.
export function clearAll() {
  layers.stage.removeChildren();
  sendPaperUpdate('stage');
}

// Remove an item from the stage, returns true if it worked.
export function remove(hash) {
  if (layers.stage.children[hash]) {
    layers.stage.children[hash].remove();
    return true;
  }
  return false;
}

// Toggle the visibility of the bound rects.
export function toggleRects(state) {
  layers.stage.children.forEach(group => {
    group.children.bounds.opacity = state ? 1 : 0;
    group.children['content-bounds'].opacity = state ? 1 : 0;
  });
}

// Import an imported paper item into the stage layer.
export function importGroup(importItem, hash, bounds) {
  const finalBounds = fitBounds(importItem, bounds);

  // console.log(importItem);
  // console.log(importItem.bounds);

  // If an existing item with a matching hash exists, remove it first.
  remove(hash);

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
  sendPaperUpdate('stage');
  return importItem;
}

// Get a full preview SVG of the stage layer content.
export function getPreviewSVG() {
  // Hide bounds rects.
  toggleRects(false);

  const svgContent = layers.stage.exportSVG({ asString: true });

  // Show bounds rects.
  toggleRects(true);

  return wrapSVG(svgContent, workspace);
}

// Update an item on the stage with its action item.
export function updateItem(item) {
  // Update bounds.
  const stageGroup = layers.stage.children[item.hash];
  if (stageGroup) {
    return importGroup(stageGroup.children.content, item.hash, item.bounds);
  }
  return null;
}

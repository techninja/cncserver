/**
 * @file Code for drawing temp layer management.
 */
import Paper from 'paper';
import { layers } from 'cs/drawing/base';
import { sendPaperUpdate } from 'cs/sockets';

const { Group } = Paper;

// Clear all items off the temp layer.
export function clearAll() {
  layers.temp.removeChildren();
}

// Import temp item into a hash group, return group with item(s).
export function addItem(importItem, hash, adjustments = {}) {
  layers.temp.activate();
  const item = importItem.copyTo(layers.temp);

  const tempGroup = layers.temp.children[hash] || new Group({ name: hash });
  tempGroup.addChild(item);

  // Apply adjustments to the item before sending final update.
  Object.entries(adjustments).forEach(([key, value]) => { item[key] = value; });

  // Send final update for the addition of this item.
  sendPaperUpdate('preview');

  return tempGroup;
}

// Add the JSON and return the item within the hash group.
export function addJSON(json, hash, adjustments = {}) {
  return addItem(layers.temp.importJSON(json), hash, adjustments);
}

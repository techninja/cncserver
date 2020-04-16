/**
 * @file Code for drawing temp layer management.
 */
/* eslint-disable implicit-arrow-linebreak */
const { Group } = require('paper');

const temp = { id: 'drawing.temp' };

module.exports = (cncserver, drawing) => {
  const { layers } = drawing.base;

  // Clear all items off the temp layer.
  temp.clearAll = () => {
    layers.temp.removeChildren();
  };

  // Add the JSON and return the item within the hash group.
  temp.addJSON = (json, hash, adjustments = {}) =>
    temp.addItem(layers.temp.importJSON(json), hash, adjustments);

  // Import temp item into a hash group, return group with item(s).
  temp.addItem = (importItem, hash, adjustments = {}) => {
    layers.temp.activate();
    const item = importItem.copyTo(layers.temp);

    const tempGroup = layers.temp.children[hash] || new Group({ name: hash });
    tempGroup.addChild(item);

    // Apply adjustments to the item before sending final update.
    Object.entries(adjustments).forEach(([key, value]) => { item[key] = value; });

    // Send final update for the addition of this item.
    cncserver.sockets.sendPaperUpdate('preview');

    return tempGroup;
  };

  return temp;
};

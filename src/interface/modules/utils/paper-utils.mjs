/**
 * @file Node/Browser utility module for Paper.js item management.
 */

/**
 * Helper function to move up the parent chain and find the complete opacity of an object.
 *
 * @export
 * @param {paper.Item} item
 *
 * @returns {number}
 *   Complete flattened opacity from all parent container layers.
 */
export function getCompleteOpacity(item, value = 1) {
  if (item.parent) {
    return getCompleteOpacity(item.parent, item.parent.opacity * value);
  }
  return value;
}

// TODO:
// - Get a flat array of paths given a container
// - Start converting to import/export.
export function getPaths(container) {
  if (item.parent) {
    return getCompleteOpacity(item.parent, item.parent.opacity * value);
  }
  return value;
}

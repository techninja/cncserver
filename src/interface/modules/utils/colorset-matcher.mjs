/**
 * @file Node/Browser module for managing colorset item snapping.
 */
import { getCompleteOpacity } from './paper-utils.mjs';

const IGNORE_ITEM = '[IGNORE]';
const state = {
  colorset: {}, // Placeholder for colorset, set by implementor.
  chroma: {}, // Placeholder for chroma library.
  projectOptions: {}, // Placeholder for project options.
  lumaWeight: 4, // Luminocity color matching weight.
  chromaWeight: 1.35, // Chromacity color matching weight.
  overrideItem: {}, // Colorset item matched by ID to override.
};

// Setup chroma and internal colorset reference.
export function setup({ chroma, colorset, options, overrideItem }) {
  if (chroma) state.chroma = chroma;
  if (colorset) state.colorset = colorset;
  if (options) state.projectOptions = options;
  if (overrideItem) state.overrideItem = overrideItem;
}

// Set weighting values for color distance calculations.
export function setWeights({ luma, chroma }) {
  state.lumaWeight = luma;
  state.chromaWeight = chroma;
}

// Get a distance between two colors.
export function getColorDist(sample, test) {
  return state.chroma.deltaE(sample, test, state.lumaWeight, state.chromaWeight);
}

/**
 * Return an item matched by passed key.
 */
export function getItemByKey(key) {
  // Create a fake key for ignore.
  if (key === IGNORE_ITEM) {
    return { id: key, name: key, color: state.projectOptions.paper.color };
  }

  // Match by override.
  if (state.overrideItem?.id && key === state.overrideItem?.id) {
    return state.overrideItem;
  }

  // Match by filter from items.
  return state.colorset.items.filter(item => item.id === key)[0];
}

/**
 * Loop through all the colorset items that use the nearest color, and pick one based on
 * the input color and color weighting.
 *
 * @param {string} inputColor
 *   CSS hexadecimal color.
 *
 * @returns {string}
 *   Matched colorset item key ID.
 */
export function nearestByColor(inputColor) {
  // Object of post weighted differences from input color, keyed by id.
  const distances = {};
  let dist = 0;
  state.colorset.items.forEach(({ id }) => {
    const item = getItemByKey(id);
    if (item.selectionMethod === 'color') {
      dist = getColorDist(inputColor, item.color);
      distances[item.id] = dist + (dist * -(item.colorWeight || 0));
    }
  });

  // If the project option supports ignoring paper color, add that distance for selection.
  if (state.projectOptions.paper.ignore) {
    dist = state.chroma.deltaE(
      inputColor, state.projectOptions.paper.color, 3, 1.35
    );
    distances[IGNORE_ITEM] = dist + (
      dist * -(state.projectOptions.paper.ignoreColorWeight)
    );
  }

  let lowestKey = Object.keys(distances)[0];
  Object.entries(distances).forEach(([key, value]) => {
    if (value < distances[lowestKey]) {
      lowestKey = key;
    }
  });

  return lowestKey;
}

/**
 * Loop through all the colorset items and find which one provides the first override
 * that matches.
 *
 * @param {string} inputColor
 *   CSS hexadecimal color.
 *
 * @returns {string}
 *   Matched colorset item key ID.
 */
export function nearestByOverride(inputColor) {
  let match = null;
  const colorHex = state.chroma(inputColor).hex();
  state.colorset.items.forEach(({ id }) => {
    const item = getItemByKey(id);
    if (item.selectionOverrides?.length) {
      if (item.selectionOverrides.filter(c => c === colorHex).length) {
        match = item.id;
      }
    }
  });

  return match;
}

/**
 * Given a stroke width, find which colorset items match.
 *
 * @param {number} inputWidth
 *   Width to check.
 *
 * @returns {string}
 *   Matched colorset item key ID.
 */
export function nearestByWidth(inputWidth) {
  let lastValid = null;
  state.colorset.items.forEach(({ id }) => {
    const item = getItemByKey(id);
    if (item.selectionMethod === 'strokeWidth') {
      if (inputWidth > item.strokeWidthMin && inputWidth < item.strokeWidthMax) {
        lastValid = item.id;
      }
    }
  });

  return lastValid;
}

/**
 * Given a path opacity & color alpha, find which colorset item matches.
 *
 * @param {number} inputOpacity
 *   Input opacity to check.
 * @param {number} inputAlpha
 *   Input color alpha to check.
 *
 * @returns {string}
 *   Matched colorset item key.
 */
export function nearestByOpacity(item) {
  let lastValid = null;
  const combinedOpacity = getCompleteOpacity(item, item.opacity * item.strokeColor.alpha);
  state.colorset.items.forEach(({ id }) => {
    const { selectionMethod, opacityMin, opacityMax } = getItemByKey(id);
    if (selectionMethod === 'opacity') {
      if (combinedOpacity >= opacityMin && combinedOpacity <= opacityMax) {
        lastValid = id;
      }
    }
  });

  return lastValid;
}

/**
 * Move through all colorset items and selection rule types to select an item for the
 * given path item.
 *
 * @param {paper.Path} item
 *   Input item to test properties of.
 *
 * @returns {string}
 *   Machine name of colorset item matched.
 */
export function matchItemToColor(item) {
  if (!state.colorset?.items?.length) {
    throw new Error('Must initialize Colorset before trying to match by it.');
  }

  const color = item.strokeColor.toCSS(true);
  // let matchType = 'color';
  let matchItem = null;

  // Get nearest item by color:
  const byColor = nearestByColor(color);

  // We'll always have a color match.
  matchItem = byColor;

  // Get nearest by direct override.
  const byOverride = nearestByOverride(color);

  // Get nearest by line stroke width:
  const byWidth = nearestByWidth(item.strokeWidth);

  // Get nearest by opacity:
  const byOpacity = nearestByOpacity(item);

  // If override is set, use that before anything.
  if (byOverride) {
    matchItem = byOverride;
    // matchType = 'override';
  } else if (byWidth || byOpacity) {
    // Prioritize opacity, then width.
    matchItem = byOpacity || byWidth;
    // matchType = byOpacity ? 'opacity' : 'width';
  }

  return matchItem;
}

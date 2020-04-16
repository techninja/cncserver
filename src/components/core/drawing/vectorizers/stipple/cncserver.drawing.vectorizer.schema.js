/**
 * @file Settings schema for vectorizer method application.
 *
 * This schema defines the vectorizer method specific settings schema for the
 * application to import and use for settings validation and documentation.
 */
/* eslint-disable max-len */
module.exports = {
  useColor: {
    type: 'boolean',
    title: 'Use Color',
    description: 'Parse color from the raster into the stipple points, otherwise just greyscale.',
    default: false,
  },
  noOverlap: {
    type: 'boolean',
    title: 'No Overlap',
    description: 'Prevent stipple points from overlapping each other.',
    default: false,
  },
  fixedRadius: {
    type: 'boolean',
    title: 'Fixed radius',
    description: 'Lock the radius of the stipple point circles to a single size.',
    default: false,
  },
  points: {
    type: 'integer',
    title: 'Stipple points',
    description: 'Number of points to fit against the raster.',
    default: 500,
    minimum: 20,
    maximum: 80000,
  },
  sizingFactor: {
    type: 'number',
    title: 'Sizing Factor',
    description: 'Final stipple point circle radius multiplier.',
    default: 1,
    minimum: 0.1,
    maximum: 10,
  },
  subpixels: {
    type: 'integer',
    title: 'Subpixels',
    description: 'Tile size of centroid computations.',
    default: 5,
    minimum: 1,
    maximum: 20,
  },
};

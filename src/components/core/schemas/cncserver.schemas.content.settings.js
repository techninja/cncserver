/**
 * @file Content Settings schema for Projects API.
 *
 * This builds a conglomerate render settings schema based on keys passed in.
 */
module.exports = properties => ({
  type: 'object',
  title: 'Settings',
  description: 'All render specific settings overrides',
  properties,
});

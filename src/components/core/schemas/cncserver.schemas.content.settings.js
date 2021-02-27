/**
 * @file Content Settings schema for Projects API.
 *
 * This builds a conglomerate render settings schema based on keys passed in.
 */
export default function settingsSchema(properties) {
  return {
    type: 'object',
    title: 'Settings',
    format: 'categories',
    description: 'All render specific settings overrides',
    properties,
  };
}

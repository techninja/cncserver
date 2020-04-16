/**
 * @file Settings schema indexer.
 *
 */
/* eslint-disable global-require, import/no-dynamic-require */
module.exports = (cncserver) => {
  // TODO: Schemas to finalize: stroke, vectorize, text
  const items = ['projects', 'content', 'fill', 'stroke', 'path', 'text', 'vectorize'];
  const settingsKeys = ['fill', 'stroke', 'path', 'text', 'vectorize'];

  const schemas = {};
  const settingsKeySchemas = { };

  items.forEach((name) => {
    schemas[name] = require(`./cncserver.schemas.${name}.js`)(cncserver);
    if (settingsKeys.includes(name)) settingsKeySchemas[name] = schemas[name];
  });

  // Build the "settings" schema, then add a a copy of it to the content schema.
  schemas.settings = require(
    './cncserver.schemas.content.settings.js'
  )(settingsKeySchemas);
  schemas.content.properties.settings = schemas.settings;

  return schemas;
};

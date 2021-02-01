/**
 * @file Settings schema indexer.
 */
import projects from 'cs/schemas/projects';
import content from 'cs/schemas/content';
import contentSettings from 'cs/schemas/content/settings';
import fill from 'cs/schemas/fill';
import stroke from 'cs/schemas/stroke';
import text from 'cs/schemas/text';
import vectorize from 'cs/schemas/vectorize';
import path from 'cs/schemas/path';
import color from 'cs/schemas/color';
import colors from 'cs/schemas/colors';
import tools from 'cs/schemas/tools';
import implementSchema from 'cs/schemas/implements';
import toolsets from 'cs/schemas/toolsets';

// TODO: Schemas to finalize: stroke, vectorize, text

// All schemas that define content specific settings.
const settingsSchemas = {
  fill,
  stroke,
  text,
  vectorize,
  path,
};

const schemas = {
  projects,
  content,
  settings: contentSettings(settingsSchemas),
  fill,
  stroke,
  text,
  vectorize,
  path,
  color,
  colors,
  tools,
  implements: implementSchema,
  toolsets,
};

// Add the color schema to the colors.items schema.
schemas.colors.properties.items.items = schemas.color;

// Add the tool schema to the toolset.items schema.
schemas.toolsets.properties.items.items = schemas.tools;

// Attach to content and projects schemas.
schemas.content.properties.settings = schemas.settings;
schemas.projects.properties.settings = schemas.settings;

export default schemas;

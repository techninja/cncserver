/**
 * @file Settings schema for Project Content API.
 *
 * This schema defines the specific allowed settings and therefore the API
 * interface restrictions and expectations for all data IO.
 */
/* eslint-disable max-len */

import { base } from 'cs/drawing';
import { bindTo } from 'cs/binder';

const properties = {
  project: {
    type: 'string',
    title: 'Project',
    description: 'Parent project for the content to live in, defaults to currently open project.',
  },
  title: {
    type: 'string',
    title: 'Content Title',
    description: 'Human readable name for the content.',
    default: '',
  },
  autoRender: {
    type: 'boolean',
    format: 'checkbox',
    title: 'Auto Render',
    description: 'Automatically re-render this content when updated.',
    default: true,
  },
  // settings: @see cncserver.schemas.content.settings.js
  source: {
    type: 'object',
    title: 'Content Source',
    properties: {
      type: {
        type: 'string',
        title: 'Content type',
        description: 'The type of content',
        enum: ['svg', 'path', 'paper', 'raster', 'text'],
        options: {
          enum_titles: [
            'SVG XML',
            'SVG Path Data',
            'Paper.js JSON',
            'Raster Image',
            'Plain Text',
          ],
        },
      },
      url: {
        type: 'string',
        format: 'uri',
        title: 'URL',
        description: 'Location on the internet where the content can be found.',
      },
      content: {
        type: 'string',
        title: 'Content Body',
        description: 'String content of the specified type, or binary data URI for rasters',
      },
    },
    /* if: { // TODO: This doesn't work, but it really should.
      properties: {
        type: { const: 'raster' },
      },
    },
    then: {
      properties: {
        content: { pattern: '^(data:)([\w\/\+]+);(charset=[\w-]+|base64).*,(.*)' },
      },
    }, */
    oneOf: [
      { required: ['type', 'url'] },
      { required: ['type', 'content'] },
    ],
  },
  bounds: {
    type: 'object',
    title: 'Bounds rectangle',
    description: 'Definition of a rectangle in mm to size the content to within the canvas.',
    properties: {
      x: {
        type: 'number',
        format: 'number',
        title: 'X Point',
        description: 'X coordinate of top left position of the rectangle.',
        default: 0, // Set in bindTo below.
        minimum: 0,
        maximum: 1, // Set in bindTo below.
      },
      y: {
        type: 'number',
        format: 'number',
        title: 'Y Point',
        description: 'Y coordinate of top left position of the rectangle.',
        default: 0, // Set in bindTo below.
        minimum: 0,
        maximum: 1, // Set in bindTo below.
      },
      width: {
        type: 'number',
        format: 'number',
        title: 'Width',
        description: 'Width of the rectangle.',
        default: 1, // Set in bindTo below.
        minimum: 1,
        maximum: 2, // Set in bindTo below.
      },
      height: {
        type: 'number',
        format: 'number',
        title: 'Height',
        description: 'Height of the rectangle.',
        default: 1, // Set in bindTo below.
        minimum: 1,
        maximum: 2, // Set in bindTo below.
      },
    },
  },
};

// Set the schema level content boundaries after they've been defined.
bindTo('paper.ready', () => {
  const bounds = base.defaultBounds();
  properties.bounds.properties.x.default = bounds.point.x;
  properties.bounds.properties.y.default = bounds.point.y;
  properties.bounds.properties.width.default = bounds.width;
  properties.bounds.properties.height.default = bounds.height;

  properties.bounds.properties.x.maximum = base.size.width - 1;
  properties.bounds.properties.y.maximum = base.size.height - 1;
  properties.bounds.properties.width.maximum = base.size.width;
  properties.bounds.properties.height.maximum = base.size.height;
});

const schema = {
  type: 'object',
  title: 'Content',
  description: 'Full definition of a single unit of content for a project.',
  properties,
  required: ['source'],
};

export default schema;

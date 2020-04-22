/**
 * @file Settings schema for Project Content API.
 *
 * This schema defines the specific allowed settings and therefore the API
 * interface restrictions and expectations for all data IO.
 */
/* eslint-disable max-len */
module.exports = (cncserver) => {
  const { base } = cncserver.drawing;
  const bounds = base.defaultBounds();

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
          default: bounds.point.x,
          minimum: 0,
          maximum: base.size.width - 1,
        },
        y: {
          type: 'number',
          format: 'number',
          title: 'Y Point',
          description: 'Y coordinate of top left position of the rectangle.',
          default: bounds.point.y,
          minimum: 0,
          maximum: base.size.height - 1,
        },
        width: {
          type: 'number',
          format: 'number',
          title: 'Width',
          description: 'Width of the rectangle.',
          default: bounds.width,
          minimum: 1,
          maximum: base.size.width,
        },
        height: {
          type: 'number',
          format: 'number',
          title: 'Height',
          description: 'Height of the rectangle.',
          default: bounds.height,
          minimum: 1,
          maximum: base.size.height,
        },
      },
    },
  };

  return {
    type: 'object',
    title: 'Content',
    description: 'Full definition of a single unit of content for a project.',
    properties,
    required: ['source'],
  };
};

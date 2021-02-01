/**
 * @file Global path override settings schema.
 *
 * This schema defines the defaults given to path content that doesn't have
 * external properties otherwise.
 *
 */
/* eslint-disable max-len */
const schema = {
  type: 'object',
  title: 'Path',
  properties: {
    fillColor: {
      type: 'string',
      format: 'color',
      title: 'Fill Color',
      description: 'Fill color of the item if none given.',
      default: 'black',
    },
    strokeColor: {
      type: 'string',
      format: 'color',
      title: 'Stroke Color',
      description: 'Stroke color of the item if none given.',
      default: 'black',
    },
  },
};

export default schema;

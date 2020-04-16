/**
 * @file Global path override settings schema.
 *
 * This schema defines the defaults given to path content that doesn't have
 * external properties otherwise.
 *
 */
module.exports = () => ({
  type: 'object',
  properties: {
    closed: {
      type: 'boolean',
      title: 'Closed path',
      description: 'If the path is closed, the end will connect to the start.',
      default: false,
    },
    fillColor: {
      type: 'string',
      title: 'Fill Color',
      description: 'Fill color of the item if none given.',
      default: 'black',
    },
    strokeColor: {
      type: 'string',
      title: 'Stroke Color',
      description: 'Stroke color of the item if none given.',
      default: 'black',
    },
  },
});

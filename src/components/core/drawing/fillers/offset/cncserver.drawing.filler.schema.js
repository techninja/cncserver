/**
 * @file Settings schema for fill method application.
 *
 * This schema defines the fill method specific settings schema for the
 * application to import and use for settings validation and documentation.
 */
/* eslint-disable max-len */
const schema = {
  // === Pattern fill method keys, found @ settings.fill.offset ==============
  type: 'object',
  title: 'Offset Shape Fill',
  options: { collapsed: true },
  properties: {
    connectShells: {
      type: 'boolean',
      title: 'Connect shells',
      description: 'If checked, each offset shell will be connected to the previous one, making a spiral. Does not connect multi-shells.',
      default: false,
      format: 'checkbox',
    },
    fillGaps: {
      type: 'boolean',
      title: 'Fill Gaps',
      description: 'If checked, the fill method will check for single width gaps and fill them.',
      default: false,
      format: 'checkbox',
    },
  },
};

export default schema;

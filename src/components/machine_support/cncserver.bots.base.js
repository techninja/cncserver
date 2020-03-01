/**
 * @file Abstraction module for base bot specific stuff.
 */
const base = { id: 'base' }; // Exposed export.

module.exports = (cncserver) => {
  // Bind base wait toolchange support to the toolchange event.
  cncserver.binder.bindTo('tool.change', base.id, (tool) => {
    // A "wait" tool requires user feedback before it can continue.
    if (typeof tool.wait !== 'undefined') {
      // Queue a callback to pause continued execution on tool.wait value
      if (tool.wait) {
        cncserver.run('callback', () => {
          cncserver.sockets.manualSwapTrigger(tool.index);
        });

        // Queue a special low-level pause in the runner.
        cncserver.run('special', 'pause');
      }
    }
  });

  return base;
};

/**
 * @file Abstraction module for base bot specific stuff.
 */
import { bindTo } from 'cs/binder';
import run from 'cs/run';
import { manualSwapTrigger } from 'cs/sockets';

/**
 * Initialize bot specific code.
 *
 * @export
 */
export default function initBot() {
  // Bind base wait toolchange support to the toolchange event.
  bindTo('tool.change', 'base', tool => {
    // A "wait" tool requires user feedback before it can continue.
    if (typeof tool.wait !== 'undefined') {
      // Queue a callback to pause continued execution on tool.wait value
      if (tool.wait) {
        run('callback', () => {
          manualSwapTrigger(tool.index);
        });

        // Queue a special low-level pause in the runner.
        run('special', 'pause');
      }
    }
  });

  return { id: 'bots.base' };
}

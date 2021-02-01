/**
 * @file Trace code for drawing base, pretty much just imports it into Paper!
 */
import { fitBounds } from 'cs/drawing/base';
import { addRender } from 'cs/drawing/preview';

export default function trace(inputPath, hash, bounds = null, settings = {}) {
  return new Promise(resolve => {
    // If bounds set, resize the path.
    if (bounds) {
      fitBounds(inputPath, bounds);
    }

    // TODO: Actually render if we have dash or other options.
    if (settings.dashArray) {
      // TODO: This.
    } else {
      // Take normalized path and add it to the preview layer.
      addRender(inputPath.clone(), hash, {
        strokeWidth: inputPath.strokeWidth || 1,
        strokeColor: inputPath.strokeColor,
        fillColor: null,
      });
    }

    resolve();
  });
}

/**
 * @file Trace code for drawing base, pretty much just imports it into Paper!
 */
module.exports = (cncserver, drawing) => {
  const trace = (inputPath, hash, bounds = null, settings = {}) => new Promise((resolve, reject) => {
    // If bounds set, resize the path.
    if (bounds) {
      drawing.base.fitBounds(inputPath, bounds);
    }

    // TODO: Actually render if we have dash or other options.
    if (settings.dashArray) {
      // TODO: This.
    } else {
      // Take normalized path and add it to the preview layer.
      drawing.preview.addRender(inputPath.clone(), hash, {
        strokeWidth: 1,
        strokeColor: inputPath.strokeColor,
        fillColor: null,
      });
    }


    resolve();
  });

  return trace;
};

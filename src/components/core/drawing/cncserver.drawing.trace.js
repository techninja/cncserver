/**
 * @file Trace code for drawing base, pretty much just imports it into Paper!
 */
const { Rectangle } = require('paper');

module.exports = (cncserver, drawing) => {
  const trace = (path, parent = null, bounds = null) => {
    // Take normalized path and add it to the preview layer.
    drawing.base.layers.preview.addChild(path);

    // If bounds set, resize the path.
    if (bounds) {
      path.fitBounds(new Rectangle(bounds));
    }

    // Update client preview.
    cncserver.sockets.sendPaperPreviewUpdate();
  };

  return trace;
};

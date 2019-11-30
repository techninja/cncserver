/**
 * @file Trace code for drawing base, pretty much just imports it into Paper!
 */
const { Rectangle } = require('paper');

module.exports = (cncserver, drawing) => {
  const trace = (path, parent = null, bounds = null) => {
    // Take normalized path and add it to the preview layer.
    drawing.base.layers.preview.addChild(path);

    // Ensure colors fromt his object match requirements.
    if (!path.hasStroke()) {
      // Default to black fill if we're here with nothing.
      path.strokeColor = path.fillColor || 'black';
    }
    path.fillColor = null;
    path.strokeWidth = 1;

    // If bounds set, resize the path.
    if (bounds) {
      drawing.base.fitBounds(path, bounds);
    }

    // Update client preview.
    cncserver.sockets.sendPaperPreviewUpdate();
  };

  return trace;
};

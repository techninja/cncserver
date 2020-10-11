/**
 * @file Code for drawing fill management.
 */
const path = require('path');

module.exports = (cncserver, drawing) => {
  const fill = (fillPath, hash, bounds = null, settings, subIndex) => new Promise((success, error) => {
    const { method } = settings;
    const script = path.resolve(
      __dirname,
      'fillers',
      method,
      `cncserver.drawing.fillers.${method}.js`
    );

    // Add in computed settings values here.
    if (settings.randomizeRotation) {
      settings.rotation = Math.round(Math.random() * 360);
    }

    // TODO: Should we fitbounds here? Or earlier?
    if (bounds) {
      drawing.base.fitBounds(fillPath, bounds);
    }

    // Use spawner to run fill process.
    drawing
      .spawner({
        type: 'filler',
        hash,
        script,
        settings,
        object: fillPath.exportJSON(),
        subIndex,
      })
      .then((result) => {
        drawing.preview.addRenderJSON(result, hash, {
          fillColor: null,
          strokeWidth: 1,
          strokeColor: fillPath.fillColor,
        });
        success();
      })
      .catch(error);
  });

  return fill;
};

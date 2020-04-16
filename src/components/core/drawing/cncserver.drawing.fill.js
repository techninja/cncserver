/**
 * @file Code for drawing fill management.
 */
module.exports = (cncserver, drawing) => {
  const fill = (path, hash, bounds = null, settings, subIndex) => new Promise((success, error) => {
    // Add in computed settings values here.
    if (settings.randomizeRotation) {
      settings.rotation = Math.round(Math.random() * 360);
    }

    // TODO: Should we fitbounds here? Or earlier?
    if (bounds) {
      drawing.base.fitBounds(path, bounds);
    }

    const { method } = settings;
    const script = `${__dirname}/fillers/${method}/cncserver.drawing.fillers.${method}.js`;

    // Use spawner to run fill process.
    drawing
      .spawner({
        type: 'filler',
        hash,
        script,
        settings,
        object: path.exportJSON(),
        subIndex,
      })
      .then((result) => {
        drawing.preview.addRenderJSON(result, hash, {
          fillColor: null,
          strokeWidth: 1,
          strokeColor: path.fillColor,
        });
        success();
      })
      .catch(error);
  });

  return fill;
};

/**
 * @file Code for drawing fill management.
 */

module.exports = (cncserver, drawing) => {
  // TODO: get this somewhere real.
  const settingDefaults = {
    method: 'offset', // Fill method application machine name.
    flattenResolution: 0.25, // Path overlay fill type trace resolution.
    // Pass a path object to be used for overlay fills:
    angle: 28, // Dynamic line fill type line angle
    insetAmount: 0, // Amount to negatively offset the fill path.
    randomizeAngle: false, // Randomize the angle above for dynamic line fill.
    hatch: false, // If true, runs twice at opposing angles
    spacing: 3, // Dynamic line fill spacing nominally between each line.
    threshold: 10, // Dynamic line grouping threshold
  };

  const fill = (path, hash, parent = null, bounds = null, requestSettings = {}) => new Promise((success, error) => {
    const settings = { ...settingDefaults, ...requestSettings };

    // TODO: Should we fitbounds here? Or earlier?
    if (bounds) {
      drawing.base.fitBounds(path, bounds);
    }

    const { method } = settings;
    const script = `${__dirname}/fillers/cncserver.drawing.fillers.${method}.js`;

    // Use spawner to run fill process.
    drawing.spawner({
      type: 'filler',
      hash,
      script,
      settings,
      object: path.exportJSON(),
    })
      .then((result) => {
        const item = drawing.base.layers.preview.importJSON(result);
        item.fillColor = null;
        item.strokeWidth = 1;
        item.strokeColor = path.fillColor;

        cncserver.sockets.sendPaperPreviewUpdate();
        success();
      })
      .catch(error);
  });

  return fill;
};

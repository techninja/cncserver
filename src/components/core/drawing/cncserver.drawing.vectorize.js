/**
 * @file Code for image vectorizor management.
 */

module.exports = (cncserver, drawing) => {
  // TODO: get this somewhere real.
  const settingDefaults = {
    method: 'squiggle', // Vectorizer method application machine name.
  };

  const vectorizer = (image, hash, bounds, requestSettings = {}) => new Promise((success, error) => {
    const settings = { ...settingDefaults, ...requestSettings, bounds };
    const { method } = settings;
    const script = `${__dirname}/vectorizers/cncserver.drawing.vectorizers.${method}.js`;

    // Use spawner to run vectorizer process.
    drawing.spawner({
      type: 'vectorizer',
      hash,
      script,
      settings,
      object: image.exportJSON(),
    })
      .then((result) => {
        drawing.base.layers.preview.importJSON(result);
        cncserver.sockets.sendPaperPreviewUpdate();
        success();
      })
      .catch(error);
  });

  return vectorizer;
};

/**
 * @file Code for image vectorizor management.
 */
const path = require('path');

module.exports = (cncserver, drawing) => {
  const vectorize = (imagePath, hash, bounds, settings) => new Promise((success, error) => {
    const { method } = settings.vectorize;
    const script = path.resolve(
      __dirname,
      'vectorizers',
      method,
      `cncserver.drawing.vectorizers.${method}.js`
    );

    // Use spawner to run vectorizer process.
    drawing
      .spawner({
        type: 'vectorizer',
        hash,
        script,
        settings: { ...settings.vectorize, bounds },
        object: imagePath,
      })
      .then((result) => {
        // Because some vectorizers produce filled shapes, we need to process
        // these in the temp layer before moving them to render preview.
        const group = drawing.temp.addJSON(result, hash);

        console.log('Returned items', group.children[0].children.length);

        // We'll NEVER have occlusion if converting a raster to a vector.
        cncserver.content.renderGroup(group, hash, settings, true);
        success();
      })
      .catch(error);
  });

  return vectorize;
};

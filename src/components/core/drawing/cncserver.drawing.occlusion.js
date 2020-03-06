/**
 * @file Code for drawing occlusion path segmentation management.
 */
// const { Path, Rectangle } = require('paper');

module.exports = (cncserver, drawing) => {
  const occlusion = (type, layer = drawing.base.project.activeLayer) => {
    // console.log('Layer children:', layer.children);
    for (let srcIndex = 0; srcIndex < layer.children.length; srcIndex++) {
      let srcPath = layer.children[srcIndex];
      if (type === 'fill' && !srcPath.closed) {
        // eslint-disable-next-line no-continue
        continue;
      }

      srcPath.data.processed = true;

      // Replace this path with a subtract for every intersecting path,
      // starting at the current index (lower paths don't subtract from
      // higher ones)
      const tmpLen = layer.children.length;
      for (let destIndex = srcIndex; destIndex < tmpLen; destIndex++) {
        const destPath = layer.children[destIndex];
        if (!destPath.closed) {
          // eslint-disable-next-line no-continue
          continue;
        }
        if (destIndex !== srcIndex) {
          const tmpPath = srcPath; // Hold onto the original path

          // Set the new srcPath to the subtracted one inserted at the
          // same index.
          // console.log('Source subtract from:', srcPath.name, destPath.name);
          srcPath = layer.insertChild(srcIndex, srcPath.subtract(destPath));
          srcPath.name = tmpPath.name ? tmpPath.name : `auto_path_${srcPath.id}`;
          srcPath.data = { ...tmpPath.data };
          tmpPath.remove(); // Remove the old srcPath
        }
      }
    }
  };

  return occlusion;
};

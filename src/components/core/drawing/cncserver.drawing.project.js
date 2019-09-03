/**
 * @file Code for drawing project breakdown management.
 */
const { Path, Rectangle } = require('paper');

module.exports = (cncserver, drawing) => {
  const project = (svgData, hash, bounds = null) => {
    const { base: { project: pp } } = drawing;
    // TODO: fail project on API when it doesn't import correctly.
    const item = pp.importSVG(svgData.trim(), {
      expandShapes: true,
      applyMatrix: true,
    });

    drawing.base.fitBounds(item, bounds);

    const allPaths = drawing.base.getPaths(item);
    // console.log('How many?', allPaths.length); return;

    // Move through all paths and add each one as a job.
    allPaths.forEach((path) => {
      // Only add non-zero length path tracing jobs.
      if (path.length) {
        cncserver.jobs.addItem({
          operation: 'trace',
          type: 'job',
          parent: hash,
          body: path,
        });
      }
    });
  };

  return project;
};

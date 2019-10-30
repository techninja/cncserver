/**
 * @file Code for drawing project breakdown management.
 */
module.exports = (cncserver, drawing) => {
  const project = (svgData, hash, operation, bounds = null) => {
    const { base: { project: pp } } = drawing;
    // TODO: fail project on API when it doesn't import correctly.
    const item = pp.importSVG(svgData.trim(), {
      expandShapes: true,
      applyMatrix: true,
    });

    drawing.base.fitBounds(item, bounds);

    drawing.base.ungroupAllGroups(item);
    drawing.base.removeNonPaths(item);

    // TODO: check settings.
    drawing.occlusion('fill', item);

    // Update client preview.
    cncserver.sockets.sendPaperPreviewUpdate();

    const allPaths = drawing.base.getPaths(item);
    console.log('How many?', allPaths.length);

    /*
    // Move through all paths and add each one as a job.
    allPaths.forEach((path) => {
      // Only add non-zero length path tracing jobs.
      if (path.length) {
        if (operation === 'full' || operation === 'trace') {
          console.log('Tracing:', path.name, `Length: ${path.length}mm`);
          cncserver.actions.addItem({
            operation: 'trace',
            type: 'job',
            parent: hash,
            body: path,
          });
        }

        // TODO: Do we fill non-closed paths?
        if ((operation === 'fill' || operation === 'full') && path.closed) {
          console.log('Filling:', path.name, `Length: ${path.length}mm`);
          cncserver.actions.addItem({
            operation: 'fill',
            type: 'job',
            parent: hash,
            body: path,
          });
        }
      }
    }); */
  };

  return project;
};

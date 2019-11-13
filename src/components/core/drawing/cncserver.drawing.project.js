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
  };

  return project;
};

/**
 * @file Code for drawing project breakdown management.
 */
const project = { id: 'drawing.project' };

module.exports = (cncserver, drawing) => {
  // Default projects settings.
  project.defaultSettings = () => ({
    fillOcclusion: true,
    traceOcclusion: true,
    traceFills: true,
  });

  project.processSVG = (tempItem, hash, operation, bounds = null, rawSettings = {}) => {
    const { base: { project: pp } } = drawing;
    const settings = {
      ...project.defaultSettings(),
      ...rawSettings,
    };

    const doFill = ['fill', 'full'].includes(operation);
    const doStroke = ['trace', 'full'].includes(operation);

    // const item = tempItem.clone();
    // drawing.base.layers.preview.addChild(item);

    // Welcome to projects! What is this?
    // * At minimum, we take SVG (already imported into the temp layer) and do
    //   all the stuff RoboPaint did:
    // * Clean up the objects to just what's printable
    // * Given settings and operations, add all of the fill/stroke jobs needed.
    //
    // Bonuses: Read extra data from paths to override specific settings

    drawing.base.fitBounds(tempItem, bounds);
    drawing.base.ungroupAllGroups(tempItem);
    drawing.base.removeNonPaths(tempItem);

    // TODO: We need to make sure we're not destroying data when doing this.
    // TODO: This breaks initial color data transfer
    // if (settings.fillOcclusion) drawing.occlusion('fill', tempItem);
    // if (settings.StrokeOcclusion) drawing.occlusion('stroke', item);

    // Update client preview.
    cncserver.sockets.sendPaperPreviewUpdate();

    const allPaths = drawing.base.getPaths(tempItem);
    allPaths.forEach((path) => {
      if (doFill && path.hasFill()) {
        cncserver.actions.addItem({
          operation: 'fill',
          type: 'job',
          parent: hash,
          body: path,
          settings: settings.fillSettings,
        });
      }

      if (doStroke && (path.hasStroke() || settings.traceFills)) {
        cncserver.actions.addItem({
          operation: 'trace',
          type: 'job',
          parent: hash,
          body: path.exportJSON(),
        });
      }
    });

    // ;
    // console.log('How many?', allPaths.length);
  };

  return project;
};

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


  const cutoutOcclusion = (tmp) => {
    for (let srcIndex = 0; srcIndex < tmp.children.length; srcIndex++) {
      let srcPath = tmp.children[srcIndex];
      srcPath.data.processed = true;

      // Replace this path with a subtract for every intersecting path,
      // starting at the current index (lower paths don't subtract from
      // higher ones)
      const tmpLen = tmp.children.length;
      for (let destIndex = srcIndex; destIndex < tmpLen; destIndex++) {
        const destPath = tmp.children[destIndex];
        if (destIndex !== srcIndex) {
          const tmpPath = srcPath; // Hold onto the original path

          // Set the new srcPath to the subtracted one inserted at the
          // same index.
          srcPath = tmp.insertChild(srcIndex, srcPath.subtract(destPath));
          // srcPath.name = tmpPath.name;
          tmpPath.remove(); // Remove the old srcPath
        }
      }
    }
  };

  project.processSVG = (importItem, hash, operation, bounds = null, rawSettings = {}) => {
    const { base: { project: pp } } = drawing;
    const {
      layers: { temp }, cleanupInput, fitBounds, ungroupAllGroups, cleanupFills,
    } = drawing.base;
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


    // console.log('Items in Temp before occlude:', Object.keys(temp._namedChildren));
    // console.log('Frame length BEFORE', temp.children[0]);


    // TODO: We need to make sure we're not destroying data when doing this.
    // TODO: This breaks initial color data transfer
    // if (settings.fillOcclusion) drawing.occlusion('fill', temp);
    // cutoutOcclusion(preview);
    // if (settings.StrokeOcclusion) drawing.occlusion('stroke', item);
    // console.log('Frame length AFTER', temp.children[0].children);
    // console.log('After Occlusion:', Object.keys(temp._namedChildren));

    // temp.children[0].copyTo(preview);

    // Update client preview.
    // cncserver.sockets.sendPaperUpdate();

    // Move through all imemdiate temp child paths for fill jobs.
    if (doFill) {
      temp.removeChildren();
      const tempItem = importItem.copyTo(temp);
      fitBounds(tempItem, bounds);
      ungroupAllGroups(temp);
      cleanupInput(temp);
      cleanupFills(temp);
      if (settings.fillOcclusion) drawing.occlusion('fill', temp);

      temp.children.forEach((path) => {
        // console.log('FILLING', path.name, index);
        cncserver.actions.addItem({
          type: 'job',
          operation: 'fill',
          parent: hash,
          body: path.exportJSON(),
          settings: settings.fillSettings,
        });
      });
    }

    // Move through all direct paths for adding stroke jobs.
    if (doStroke) {
      temp.removeChildren();
      const tempItem = importItem.copyTo(temp);
      fitBounds(tempItem, bounds);
      ungroupAllGroups(temp);
      cleanupInput(temp, true);
      if (settings.traceOcclusion) drawing.occlusion('stroke', temp);

      temp.children.forEach((path) => {
        if (path.hasStroke() || settings.traceFills) {
          // if (!path.strokeColor) path.strokeColor = path.fillColor;
          cncserver.actions.addItem({
            operation: 'trace',
            type: 'job',
            parent: hash,
            body: path.exportJSON(),
          });
        }
      });
    }
  };

  return project;
};

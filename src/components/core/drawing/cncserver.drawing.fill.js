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

  const globalFillschema = {
    method: {
      type: 'string',
      title: 'Fill Method',
      description: 'The method used to turn a fill into paths.',
      default: 'offset',
      enum: ['offset', 'hatch', 'pattern'], // TODO: pull from available.
    },
    flattenResolution: {
      type: 'number',
      title: 'Flatten Resolution',
      description: 'How much detail is preserved when converting curves. Smaller is higher resolution but less performant.',
      default: 0.25,
      minimum: 0.01,
      maximum: 5,
    },
    angle: {
      type: 'number',
      title: 'Angle',
      description: 'If applicable, the angle for a fill method.',
      default: 28,
      minimum: 0,
      maximum: 360,
    },
    insetAmount: {
      type: 'number',
      title: 'Inset Amount',
      description: 'The amount to negatively offset a fill path, allowing for space betweek outside stroke and internal size.',
      default: 0,
      minimum: -5,
      maximum: 5,
    },
    randomizeAngle: {
      type: 'boolean',
      title: 'Randomize Angle',
      description: 'If set, the angle setting will be ignored and a single random angle will be selected for each fill.',
      default: false,
    },
    spacing: {
      type: 'number',
      title: 'Spacing',
      description: 'If applicable, the amount of space between items in MM, lower number is higher density.',
      default: 3,
      minimum: 0.1,
      maximum: 100,
    },
  };

  const fill = (path, hash, parent = null, bounds = null, requestSettings = {}) => new Promise((success, error) => {
    const settings = { ...settingDefaults, ...requestSettings };

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
      })
      .then((result) => {
        const item = drawing.base.layers.preview.importJSON(result);
        item.fillColor = null;
        item.strokeWidth = 1;
        item.strokeColor = path.fillColor;

        cncserver.sockets.sendPaperUpdate();
        success();
      })
      .catch(error);
  });

  return fill;
};

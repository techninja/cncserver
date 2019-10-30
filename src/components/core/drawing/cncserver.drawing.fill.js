/**
 * @file Code for drawing fill management.
 */
const { spawn } = require('child_process'); // Process spawner.
const ipc = require('node-ipc'); // Inter Process Comms (shared with ).
const fsPath = require('path'); // File System path management.
const { Path } = require('paper');

const workingPaths = []; // Module global working path.
const workingSettings = []; // Passed settings.

// const methods = require('./fillers');
module.exports = (cncserver, drawing) => {
  // TODO: get this somewhere real.
  const settingDefaults = {
    method: 'offset', // Fill method application machine name.
    flattenResolution: 0.25, // Path overlay fill type trace resolution.
    // Pass a path object to be used for overlay fills:
    angle: 28, // Dynamic line fill type line angle
    insetAmount: 0, // Amount to negatively offset the fill path.
    randomizeAngle: true, // Randomize the angle above for dynamic line fill.
    hatch: false, // If true, runs twice at opposing angles
    spacing: 3, // Dynamic line fill spacing nominally between each line.
    threshold: 10, // Dynamic line grouping threshold
  };

  // IPC recieve message handler.
  const gotMessage = (packet, socket) => {
    const { command, data } = packet;
    switch (command) {
      // Our filler module is ready! Send it the data.
      case 'ready':
        if (workingPaths.length) {
          ipc.server.emit(socket, 'filler.init', {
            size: {
              width: drawing.base.size.width,
              height: drawing.base.size.height,
            },
            path: workingPaths.pop().exportJSON(),
            settings: workingSettings.pop(),
          });
        }
        break;

      case 'complete':
        const item = drawing.base.layers.preview.importJSON(data);
        console.log('Got the fill! Children?', item.children.length);
        cncserver.sockets.sendPaperPreviewUpdate();

        const allPaths = drawing.base.getPaths(item);
        // console.log('How many?', allPaths.length); return;

        /*
        // Move through all paths and add each one as a job.
        allPaths.forEach((path) => {
          console.log('Trace Fill Path Length', path.length);
          // Only add non-zero length path tracing jobs.
          if (path.length) {
            cncserver.actions.addItem({
              operation: 'trace',
              type: 'job',
              parent: '123',
              body: path,
            });
          }
        });
        // */
        break;

      default:
        break;
    }
  };

  // Bind to IPC serve init.
  cncserver.binder.bindTo('ipc.serve', 'filler', () => {
    // IPC server that manages the runner should be going, just bind it.
    ipc.server.on('filler.message', gotMessage);
  });

  const fill = (rawPath, parent = null, bounds = null, requestSettings = {}) => {
    // Filling method module specification:
    // 1. Each method is its own application! This file indexes the files
    //    directly for running via child fillProcess. Communication is done via
    //    standardized IPC callbacks for: init, progress, return.
    // 2. Method names define the application machine name, settings are
    //    overridden from app defaults. EG: hatch: zigsmooth, etc
    // 3. Three total expected arguments for init:
    //    * Width/Height of canvas, for coordinates
    //    * Path to fill, as JSON paper export for simple importing.
    //    * FULL fill/trace settings object
    // 4. After init, calculation begins
    // 5. IPC return is a JSON export of all the paths to be drawn, or array
    //    lines (arrays of points) that make up the lines to draw.
    // 6. When complete, the fillProcess should be ended.

    // TODO: Unify path creation from request body back in the JOB handler!
    workingPaths.push(drawing.base.normalizeCompoundPath(rawPath));

    if (bounds) {
      drawing.base.fitBounds(workingPaths[workingPaths.length - 1], bounds);
    }

    const mergedSettings = { ...settingDefaults, ...requestSettings };
    workingSettings.push(mergedSettings);

    const { method } = mergedSettings;
    const file = `cncserver.drawing.fillers.${method}`;
    const fillerAppPath = fsPath.join(
      global.__basedir, 'components', 'core', 'drawing', 'fillers', file
    );

    // Spawn fillProcess and bind basic i/o.
    const fillProcess = spawn('node', [fillerAppPath]);
    fillProcess.stdout.on('data', (rawData) => {
      const data = rawData.toString().split('\n');
      for (const i in data) {
        if (data[i].length) console.log(`FILLER: ${data[i]}`);
      }
    });

    fillProcess.stderr.on('data', (data) => {
      console.log(`FILLER ERROR: ${data}`);
    });

    fillProcess.on('exit', (exitCode) => {
      console.log(`FILLER EXITED: ${exitCode}`);
    });
  };

  return fill;
};

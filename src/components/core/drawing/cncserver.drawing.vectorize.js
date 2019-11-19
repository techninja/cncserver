/**
 * @file Code for image vectorizor management.
 */
const { spawn } = require('child_process'); // Process spawner.
const ipc = require('node-ipc'); // Inter Process Comms (shared with ).
const fsPath = require('path'); // File System path management.

// Hold onto images and settings to be injected into vectorizer apps, keyed on
// job hashes.
const workingQueue = {};

module.exports = (cncserver, drawing) => {
  // TODO: get this somewhere real.
  const settingDefaults = {
    method: 'squiggle', // Vectorizer method application machine name.
  };

  // IPC recieve message handler.
  const gotMessage = (packet, socket) => {
    const { command, data } = packet;
    switch (command) {
      // Our vectorizer module is ready! Send it the data.
      case 'ready':
        if (workingQueue[data]) {
          const { image, bounds, settings } = workingQueue[data];
          ipc.server.emit(socket, 'vectorizer.init', {
            size: {
              width: drawing.base.size.width,
              height: drawing.base.size.height,
            },
            image,
            settings,
            bounds,
          });
        }
        break;

      case 'complete':
        // TODO: Properly resolve promise via data.hash
        // TODO: Support non Paper JSON return content.

        // We have the data now, time to kill the process.
        workingQueue[data.hash].process.kill('SIGHUP');
        const item = drawing.base.layers.preview.importJSON(data.paths);

        delete workingQueue[data.hash];
        console.log('Got the vectorized image! Children?', item.children.length);
        cncserver.sockets.sendPaperPreviewUpdate();

        break;

      default:
        break;
    }
  };

  // Bind to IPC serve init.
  cncserver.binder.bindTo('ipc.serve', 'vectorizer', () => {
    // IPC server that manages the runner should be going, just bind it.
    ipc.server.on('vectorizer.message', gotMessage);
  });

  const vectorizer = (image, hash, bounds, requestSettings = {}) => {
    const settings = { ...settingDefaults, ...requestSettings };


    const { method } = settings;
    const file = `cncserver.drawing.vectorizers.${method}`;
    const vectorizerAppPath = fsPath.join(
      global.__basedir, 'components', 'core', 'drawing', 'vectorizers', file
    );

    // Spawn vectorizer process.
    const vectorizerProcess = spawn('node', [vectorizerAppPath, hash]);

    // Setup data to be sent to vectorizer app.
    workingQueue[hash] = {
      image: image.exportJSON(),
      settings,
      bounds,
      process: vectorizerProcess,
    };

    // Bind basic process events.
    vectorizerProcess.stdout.on('data', (rawData) => {
      const data = rawData.toString().split('\n');
      for (const i in data) {
        if (data[i].length) console.log(`VECTORIZER: ${data[i]}`);
      }
    });

    vectorizerProcess.stderr.on('data', (data) => {
      console.log(`VECTORIZER ERROR: ${data}`);
    });

    vectorizerProcess.on('exit', (exitCode) => {
      console.log(`VECTORIZER EXITED: ${exitCode}`);
    });
  };

  return vectorizer;
};

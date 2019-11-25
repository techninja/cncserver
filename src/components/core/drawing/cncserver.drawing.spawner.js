/**
 * @file Code for work spawning management.
 *
 * Manages secondary processes for work hash based functions.
 */
const { spawn } = require('child_process'); // Process spawner.
const ipc = require('node-ipc'); // Inter Process Comms (shared with ).
const path = require('path'); // File System path management.
const fs = require('fs');

// Hold onto paths and settings to be injected, keyed on job hashes & work type.
const workingQueue = {};

module.exports = (cncserver, drawing) => {
  // IPC recieve message handler.
  const gotMessage = (packet, socket) => {
    const { command, data } = packet;
    const spawnKey = `${data.type}-${data.hash}`;
    const workingQueueItem = workingQueue[spawnKey];

    // Catch any non-matching spawn data. This shouldn't happen, but could.
    if (!workingQueueItem) {
      throw new Error(`Spawn data item mismatch: ${data.type}-${data.hash}`);
    }

    const timeTaken = Math.round((new Date() - workingQueueItem.start) / 100) / 10;
    switch (command) {
      case 'ready':
        // Our spawned worker module is ready! Send it the initial data.
        ipc.server.emit(socket, 'spawner.init', {
          size: {
            width: drawing.base.size.width,
            height: drawing.base.size.height,
          },
          object: workingQueueItem.object,
          settings: workingQueueItem.settings,
        });

        console.log(`SPAWN ${spawnKey}: Spawned in ${timeTaken} secs`);
        break;

      case 'progress':
        // TODO: This:
        break;
      case 'complete':
        // Fulfull the promise with the worker returned result.
        workingQueueItem.success(data.result);

        // End the process, we're done with it now.
        workingQueueItem.process.kill('SIGHUP');
        console.log(`SPAWN ${spawnKey}: Completed in ${timeTaken} secs`);

        // Free up the working queue memory.
        delete workingQueue[`${data.type}-${data.hash}`];
        break;

      default:
        break;
    }
  };

  // Bind to IPC serve init.
  cncserver.binder.bindTo('ipc.serve', 'spawner', () => {
    // IPC server that manages the runner should be going, just bind it.
    ipc.server.on('spawner.message', gotMessage);
  });


  /**
   * Process spawn wrapper for work management!
   *
   * @param {string} arg.hash
   *   The hash that identifies the work.
   * @param {string} arg.type
   *   The identifier for what kind of process this is, EG 'filler'.
   * @param {string} arg.script
   *   The full path of the script to pass to the node binary.
   * @param {object} arg.object
   *   The object to be worked on, likely a Paper path.
   * @param {object} arg.settings
   *   The settings to be passed along to the spawned worker.
   *
   * @return {Promise}
   *   Promise that on success, returns processed object & original passed data,
   *   otherwise results in error if spawn process dies with non-zero exit code.
   */
  const spawner = ({
    hash, type, script, object, settings,
  }) => new Promise((success, error) => {
    const spawnKey = `${type}-${hash}`;
    const spawnData = {
      start: new Date(),
      settings,
      object,
      success,
      error,
    };

    const resolvedScript = path.resolve(script);
    if (!fs.existsSync(resolvedScript)) {
      error(new Error(`"${type}" spawn entry doesn't exist: ${resolvedScript}`));
    }

    // Spawn process and bind basic i/o.
    spawnData.process = spawn('node', [resolvedScript, hash]);
    spawnData.process.stdout.on('data', (rawData) => {
      rawData.toString().split('\n').forEach((line) => {
        if (line.length) console.log(`SPAWN ${spawnKey}: ${line}`);
      });
    });

    spawnData.process.stderr.on('data', (err) => {
      console.error(`SPAWN ERROR ${spawnKey}: ${err}`);
      spawnData.error(err);
      spawnData.process.kill('SIGHUP');
    });

    spawnData.process.on('exit', (exitCode) => {
      if (exitCode) console.log(`SPAWN EXIT ${spawnKey}: ${exitCode}`);
    });

    workingQueue[spawnKey] = spawnData;
  });

  return spawner;
};

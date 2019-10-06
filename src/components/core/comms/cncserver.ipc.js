/**
 * @file Abstraction module for all Inter Process Communication related code
 * for talking to the "runner" process, for CNC Server!
 *
 */
const { spawn } = require('child_process'); // Process spawner.
const nodeIPC = require('node-ipc'); // Inter Process Comms for runner.

// Export object.
const ipc = {};

module.exports = (cncserver) => {
  let runnerInitCallback = null; // Placeholder for init set callback.
  ipc.runnerSocket = {}; // The IPC socket for communicating to the runner

  // IPC server config.
  nodeIPC.config.silent = true;
  nodeIPC.config.id = 'cncserver';
  nodeIPC.config.retry = 1500;

  /**
   * Send a message to the runner.
   *
   * @param  {string} command
   *   The string identifier for the command in dot notation.
   * @param  {object/string} data
   *   Data to be sent message receiver on client.
   * @param  {object} socket
   *   The IPC socket to send to, defaults to initial connect socket.
   *
   * @return {null}
   */
  ipc.sendMessage = (command, data, socket = cncserver.ipc.runnerSocket) => {
    const packet = {
      command,
      data,
    };

    nodeIPC.server.emit(socket, 'app.message', packet);
  };

  /**
   * Initialize and start the IPC server
   *
   * @param  {object} options
   *   localRunner {boolean}: true if we should try to init the runner locally,
   *     false to defer starting the runner to the parent application.
   * @param  {Function} callback
   *   Function called when the runner is connected and ready.
   *
   * @return {null}
   */
  ipc.initServer = (options, callback) => {
    runnerInitCallback = callback;

    // Initialize and start the IPC Server...
    nodeIPC.serve(() => {
      cncserver.binder.trigger('ipc.serve');
      nodeIPC.server.on('app.message', ipc.ipcGotMessage);
    });

    nodeIPC.server.start();
    console.log('Starting IPC server, waiting for runner client to start...');

    if (options.localRunner) {
      // Register an event callback to shutdown the runner if we're exiting.
      process.on('SIGTERM', ipc.runner.shutdown);
      process.on('SIGINT', ipc.runner.shutdown);
      ipc.runner.init();
    }
  };


  /**
   * Helper for getting an async value from the serial port, always direct.
   *
   * @param  {string} command
   *   A named machine configuration command.
   * @param  {object} options
   *   Keyed value replacement options for the command.
   *
   * @return {Promise}
   *   Promise that will always succeed with next message from serial.
   */
  ipc.getSerialValueCallback = null;
  ipc.getSerialValue = (command, options = {}) => new Promise((resolver) => {
    process.nextTick(() => {
      ipc.sendMessage('serial.direct.command', {
        commands: [cncserver.buffer.cmdstr(command, options)],
        duration: 0,
      });

      ipc.getSerialValueCallback = resolver;
    });
  });

  /**
   * IPC Message callback event parser/handler.
   *
   * @param  {object} packet
   *   The entire message object directly from the event.
   * @param  {object} socket
   *   The originating IPC client socket object.
   *
   * @return {null}
   */
  ipc.ipcGotMessage = (packet, socket) => {
    const { callbacks: serialCallbacks } = cncserver.serial;
    const { data } = packet;
    const messages = typeof data === 'string' ? data.trim().split('\n') : [];
    const { baudRate } = cncserver.settings.botConf.get('controller');

    switch (packet.command) {
      case 'runner.ready':
        ipc.runnerSocket = socket;
        ipc.sendMessage('runner.config', {
          debug: cncserver.settings.gConf.get('debug'),
          ack: cncserver.settings.botConf.get('controller').ack,
          showSerial: cncserver.settings.gConf.get('showSerial'),
        });

        if (runnerInitCallback) runnerInitCallback();
        break;

      // Sync simulation state from runner.
      case 'serial.simulation':
        cncserver.pen.forceState({ simulation: packet ? 1 : 0 });
        break;

      case 'serial.connected':
        console.log(
          `Serial connection open at ${baudRate}bps`
        );

        cncserver.binder.trigger('serial.connected');

        if (serialCallbacks.connect) serialCallbacks.connect(data);
        if (serialCallbacks.success) serialCallbacks.success(data);
        break;

      case 'serial.disconnected':
        if (serialCallbacks.disconnect) serialCallbacks.disconnect(data);
        break;

      case 'serial.error':
        if (packet.type === 'connect') {
          console.log(
            'Serial port failed to connect. Is it busy or in use? Error #10'
          );
          console.log('SerialPort says:', packet.message);
          if (serialCallbacks.complete) serialCallbacks.complete(data);
        } else {
          // TODO: Add better error message here, or figure out when this
          // happens.
          console.log('Serial failed to send data. Error #44');
        }

        if (serialCallbacks.error) serialCallbacks.error(data);
        break;

      case 'serial.data':
        // Either get the value for a caller, or trigger generic bind.
        messages.forEach((message) => {
          if (ipc.getSerialValueCallback && message !== cncserver.settings.botConf.get('controller').ack) {
            ipc.getSerialValueCallback(message);
            ipc.getSerialValueCallback = null;
          } else {
            cncserver.binder.trigger('serial.message', message);
          }
        });
        break;

      case 'buffer.item.start':
        // Buffer action item begun to run.
        cncserver.buffer.startItem(data);
        break;

      case 'buffer.item.done':
        // Buffer item has completed.
        cncserver.buffer.removeItem(data);
        break;

      case 'buffer.empty':
        // TODO: Is this needed?
        break;

      case 'buffer.running':
        cncserver.buffer.setRunning(data);
        break;
      default:
    }
  };

  // Define the runner tracker object.
  ipc.runner = {
    process: {},

    /**
     * Start up & init the Runner process via node
     */
    init: () => {
      // TODO: Use FS path to join instead of fixed slashes.
      ipc.runner.process = spawn(
        'node',
        [`${__dirname}/../runner/cncserver.runner`]
      );

      ipc.runner.process.stdout.on('data', (rawData) => {
        const data = rawData.toString().split('\n');
        for (const i in data) {
          if (data[i].length) console.log(`RUNNER:${data[i]}`);
        }
      });

      ipc.runner.process.stderr.on('data', (data) => {
        console.log(`RUNNER ERROR: ${data}`);
      });

      ipc.runner.process.on('exit', (exitCode) => {
        // TODO: Restart it? Who knows.
        console.log(`RUNNER EXITED: ${exitCode}`);
      });
    },

    shutdown: () => {
      console.log('Killing runner process before exiting...');
      ipc.runner.process.kill();
      process.exit();
    },
  };

  return ipc;
};

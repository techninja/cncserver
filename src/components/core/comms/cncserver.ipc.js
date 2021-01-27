/**
 * @file Abstraction module for all Inter Process Communication related code
 * for talking to the "runner" process, for CNC Server!
 *
 */
import { spawn } from 'child_process'; // Process spawner.
import nodeIPC from 'node-ipc'; // Inter Process Comms for runner.
import path from 'path';
import { trigger } from 'cs/binder';
import { cmdstr, startItem, removeItem, setRunning } from 'cs/buffer';
import { gConf, botConf } from 'cs/settings';
import { callbacks as serialCallbacks } from 'cs/serial';
import { forceState } from 'cs/pen';
import { __basedir } from 'cs/utils';

// IPC server config.
nodeIPC.config.silent = true;
nodeIPC.config.id = 'cncserver';
nodeIPC.config.retry = 1500;

// TODO: Evaluate usage of state to ensure only what we need exported is exported.
export const state = {
  runnerSocket: {}, // The IPC socket for communicating to the runner
  runnerInitCallback: null, // Placeholder for init set callback.
  getSerialValueCallback: null,
};

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
export function sendMessage(command, data, socket = state.runnerSocket) {
  const packet = {
    command,
    data,
  };

  nodeIPC.server.emit(socket, 'app.message', packet);
}

// Define the runner tracker object.
export const runner = {
  process: {},

  /**
    * Start up & init the Runner process via node
    */
  init: () => {
    runner.process = spawn(
      'node',
      [path.join(__basedir, 'src', 'components', 'core', 'runner', 'cncserver.runner.js')]
    );

    runner.process.stdout.on('data', rawData => {
      const data = rawData.toString().split('\n');
      for (const i in data) {
        if (data[i].length) console.log(`RUNNER:${data[i]}`);
      }
    });

    runner.process.stderr.on('data', data => {
      console.log(`RUNNER ERROR: ${data}`);
    });

    runner.process.on('exit', exitCode => {
      // TODO: Restart it? Who knows.
      console.log(`RUNNER EXITED: ${exitCode}`);
    });
  },

  shutdown: () => {
    console.log('Killing runner process before exiting...');
    runner.process.kill();
    process.exit();
  },
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
export const getSerialValue = (command, options = {}) => new Promise(resolve => {
  process.nextTick(() => {
    sendMessage('serial.direct.command', {
      commands: [cmdstr(command, options)],
      duration: 0,
    });

    state.getSerialValueCallback = resolve;
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
export function ipcGotMessage(packet, socket) {
  const { data } = packet;
  const messages = typeof data === 'string' ? data.trim().split('\n') : [];
  const { baudRate } = botConf.get('controller');

  switch (packet.command) {
    case 'runner.ready':
      state.runnerSocket = socket;
      sendMessage('runner.config', {
        debug: gConf.get('debug'),
        ack: botConf.get('controller').ack,
        showSerial: gConf.get('showSerial'),
      });

      if (state.runnerInitCallback) state.runnerInitCallback();
      break;

    // Sync simulation state from runner.
    case 'serial.simulation':
      forceState({ simulation: packet ? 1 : 0 });
      break;

    case 'serial.connected':
      console.log(
        `Serial connection open at ${baudRate}bps`
      );

      trigger('serial.connected');

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
      messages.forEach(message => {
        if (state.getSerialValueCallback && message !== botConf.get('controller').ack) {
          state.getSerialValueCallback(message);
          state.getSerialValueCallback = null;
        } else {
          trigger('serial.message', message);
        }
      });
      break;

    case 'buffer.item.start':
      // Buffer action item begun to run.
      startItem(data);
      break;

    case 'buffer.item.done':
      // Buffer item has completed.
      removeItem(data);
      break;

    case 'buffer.empty':
      // TODO: Is this needed?
      break;

    case 'buffer.running':
      setRunning(data);
      break;
    default:
  }
}

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
export function initServer(options, callback) {
  state.runnerInitCallback = callback;

  // Initialize and start the IPC Server...
  nodeIPC.serve(() => {
    trigger('ipc.serve');
    nodeIPC.server.on('app.message', ipcGotMessage);
  });

  nodeIPC.server.start();
  console.log('Starting IPC server, waiting for runner client to start...');

  if (options.localRunner) {
    // Register an event callback to shutdown the runner if we're exiting.
    process.on('SIGTERM', runner.shutdown);
    process.on('SIGINT', runner.shutdown);
    runner.init();
  }
}

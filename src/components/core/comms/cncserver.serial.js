/**
 * @file Abstraction module for all serial related code for CNC Server!
 *
 * Taking in only the global CNCServer object, add's the "serial" object.
 *
 */
import SerialPort from 'serialport';
import * as ipc from 'cs/ipc';
import * as server from 'cs/server';
import { botConf, gConf } from 'cs/settings';
import { state as penState, forceState } from 'cs/pen';
import { initAPI as initScratch } from 'cs/scratch';

export const callbacks = {}; // Hold global serial connection/error callbacks.

// Board support provided setup commands to be run on serial connect.
export const state = {
  setupCommands: [],
  connectPath: '{auto}',
};

// Setup command setter.
export function setSetupCommands(commands) {
  state.setupCommands = commands;
}

/**
  * Helper function to implement matching port information to configured bot
  * parameters.
  *
  * Attempts to match SerialPort.list output to parameters and set global
  * 'serialPath' to matching port.
  *
  * @param {object} botControllerConf
  *   The configured bot controller to try to match
  * @param {function} callback
  *   The callback function when async getports completes. Returns single
  *   object argument containing three keys:
  *     auto {array}: Array of auto detected port names based on bot conf.
  *       Empty array if none found.
  *     names {array}: Clean flat array of all available comm paths/port names.
  *     full {array}: Array of all valid serial port objects for debugging.
  */
export function autoDetectPort(botControllerConf, callback) {
  const botMaker = botControllerConf.manufacturer.toLowerCase();
  const botProductId = parseInt(botControllerConf.productId.toLowerCase(), 10);
  const botName = botControllerConf.name.toLowerCase();

  // Output data arrays.
  const detectList = [];
  const portNames = [];
  const cleanList = [];

  SerialPort.list().then(ports => {
    ports.forEach(port => {
      const portMaker = (port.manufacturer || '').toLowerCase();
      // Convert reported product ID from hex string to decimal.
      const portProductId = parseInt(
        `0x${(port.productId || '').toLowerCase()}`,
        16 // TODO: Is this right?
      );
      const portPnpId = (port.pnpId || '').toLowerCase();

      // Add this port to the clean list if its vendor ID isn't undefined.
      if (typeof port.vendorId !== 'undefined') {
        cleanList.push(port);
        portNames.push(port.comName);
      }

      // OS specific board detection based on serialport 2.0.5
      switch (process.platform) {
        case 'win32':
          // Match by manufacturer partial only.
          if (portMaker.indexOf(botMaker) !== -1) {
            detectList.push(port.comName);
          }

          break;
        default: // includes 'darwin', 'linux'
          // Match by Exact Manufacturer...
          if (portMaker === botMaker) {
            // Match by exact product ID (hex to dec), or PNP ID partial
            if (portProductId === botProductId
                || portPnpId.indexOf(botName) !== -1) {
              detectList.push(port.comName);
            }
          }
      }
    });

    callback({ auto: detectList, names: portNames, full: cleanList });
  }).catch(err => {
    // TODO: Catch errors thrown here.
    // err = err;
  });
}

/**
  * Helper function to manage initial serial connection and reconnection.
  *
  * @param {object} options
  *   Holds all possible callbacks for the serial connection:
  *     connect: Callback for successful serial connect event
  *     success: Callback for general success
  *     error: Callback for init/connect error, arg of error string/object
  *     disconnect: Callback for close/unexpected disconnect
  *     complete: Callback for general completion
  */
export function connect(options) {
  // Apply any passed callbacks to a new serial callbacks object.
  callbacks.connect = options.connect;
  callbacks.disconnect = options.disconnect;
  callbacks.error = options.error;
  callbacks.success = options.success;

  // Run everything through the callback as port list is async.
  console.log('Finding available serial ports...');
  const botController = botConf.get('controller');
  autoDetectPort(botController, ports => {
    // Give some console feedback on ports.
    if (gConf.get('debug')) {
      console.log('Full Available Port Data:', ports.full);
    } else {
      const names = ports.names.length ? ports.names.join(', ') : '[NONE]';
      console.log(`Available Serial ports: ${names}`);
    }

    const passedPort = gConf.get('serialPath');
    if (passedPort === '' || passedPort === '{auto}') {
      if (ports.auto.length) {
        gConf.set('serialPath', ports.auto[0]);
        console.log(`Using first detected port: "${ports.auto[0]}"...`);
      } else {
        console.error('No matching serial ports detected.');
      }
    } else {
      console.log(`Using passed serial port "${passedPort}"...`);
    }

    // Send connect to runner...
    const connectPath = gConf.get('serialPath');

    // Try to connect to serial, or exit with error code.
    if (connectPath === '' || connectPath === '{auto}') {
      console.error(
        `Error #22: ${botController.name} not found. \
        Are you sure it's connected?`
      );

      if (options.error) {
        options.error({
          message: `${botController.name} not found.`,
          type: 'notfound',
        });
      }
    } else {
      console.log(`Attempting to open serial port: "${connectPath}"...`);

      const connectData = {
        port: connectPath,
        baudRate: Number(botController.baudRate),
        autoReconnect: true,
        autoReconnectTries: 20,
        autoReconnectRate: 5000,
        setupCommands: state.setupCommands,
      };

      ipc.sendMessage('serial.connect', connectData);
    }
  });
}

// Util function to just get the full port output from exports.
export function getPorts(cb) {
  SerialPort.list((err, ports) => {
    cb(ports, err);
  });
}

// Local triggers.
export function localTrigger(event) {
  const restriction = gConf.get('httpLocalOnly') ? 'localhost' : '*';
  const port = gConf.get('httpPort');
  const isVirtual = penState.simulation ? ' (simulated)' : '';

  switch (event) {
    case 'simulationStart':
      console.log('=======Continuing in SIMULATION MODE!!!============');
      forceState({ simulation: 1 });
      break;

    case 'serialReady':
      console.log(`CNC server API listening on ${restriction}:${port}`);

      forceState({ simulation: 0 });
      localTrigger('botInit');
      server.start();

      // Initialize scratch v2 endpoint & API.
      // TODO: This needs to be moved out into something more self contained.
      if (gConf.get('scratchSupport')) {
        initScratch();
      }
      break;

    case 'serialClose':
      console.log(
        `Serialport connection to "${gConf.get(
          'serialPath'
        )}" lost!! Did it get unplugged?`
      );

      // Assume the serialport isn't coming back... It's on a long vacation!
      gConf.set('serialPath', '');
      localTrigger('simulationStart');
      break;

    case 'botInit':
      console.info(
        `---=== ${botConf.get(
          'name'
        )}${isVirtual} is ready to receive commands ===---`
      );
      break;
    default:
  }
}

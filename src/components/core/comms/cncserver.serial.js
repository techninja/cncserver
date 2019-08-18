/**
 * @file Abstraction module for all serial related code for CNC Server!
 *
 * Taking in only the global CNCServer object, add's the "serial" object.
 *
 */
const SerialPort = require('serialport');

const serial = {}; // Export interface object;

module.exports = (cncserver) => {
  serial.callbacks = {}; // Hold global serial connection/error callbacks.
  serial.connectPath = '{auto}';

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
  serial.connect = (options) => {
    // Apply any passed callbacks to a new serial callbacks object.
    serial.callbacks = {
      connect: options.connect,
      disconnect: options.disconnect,
      error: options.error,
      success: options.success,
    };

    // Run everything through the callback as port list is async.
    console.log('Finding available serial ports...');
    const botController = cncserver.settings.botConf.get('controller');
    cncserver.serial.autoDetectPort(botController, (ports) => {
      // Give some console feedback on ports.
      if (cncserver.settings.gConf.get('debug')) {
        console.log('Full Available Port Data:', ports.full);
      } else {
        const names = ports.names.length ? ports.names.join(', ') : '[NONE]';
        console.log(`Available Serial ports: ${names}`);
      }

      const passedPort = cncserver.settings.gConf.get('serialPath');
      if (passedPort === '' || passedPort === '{auto}') {
        if (ports.auto.length) {
          cncserver.settings.gConf.set('serialPath', ports.auto[0]);
          console.log(`Using first detected port: "${ports.auto[0]}"...`);
        } else {
          console.error('No matching serial ports detected.');
        }
      } else {
        console.log(`Using passed serial port "${passedPort}"...`);
      }

      // Send connect to runner...
      const connectPath = cncserver.settings.gConf.get('serialPath');

      // Try to connect to serial, or exit with error code.
      if (connectPath === '' || connectPath === '{auto}') {
        console.log(
          `${botController.name} not found. \
          Are you sure it's connected? Error #22`
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
        };

        cncserver.ipc.sendMessage('serial.connect', connectData);
      }
    });
  };

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
  serial.autoDetectPort = (botControllerConf, callback) => {
    const botMaker = botControllerConf.manufacturer.toLowerCase();
    const botProductId = parseInt(botControllerConf.productId.toLowerCase(), 10);
    const botName = botControllerConf.name.toLowerCase();

    // Output data arrays.
    const detectList = [];
    const portNames = [];
    const cleanList = [];

    SerialPort.list((err, ports) => {
      // TODO: Catch errors thrown here.
      err = err;

      ports.forEach((port) => {
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
    });
  };

  // Util function to just get the full port output from exports.
  serial.getPorts = (cb) => {
    SerialPort.list((err, ports) => {
      cb(ports, err);
    });
  };

  // Local triggers.
  serial.localTrigger = (event) => {
    const restriction = cncserver.settings.gConf.get('httpLocalOnly') ? 'localhost' : '*';
    const port = cncserver.settings.gConf.get('httpPort');
    const isVirtual = cncserver.pen.state.simulation ? ' (simulated)' : '';

    switch (event) {
      case 'simulationStart':
        console.log('=======Continuing in SIMULATION MODE!!!============');
        cncserver.pen.forceState({ simulation: 1 });
        break;

      case 'serialReady':
        console.log(`CNC server API listening on ${restriction}:${port}`);

        cncserver.serial.localTrigger('botInit');
        cncserver.server.start();

        // Initialize scratch v2 endpoint & API.
        // TODO: This needs to be moved out into something more self contained.
        if (cncserver.settings.gConf.get('scratchSupport')) {
          cncserver.scratch.initAPI();
        }
        break;

      case 'serialClose':
        console.log(
          `Serialport connection to "${cncserver.settings.gConf.get(
            'serialPath'
          )}" lost!! Did it get unplugged?`
        );

        // Assume the serialport isn't coming back... It's on a long vacation!
        cncserver.settings.gConf.set('serialPath', '');
        cncserver.serial.localTrigger('simulationStart');
        break;

      case 'botInit':
        // EBB Specific Config =================================
        if (cncserver.settings.botConf.get('controller').name === 'EiBotBoard') {
          console.log('Sending EBB config...');
          cncserver.run(
            'custom',
            cncserver.buffer.cmdstr(
              'enablemotors',
              { p: cncserver.settings.botConf.get('speed:precision') }
            )
          );

          // Send twice for good measure
          const rate = cncserver.settings.botConf.get('servo:rate');
          cncserver.run(
            'custom',
            cncserver.buffer.cmdstr('configureservo', { r: rate })
          );
          cncserver.run(
            'custom',
            cncserver.buffer.cmdstr('configureservo', { r: rate })
          );
        }

        console.info(
          `---=== ${cncserver.settings.botConf.get(
            'name'
          )}${isVirtual} is ready to receive commands ===---`
        );
        break;
      default:
    }
  };

  /**
   * Run to the buffer direct low level setup commands (for EiBotBoard only).
   *
   * @param {integer} id
   *   Numeric ID of EBB setting to change the value of
   * @param {integer} value
   *   Value to set to
   */
  serial.sendEBBSetup = (id, value) => {
    cncserver.run('custom', `SC,${id},${value}`);
  };

  // Exports...
  serial.exports = {
    getPorts: serial.getPorts,
    sendEBBSetup: serial.sendEBBSetup,
  };

  return serial;
};

/**
 * @file Abstraction module for all serial related code for CNC Server!
 *
 * Taking in only the global CNCServer object, add's the "serial" object.
 *
 */
const SerialPort = require('serialport');

module.exports = (cncserver) => {
  cncserver.serial = {
    callbacks: {}, // Hold global serial connection/error callbacks.
    connectPath: '{auto}',
  };

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
  cncserver.serial.connect = (options) => {
    // Apply any passed callbacks to a new serial callbacks object.
    cncserver.serial.callbacks = {
      connect: options.connect,
      disconnect: options.disconnect,
      error: options.error,
      success: options.success,
    };

    // Run everything through the callback as port list is async.
    console.log('Finding available serial ports...');
    const botController = cncserver.botConf.get('controller');
    cncserver.serial.autoDetectPort(botController, (ports) => {
      // Give some console feedback on ports.
      if (cncserver.gConf.get('debug')) {
        console.log('Full Available Port Data:', ports.full);
      } else {
        const names = ports.names.length ? ports.names.join(', ') : '[NONE]';
        console.log(`Available Serial ports: ${names}`);
      }

      const passedPort = cncserver.gConf.get('serialPath');
      if (passedPort === '' || passedPort === '{auto}') {
        if (ports.auto.length) {
          cncserver.gConf.set('serialPath', ports.auto[0]);
          console.log(`Using first detected port: "${ports.auto[0]}"...`);
        } else {
          console.error('No matching serial ports detected.');
        }
      } else {
        console.log(`Using passed serial port "${passedPort}"...`);
      }

      // Send connect to runner...
      const connectPath = cncserver.gConf.get('serialPath');

      // Try to connect to serial, or exit with error code.
      if (connectPath === '' || connectPath === '{auto}') {
        console.log(
          `${botController.name} not found.
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
  cncserver.serial.autoDetectPort = (botControllerConf, callback) => {
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
              if (portProductId === botProductId ||
                  portPnpId.indexOf(botName) !== -1) {
                detectList.push(port.comName);
              }
            }
        }
      });

      callback({ auto: detectList, names: portNames, full: cleanList });
    });
  };

  // Cheap wrapper!
  cncserver.serial.command = (cmd) => {
    cncserver.ipc.sendMessage('serial.direct.write', cmd);
  };

  // Util function to just get the full port output from exports.
  cncserver.serial.getPorts = (cb) => {
    SerialPort.list((err, ports) => {
      cb(ports, err);
    });
  };

  const restriction = cncserver.gConf.get('httpLocalOnly') ? 'localhost' : '*';
  const port = cncserver.gConf.get('httpPort');
  const isVirtual = cncserver.pen.simulation ? ' (simulated)' : '';

  // Local triggers.
  cncserver.serial.localTrigger = (event) => {
    switch (event) {
      case 'simulationStart':
        console.log('=======Continuing in SIMULATION MODE!!!============');
        cncserver.pen.simulation = 1;
        break;

      case 'serialReady':
        console.log(`CNC server API listening on ${restriction}:${port}`);

        cncserver.serial.localTrigger('botInit');
        cncserver.srv.start();

        // Initialize scratch v2 endpoint & API.
        if (cncserver.gConf.get('scratchSupport')) {
          cncserver.scratch.initAPI(cncserver);
        }
        break;

      case 'serialClose':
        console.log(
          `Serialport connection to "${cncserver.gConf.get(
            'serialPath'
          )}" lost!! Did it get unplugged?`
        );

        // Assume the serialport isn't coming back... It's on a long vacation!
        cncserver.gConf.set('serialPath', '');
        cncserver.serial.localTrigger('simulationStart');
        break;

      case 'botInit':
        // EBB Specific Config =================================
        if (cncserver.botConf.get('controller').name === 'EiBotBoard') {
          console.log('Sending EBB config...');
          cncserver.run(
            'custom',
            cncserver.buffer.cmdstr(
              'enablemotors',
              {p: cncserver.botConf.get('speed:precision')}
            )
          );

          // Send twice for good measure
          const rate = cncserver.botConf.get('servo:rate');
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
          `---=== ${cncserver.botConf.get(
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
  cncserver.serial.sendEBBSetup = (id, value) => {
    cncserver.run('custom', `SC,${id},${value}`);
  };

  // Exports...
  cncserver.exports.getPorts = cncserver.serial.getPorts;
  cncserver.exports.sendEBBSetup = cncserver.serial.sendEBBSetup;
};

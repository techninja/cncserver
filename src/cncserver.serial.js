"use strict";

/**
 * @file Abstraction module for all serial related code for CNC Server!
 *
 * Taking in only the global CNCServer object, add's the "serial" object.
 *
 */


var serialport = require("serialport");
//var SerialPort = serialport.SerialPort; Where is this used?

module.exports = function(cncserver){
  cncserver.serial = {
    callbacks: {}, // Hold global serial connection/error callbacks.
    connectPath: '{auto}'
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
  cncserver.serial.connect = function (options) {
    // Apply any passed callbacks to a new serial callbacks object.
    cncserver.serial.callbacks = {
      connect: options.connect,
      disconnect: options.disconnect,
      error: options.error,
      success: options.success,
    };

    // Run everything through the callback as port list is async.
    console.log('Finding available serial ports...');
    var botController = cncserver.botConf.get('controller');
    cncserver.serial.autoDetectPort(botController, function(ports){
      // Give some console feedback on ports.
      if (cncserver.gConf.get('debug')) {
        console.log('Full Available Port Data:', ports.full);
      } else {
        var names = ports.names.length ? ports.names.join(', ') : '[NONE]';
        console.log('Available Serial ports: ' + names);
      }

      var passedPort = cncserver.gConf.get('serialPath');
      if (passedPort === "" || passedPort === '{auto}') {
        if (ports.auto.length) {
          cncserver.gConf.set('serialPath', ports.auto[0]);
          console.log('Using first detected port: "' + ports.auto[0] + '"...');
        } else {
          console.warning('No matching serial ports detected.');
        }
      } else {
        console.log('Using passed serial port "' + passedPort + '"...');
      }

      // Send connect to runner...
      var connectPath = cncserver.gConf.get('serialPath');

      // Try to connect to serial, or exit with error code.
      if (connectPath === "" || connectPath === '{auto}') {
        console.log(
          botController.name + " not found. " +
          "Are you sure it's connected? Error #22"
        );

        if (options.error) options.error(botController.name + ' not found.');
      } else {
        console.log('Attempting to open serial port: "' + connectPath + '"...');

        var connectData =  {
          port: connectPath,
          baudrate : Number(botController.baudRate)
        };

        cncserver.ipc.sendMessage('serial.connect', connectData);
      }
    });
  };

  /**
   * Helper function to implement matching port information to configured bot
   * parameters.
   *
   * Attempts to match serialport.list output to parameters and set global
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
  cncserver.serial.autoDetectPort = function (botControllerConf, callback) {
    var botMaker = botControllerConf.manufacturer.toLowerCase();
    var botProductId = botControllerConf.productId.toLowerCase();

    // Output data arrays.
    var detectList = [];
    var portNames = [];
    var cleanList = [];

    serialport.list(function (err, ports) {

      // TODO: Catch errors thrown here.
      err = err;

      for (var portID in ports){
        var port = ports[portID];
        var portMaker = (port.manufacturer || "").toLowerCase();
        var portProductId = (port.productId || "").toLowerCase();

        // Add this port to the clean list if its vendor ID isn't undefined.
        if (port.vendorId.indexOf('undefined') === -1) {
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
          // Match by contains productID and exact Manufacturer.
          if (portMaker === botMaker) {
            if (portProductId.indexOf(botProductId) !== -1) {
              detectList.push(port.comName);
            }
          }
        }
      }

      callback({auto: detectList, names: portNames, full: cleanList});
    });
  };

  // Cheap wrapper!
  cncserver.serial.command = function(cmd) {
    cncserver.ipc.sendMessage('serial.direct.write', cmd);
  };

  // Util function to just get the full port output from exports.
  cncserver.serial.getPorts = function(cb) {
    require("serialport").list(function (err, ports) {
      cb(ports, err);
    });
  };

  // Exports...
  cncserver.exports.getPorts = cncserver.serial.getPorts;
};

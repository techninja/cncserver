/**
 * @file CNC Server runner serial port wrapper code, used to manage direct
 * serial writes and batch processes.
 */
// Base serialport module globals.
const SerialPort = require('serialport');


// State vars.
let port;
let simulation = true;

// Event bindings object and helpers.
let bindings = {
  triggerBind: (name, ...args) => {
    if (bindings[name] && typeof bindings[name] === 'function') {
      bindings[name](...args);
    }
  },
};

/**
 * Setter for simulation state change.
 *
 * @param  {string} command
 *   Command to write to the connected serial port, sans delimiter.
 * @param  {function} callback
 *   Callback when it should be sent/drained.
 */
const setSimulation = (status) => {
  simulation = !!status;
  bindings.triggerBind('simulation', simulation);
};

/**
 * Write and drain a string to the connected serial port.
 *
 * @param  {string} command
 *   Command to write to the connected serial port, sans delimiter.
 * @param  {function} callback
 *   Callback when it should be sent/drained.
 */
const write = (command, callback) => {
  if (simulation) {
    if (global.config.showSerial) console.info(`Simulating serial write: ${command}`);
    setTimeout(() => {
      bindings.triggerBind('read', global.config.ack);
      if (callback) callback(null);
    }, 1);
  } else {
    if (global.config.showSerial) console.info(`Executing serial write: ${command}`);
    if (global.debug) console.time('SerialSendtoDrain');
    try {
      // It should realistically never take longer than half a second to send.
      const writeTimeout = setTimeout(() => {
        console.error('WRITE TIMEOUT, COMMAND FAILED:', command);
      }, 500);

      port.write(`${command}\r`, 'ascii', () => {
        clearTimeout(writeTimeout);
        port.drain(() => {
          port.flush(() => {
            if (global.debug) console.timeEnd('SerialSendtoDrain');
            if (callback) callback(null);
          });
        });
      });
    } catch (err) {
      console.error('Failed to write to the serial port!:', err);
      bindings.triggerBind('error', 'data', err);
      if (callback) callback(err);
    }
  }
};

/**
 * Execute a set of commands representing a single buffer action item to write,
 * callback will be executed when fully sent out to machine.
 *
 * @param {array} commands
 *  Array of regular/dynamic string commands to all be sent in order.
 *
 * @returns {boolean}
 *   True if success, false if failure
 */
const writeMultiple = (commands, callback, index = 0) => {
  // Ensure commands is an array if only one sent.
  if (typeof commands === 'string') {
    // eslint-disable-next-line no-param-reassign
    commands = [commands];
  }

  // Run the command at the index.
  write(commands[index], (err) => {
    // eslint-disable-next-line no-param-reassign
    index++; // Increment the index.

    // If we had a write error on any command, return immediately.
    if (err) {
      callback(err);
      return;
    }

    // Now that the serial command has drained to the bot, run the next, or end?
    if (index < commands.length) {
      // Run the next one.
      writeMultiple(commands, callback, index);
    } else {
      // End, no more commands left.
      // Timeout the next command send to avoid callstack addition.
      setTimeout(callback, null);
    }
  });

  return true;
};

let retries = 0;
const handleConnectionError = (err, options) => {
  console.log('CONNECTION ERROR ====================');
  if (global.debug) console.log(`SerialPort says: ${err.toString()}`);

  if (options.autoReconnect && retries <= options.autoReconnectTries) {
    retries++;
    console.log(`Serial connection to "${options.port}" failed, retrying ${retries}/${options.autoReconnectTries}`);
    setTimeout(() => {
      module.exports.connect(options);
    }, options.autoReconnectRate);
  } else {
    setSimulation(true);
    bindings.triggerBind('error', 'connect', err);
    bindings.triggerBind('close', err);
  }
};

// Exported connection function.
const connect = (options) => {
  if (global.debug) console.log(`Connect to: ${JSON.stringify(options)}`);
  global.connectOptions = options;

  // Note: runner doesn't do autodetection.
  try {
    port = new SerialPort(options.port, options, (err) => {
      if (!err) {
        retries = 0;
        setSimulation(false);
        const { Readline } = SerialPort.parsers;
        const parser = port.pipe(new Readline({ delimiter: '\r' }));

        // Send setup commands
        if (options.setupCommands.length) {
          console.log('Sending bot specific board setup...');
          writeMultiple(options.setupCommands, (error) => {
            if (global.debug && error) {
              console.log(`SerialPort says: ${error.toString()}`);
            }
          });
        }

        // Trigger connect binding.
        bindings.triggerBind('connect', options);

        // Bind read, reconnect logic and close/disconnect.
        parser.on('data', bindings.read);
        port.on('close', (error) => {
          if (error.disconnect) bindings.triggerBind('disconnect');
          // If we got disconnected, throw to the try/catch for reconnect.
          handleConnectionError(error, options);
        });
      } else {
        handleConnectionError(err, options);
      }
    });
  } catch (err) {
    handleConnectionError(err, options);
  }
};

// Build direct export object.
module.exports = {
  connect,
  write,
  writeMultiple,
  triggerBind: bindings.triggerBind,
  bindAll: (newBindings = {}) => {
    bindings = { ...bindings, ...newBindings };
  },
};

/*jslint node: true */
"use strict";

/**
 * @file CNC Server IPC runner. Handles outputting serial commands with the
 * correct timing, so the main thread can be as bogged down as it wants, this
 * process will remain untouched as long as there's a CPU to handle it.
 *
 * This is an entirely separated application that runs connected only via IPC
 * socket messages, always use the API to communicate, not this.
 */

// REQUIRES ====================================================================
var SerialPort = require("serialport");
var ipc = require('node-ipc');

// CONFIGURATION ===============================================================
ipc.config.id = 'cncrunner';
ipc.config.silent = true;
ipc.config.retry = 1000;
ipc.config.maxRetries = 10;

// RUNNER STATE ================================================================
var simulation = true; // Assume simulation mode by default.
var port = false; // The running port, once initiated.
var buffer = [];
var bufferRunning = false;
var bufferPaused = false;
var bufferExecuting = false;
var bufferDirectBusy = false;

// Runner config defaults, overridden on ready.
var config = {
  ack: "OK",
  debug: false,
  showSerial: false
};

// Catch any uncaught error.
process.on('uncaughtException', function(err) {
  // Assume Disconnection and kill the process.
  disconnectSerial(err);
  console.error('Uncaught error, disconnected from server, shutting down');
  console.error(err);
  process.exit(0);
});

ipc.connectTo(
  'cncserver',
  function(){
    ipc.of.cncserver.on('connect', function(){
        console.log('Connected to CNCServer!');
        sendMessage('runner.ready');
      }
    );

    ipc.of.cncserver.on('disconnect', function(){
        //ipc.log('Disconnected from server, shutting down'.notice);
        //process.exit(0);
      }
    );

    ipc.of.cncserver.on('destroy', function(){
        console.log('All Retries failed or disconnected, shutting down');
        process.exit(0);
      }
    );
    ipc.of.cncserver.on('app.message', gotMessage);
  }
);

/**
 * Send an IPC message to the server.
 *
 * @param  {[type]} command
 *   Command name, in dot notation.
 * @param  {[type]} data
 *   Command data (optional).
 *
 * @return {null}
 */
function sendMessage(command, data) {
  if (!data) {
    data = {};
  }

  var packet = {
    command: command,
    data: data
  };

  ipc.of.cncserver.emit('app.message', packet);
}

/**
 * IPC Message callback event parser/handler.
 *
 * @param  {object} packet
 *   The entire message object directly from the event.
 *
 * @return {null}
 */
function gotMessage(packet) {
  var data = packet.data;

  switch(packet.command) {
    case "runner.config":
      config = data;
      if (config.debug) console.log('Config data:' + JSON.stringify(config));
      break;
    case "runner.shutdown":
      console.log('Recieved kill signal from host, shutting down runner.');
      process.exit(0);
      break;
    case "serial.connect":
      connectSerial(data);
      break;
    case "serial.direct.command":
      // Running a set of commands at exactly the same time as another with no
      // queue/buffer to manage it would be... a frightening mess.
      if (!bufferDirectBusy) {
        bufferDirectBusy = true;
        executeCommands(data.commands, function(){
          bufferDirectBusy = false;
        });
      }
      break;
    case "serial.direct.write":
      serialWrite(data);
      break;
    case "buffer.add": // Add to the end of the buffer, last to be executed.
      // Buffer item data comes in in the following object format:
      //   hash {string}      : The tracking hash for this buffer item.
      //   commands {array}   : Array of rendered serial command strings.
      buffer.unshift(data);
      break;
    case "buffer.pause": // Pause the running of the buffer.
      bufferPaused = true;
      console.log('BUFFER PAUSED');
      break;
    case "buffer.resume": // Resume running of the buffer.
      bufferPaused = false;
      executeNext();
      console.log('BUFFER RESUMED');
      break;
    case "buffer.clear": // Clear the entire buffer.
      buffer = [];
      if (simulation) {
        executeNext();
        console.log('BUFFER CLEARED');
      } else {
        port.flush(function() {
          executeNext();
          console.log('BUFFER CLEARED');
        });
      }
      break;
  }
}

// Runner doesn't do any autodetection, just connects to whatever server says to
function connectSerial(options) {
  if (config.debug) console.log('Connect to:' + JSON.stringify(options));
  try {
    port = new SerialPort(options.port, options, function(err) {
      if (!err) {
        simulation = false;
        sendMessage('serial.connected');
        console.log('CONNECTED TO ', options.port);

        var Readline = SerialPort.parsers.Readline;
        var parser = port.pipe(new Readline({delimiter: '\r'}));
        parser.on("data", serialReadline);
        port.on("disconnect", disconnectSerial);
        port.on("close", disconnectSerial);
      } else {
        simulation = true;
        if (config.debug) console.log('SerialPort says:' + JSON.stringify(err));
        sendMessage('serial.error', {type:'connect', message: err});
      }
    });
  } catch(err) {
    simulation = true;
    console.log('SerialPort says:' + JSON.stringify(err));
    sendMessage('serial.error', {type:'connect', message: err});
  }
}

function disconnectSerial(err) {
  console.log('Serial Disconnected!'.error + JSON.stringify(err));
  sendMessage('serial.disconnected', {message: err});
}


/**
 * Execute a set of commands representing a single buffer action item to write,
 * callback will be executed when fulley sent out to machine.
 *
 * @param {array} commands
 *  Array of regular/dynamic string commands to all be sent in order.
 *
 * @returns {boolean}
 *   True if success, false if failure
 */
function executeCommands(commands, callback, index) {
  // Run each command by index, defaulting with 0.
  if (typeof index === 'undefined') {
    index = 0;
  }

  // Ensure commands is an array if only one sent.
  if (typeof commands === 'string') {
    commands = [commands];
  }

  // Run the command at the index.
  serialWrite(commands[index], function(){
    index++; // Increment the index.

    // Now that the serial command has drained to the bot, run the next, or end?
    if (index < commands.length) {
      // Run the next one.
      executeCommands(commands, callback, index);
    } else {
      // End, no more commands left.
      // Timeout the next command send to avoid callstack addition.
      setTimeout(callback, 0);
    }

  });

  return true;
}

/**
 * Execute the next command in the buffer, triggered by self, buffer interval
 * catcher loop below.
 */
function executeNext() {
  // Don't continue execution if paused or already executing.
  if (bufferPaused || bufferExecuting) return;

  // Process a single line of the buffer =====================================
  if (buffer.length) {
    var item = buffer.pop();
    if (config.debug) console.log('RUNNING ITEM: ' + item.hash);
    sendMessage('buffer.item.start', item.hash);
    bufferExecuting = true;

    // Some items don't have any rendered commands, only run those that do!
    if (item.commands.length) {
      executeCommands(item.commands, function(){
        if (config.debug) console.log('ITEM DONE: ' + item.hash);
        sendMessage('buffer.item.done', item.hash);
        bufferExecuting = false;
        executeNext();
      });
    } else {
      // This buffer item doesn't have any serial commands, we're done here :)
      sendMessage('buffer.item.done', item.hash);
      bufferExecuting = false;
      if (config.debug) console.log('NO COMMANDS ITEM: ' + item.hash);
      executeNext();
    }
  } else {
    sendMessage('buffer.empty');
    // Buffer Empty.
    bufferRunning = false;
    bufferExecuting = false;
    sendMessage('buffer.running', bufferRunning);
  }
}

// Buffer interval catcher, starts running as soon as items exist in the buffer.
setInterval(function(){
  if (buffer.length && !bufferRunning && !bufferPaused) {
    bufferRunning = true;
    sendMessage('buffer.running', bufferRunning);
    executeNext();
  }
}, 10);


/**
 * Write and drain a string to the connected serial port.
 *
 * @param  {string} command
 *   Command to write to the connected serial port, sans delimiter.
 * @param  {function} callback
 *   Callback when it should be sent/drained.
 */
function serialWrite (command, callback) {
  if (simulation) {
    if (config.showSerial) console.info('Simulating serial write: ' + command);
    setTimeout(function(){
      serialReadline(config.ack);
      if (callback) callback();
    }, 1);
  } else {
    if (config.showSerial) console.info('Executing serial write: ' + command);
    if (config.debug) console.time('SerialSendtoDrain');
    try {
      // It should realistically never take longer than half a second to send.
      var writeTimeout = setTimeout(function() {
        console.error('WRITE TIMEOUT, COMMAND FAILED:', command);
      }, 500);

      port.write(command + "\r", 'ascii', function() {
        port.drain(function() {
          clearTimeout(writeTimeout);
          port.flush(function() {
            if (config.debug) console.timeEnd('SerialSendtoDrain');
            if (callback) callback();
          });
        });
      });
    } catch(e) {
      console.error('Failed to write to the serial port!:', e);
      sendMessage('serial.error', {type:'data', message: e});
      if (callback) callback(false);
    }
  }
}

/**
 * Callback event function initialized on connect to handle incoming data.
 *
 * @param {string} data
 *   Incoming data from serial port
 */
function serialReadline(data) {
  sendMessage('serial.data', data.toString());
}

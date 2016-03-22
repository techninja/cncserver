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

// What does this thing need?
// * A buffer of serial commands
// * The ability to add to the front or back of the buffer.
// * Pause/resume execution
// * Send a command directly/immediately.
// * Run a named callback/special command (only non-serial command)

// REQUIRES ====================================================================
var serialport = require("serialport");
var ipc = require('node-ipc');

// CONFIGURATION ===============================================================
ipc.config.id = 'cncrunner';
ipc.config.retry = 1000;
ipc.config.maxRetries = 10;

var serialPort = false;
var SerialPort = serialport.SerialPort;

// RUNNER STATE ================================================================
var simulation = true; // Assume simulation mode by default.
var buffer = [];
var bufferRunning = false;
var bufferPaused = false;

// Runner config defaults, overridden on ready.
var config = {
  maximumBlockingCallStack: 100,
  bufferLatencyOffset: 20,
  ack: "OK",
  debug: false
};

// Catch any uncaught error.
process.on('uncaughtException', function(err) {
  // Assume Disconnection and kill the process.
  disconnectSerial(err);
  ipc.log('Uncaught error, disconnected from server, shutting down'.error);
  ipc.log(err);
  process.exit(0);
});

ipc.connectTo(
  'cncserver',
  function(){
    ipc.of.cncserver.on('connect', function(){
        ipc.log('Connected to CNCServer!'.rainbow, ipc.config.delay);
        sendMessage('runner.ready');
      }
    );

    ipc.of.cncserver.on('disconnect', function(){
        //ipc.log('Disconnected from server, shutting down'.notice);
        //process.exit(0);
      }
    );

    ipc.of.cncserver.on('destroy', function(){
        ipc.log('All Retries failed or disconnected, shutting down'.notice);
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
      break;
    case "serial.connect":
      connectSerial(data);
      break;
    case "serial.direct.command":
      executeCommands(data.command, data.duration);
      break;
    case "serial.direct.write":
      serialWrite(data);
      break;
    case "buffer.add": // Add to the end of the buffer, last to be executed.
      // Buffer item data comes in in the following object format:
      //   hash {string}      : The tracking hash for this buffer item.
      //   commands {array}   : Array of rendered serial command strings.
      //   duration {integer} : The duration in milliseconds.
      buffer.unshift(data);
      break;
    case "buffer.pause": // Pause the running of the buffer.
      // xxx
      break;
    case "buffer.resume": // Resume running of the buffer.
      // xxx
      break;
    case "buffer.clear": // Clear the entire buffer.
      // xxx
      break;
  }
}

// Runner doesn't do any autodetection, just connects to whatever server says to
function connectSerial(options) {
  options.disconnectedCallback = disconnectSerial;
  options.parser = serialport.parsers.readline("\r");

  try {
    serialPort = new SerialPort(options.port, options, true, function(err){
      if (!err) {
        simulation = false;
        sendMessage('serial.connected');
        ipc.log('CONNECTED TO '.rainbow, options.port);
        serialPort.on("data", serialReadline);
      } else {
        simulation = true;
        console.log('SerialPort says:', err);
        sendMessage('serial.error', {type:'connect', message: err});
      }
    });
  } catch(err) {
    simulation = true;
    console.log('SerialPort says:', err);
    sendMessage('serial.error', {type:'connect', message: err});
  }
}

function disconnectSerial(e) {
  console.log('Serial Disconnected!'.error, e);
  sendMessage('serial.disconnected', {message: e});
}


/**
 * Execute a set of commands representing a single buffer item to serialWrite
 * to callback by when done or by the end of duration.
 *
 * @param {array} commands
 *  Array of regular/dynamic string commands to all be executed under duration.
 * @param {integer} duration
 *  Amount of time these commands should take before the next set should run.
 *
 * @returns {boolean}
 *   True if success, false if failure
 */
var nextExecutionTimeout = 0; // Hold on to the timeout index to be cleared
var consecutiveCallStackCount = 0; // Count the blocking call stack size.
function executeCommands(commands, duration, callback, index) {

  // When the command coming in is a string, we execute it. Otherwise we
  // make our own mini self-executing queue.
  if (typeof index === 'undefined') {
    index = 0;
  }

  /// Run the command at the index.
  serialWrite(commands[index], function(){
    // When the serial command has run/drained, run another, or end?
    if (index + 1 < commands.length) {
      // Run the next one.
      executeCommands(commands, duration, callback, index + 1);
    } else {
      // End, no more commands left. Time out the next command send
      if (duration < config.bufferLatencyOffset &&
          consecutiveCallStackCount < config.maximumBlockingCallStack) {
        consecutiveCallStackCount++;
        callback(); // Under threshold, "immediate" run
      } else {
        consecutiveCallStackCount = 0;
        clearTimeout(nextExecutionTimeout);
        nextExecutionTimeout = setTimeout(callback,
          duration - config.bufferLatencyOffset
        );
      }
    }

  });

  return true;
}

/**
 * Execute the next command in the buffer, triggered by self, buffer interval
 * catcher loop below.
 */
function executeNext() {
  // Don't continue execution if paused
  if (bufferPaused) return;

  // Process a single line of the buffer =====================================
  if (buffer.length) {
    var item = buffer.pop();
    executeCommands(item.commands, item.duration, function(){
      sendMessage('buffer.itemdone');
      executeNext();
    });
  } else {
    // Buffer Empty.
    bufferRunning = false;
  }
}

// Buffer interval catcher, starts running as soon as items exist in the buffer.
setInterval(function(){
  if (buffer.length && !bufferRunning && !bufferPaused) {
    bufferRunning = true;
    executeNext();
  }
}, 10);


/**
 * Write a data string to the connected serial port.
 *
 * @param  {string} command
 *   Command to write to the connected serial port, sans delimiter.
 * @param  {function} callback
 *   Callback when it should be sent/drained.
 */
function serialWrite (command, callback) {
  if (simulation) {
    console.info('Simulating serial write :', command);
    setTimeout(function(){
      serialReadline(config.ack);
      callback();
    }, 1);
  } else {
    console.info('Executing serial write :', command);
    try {
      serialPort.write(command + "\r", function() {
        serialPort.drain(callback);
      });
    } catch(e) {
      console.error('Failed to write to the serial port!:', e);
      sendMessage('serial.error', {type:'data', message: e});
      callback(false);
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
  sendMessage('serial.data', data);
}

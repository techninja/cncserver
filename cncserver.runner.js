/*jslint node: true */
"use strict";

/**
 * @file CNC Server IPC runner. Handles outputting serial commands with the
 * correct timing, so the main thread can be as bogged down as it wants, this
 * process will remain untouched.
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
var serialPort = false;
var SerialPort = serialport.SerialPort;

// RUNNER STATE ================================================================
var simulation = true; // Assume simulation mode by default.
var commandDuration = 0;
var buffer = [];
var bufferRunning = false;
var bufferPaused = false;


// Runner config defaults, overridden on ready.
var config = {
  maximumBlockingCallStack: 100,
  bufferLatencyOffset: 20,
  ack: "OK",
  debug: false
}

// Cautch any uncaught error.
process.on('uncaughtException', function(err) {
  // Assume Disconnection and kill the process.
  disconnectSerial(err);
  ipc.log('Uncaught error, disconnected from server, shutting down'.error);
  ipc.log(err);
  process.exit(0);
})

ipc.connectTo(
  'cncserver',
  function(){
    ipc.of.cncserver.on(
      'connect',
      function(){
        ipc.log('Connected to CNCServer controller!'.rainbow, ipc.config.delay);
        sendMessage('runner.ready');
      }
    );
    ipc.of.cncserver.on(
      'disconnect',
      function(){
        ipc.log('Disconnected from server, shutting down'.notice);
        process.exit(0);
      }
    );
    ipc.of.cncserver.on('app.message', gotMessage);
  }
);

function sendMessage(command, data) {
  if (!data) {
    data = {};
  }

  var packet = {
    command: command,
    data: data
  }

  ipc.of.cncserver.emit('app.message', packet);
}

// Parse and hand off message packets from the server.
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
      serialCommand(data.command, data.duration);
      break;
    case "serial.direct.write":
      serialWrite(data);
      break;
    case "buffer.add.end": // Add to the end of the buffer, last to be executed.
      buffer.unshift([data.command, data.duration]);
      break;
    case "buffer.add.tip": // Add to the running tip of the buffer.
      buffer.shift([data.command, data.duration]);
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
 * Callback event function initialized on connect to handle incoming data.
 *
 * @param {string} data
 *   Incoming data from serial port
 */
function serialReadline(data) {
  sendMessage('serial.data', data);
}

/**
 * Write a psudo command to the open serial port/simulation.
 *
 * @param {string} command
 *  XXXXX
 * @returns {boolean}
 *   True if success, false if failure
 */
var nextExecutionTimeout = 0; // Hold on to the timeout index to be cleared
var consecutiveCallStackCount = 0; // Count the blocking call stack size.
function serialCommand(command){
  if (!serialPort.write && !simulation) { // Not ready to write to serial!
    return false;
  }

  serialWrite(command, function() {
    // Command should be sent! Time out the next command send
    if (commandDuration < config.bufferLatencyOffset &&
        consecutiveCallStackCount < config.maximumBlockingCallStack) {
      consecutiveCallStackCount++;
      executeNext(); // Under threshold, "immediate" run
    } else {
      consecutiveCallStackCount = 0;
      clearTimeout(nextExecutionTimeout);
      nextExecutionTimeout = setTimeout(executeNext,
        commandDuration - config.bufferLatencyOffset
      );
    }
  });

  return true;
}

/**
 * Write a data string to the connected serial port.
 *
 * @param  {string} command
 *   Command to write to the connected serial port, sans delimiter.
 * @param  {function} callback
 *   Callback when it should be sent/drained.
 */
function serialWrite(command, callback) {
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
      sendMessage('serial.error', {type:'data', message: err});
      callback(false);
    }
  }
}

// Buffer interval catcher, starts running the buffer as soon as items exist in it
setInterval(function(){
  if (buffer.length && !bufferRunning && !bufferPaused) {
    bufferRunning = true;
    sendBufferVars();
    executeNext();
  }
}, 10);

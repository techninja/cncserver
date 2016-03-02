/*jslint node: true */
"use strict";

/**
 * @file CNC Server IPC runner. Handles outputting serial commands with the
 * correct timing, so the main thread can be as bogged down as it wants, this
 * process will remain untouched.
 */

// REQUIRES ====================================================================
var serialport = require("serialport");
var ipc = require('node-ipc');

// CONFIGURATION ===============================================================
ipc.config.id = 'server';
ipc.config.retry = 1500;

ipc.serve(
  function(){
    ipc.server.on('app.message', gotMessage);
  }
);

ipc.server.start();

function sendMessage(command, data, socket) {
  var packet = {
    command: command,
    data: data
  }
  ipc.server.emit(socket, 'app.message', packet);
}

function gotMessage(packet, socket) {
  switch(packet.command) {
    case "runner.ready":
      // Send serial connect once runner is ready.
      var connectData = {
        port: '/dev/ttyACM0',
        baudrate: 9600
      }
      sendMessage('serial.connect', connectData, socket);
      break;
    case "serial.connected":
    case "serial.disconnected":
    case "serial.error":

     break;
  }
}

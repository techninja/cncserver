/*jslint node: true */
"use strict";

/**
 * @file Abstraction module for all Inter Process Communication related code
 * for talking to the "runner" process, for CNC Server!
 *
 */

module.exports = function(cncserver) {
  var spawn = require('child_process').spawn; // Process spawner.
  var ipc = require('node-ipc');       // Inter Process Comms for runner.
  var runnerInitCallback = null;       // Placeholder for init set callback.
  cncserver.ipc = {
    runnerSocket: {} // The IPC socket for communicating to the runner
  };

  // IPC server config.
  ipc.config.silent = true;
  ipc.config.id = 'cncserver';
  ipc.config.retry = 1500;

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
  cncserver.ipc.sendMessage = function(command, data, socket) {
    if (typeof socket === 'undefined') {
      socket = cncserver.ipc.runnerSocket;
    }

    var packet = {
      command: command,
      data: data
    };

    ipc.server.emit(socket, 'app.message', packet);
  };

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
  cncserver.ipc.initServer = function(options, callback) {
    runnerInitCallback = callback;

    // Initialize and start the IPC Server...
    ipc.serve(function(){
      ipc.server.on('app.message', ipcGotMessage);
    });

    ipc.server.start();
    console.log('Starting IPC server, waiting for runner client to start...');

    if (options.localRunner) {
      // Register an event callback to shutdown the runner if we're exiting.
      process.on('SIGTERM', cncserver.ipc.runner.shutdown);
      process.on('SIGINT', cncserver.ipc.runner.shutdown);
      cncserver.ipc.runner.init();
    }
  };

  // Define the runner tracker object.
  cncserver.ipc.runner = {
    process: {},

    /**
     * Start up & init the Runner process via node
     */
    init: function (){
      cncserver.ipc.runner.process = spawn(
        'node',
        [__dirname + '/../runner/cncserver.runner']
      );

      cncserver.ipc.runner.process.stdout.on('data', function (data) {
        data = data.toString().split("\n");
        for (var i in data) {
          if (data[i].length) console.log("RUNNER:" + data[i]);
        }
      });

      cncserver.ipc.runner.process.stderr.on('data', function (data) {
        console.log('RUNNER ERROR: ' + data);
      });

      cncserver.ipc.runner.process.on('exit', function (exitCode) {
        // TODO: Restart it? Who knows.
        console.log('RUNNER EXITED: ' + exitCode);
      });
    },

    shutdown: function() {
      console.log('Killing runner process before exiting...');
      cncserver.ipc.runner.process.kill();
      process.exit();
    }
  };

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
  function ipcGotMessage(packet, socket) {
    var serialCallbacks = cncserver.serial.callbacks;
    var data = packet.data;

    switch(packet.command) {
      case "runner.ready":
        cncserver.ipc.runnerSocket = socket;
        cncserver.ipc.sendMessage('runner.config', {
          debug: cncserver.gConf.get('debug'),
          ack: cncserver.botConf.get('controller').ack,
          showSerial: cncserver.gConf.get('showSerial')
        });

        if (runnerInitCallback) runnerInitCallback();
        break;
      case "serial.connected":
        console.log(
          'Serial connection open at ' +
          cncserver.botConf.get('controller').baudRate + 'bps'
        );
        cncserver.pen.simulation = 0;

        if (serialCallbacks.connect) serialCallbacks.connect(data);
        if (serialCallbacks.success) serialCallbacks.success(data);
        break;
      case "serial.disconnected":
        if (serialCallbacks.disconnect) serialCallbacks.disconnect(data);
        break;
      case "serial.error":
        if (packet.type === 'connect') {
          console.log(
            "Serial port failed to connect. Is it busy or in use? Error #10"
          );
          console.log('SerialPort says:', packet.message);
          if (serialCallbacks.complete) serialCallbacks.complete(data);
        } else {
          // TODO: Add better error message here, or figure out when this
          // happens.
          console.log("Serial failed to send data. Error #44");
        }

        if (serialCallbacks.error) serialCallbacks.error(data);
       break;
      case "serial.data":
        if (data.trim() !== cncserver.botConf.get('controller').ack) {
          console.error('Message From Controller: ' + data);

          // Assume error was on startup, and resend setup.
          cncserver.serial.localTrigger('botInit');
        }
        break;
      case "buffer.item.start":
        // Buffer action item begun to run.
        cncserver.buffer.startItem(data);
        break;
      case "buffer.item.done":
        // Buffer item has completed.
        cncserver.buffer.removeItem(data);
        break;
      case "buffer.empty":
        // TODO: Is this needed?
        break;
      case "buffer.running":
        cncserver.buffer.running = data;
        break;
    }
  }

};

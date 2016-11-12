"use strict";

/**
 * @file Abstraction module for all Socket I/O related code for CNC Server!
 *
 */

module.exports = function(cncserver) {
  // Central Socket.io object for streaming state data
  var io = require('socket.io')(cncserver.server);
  cncserver.io = {};

  // SOCKET DATA STREAM ========================================================
  io.on('connection', function(socket){
    // Send buffer and pen updates on user connect
    cncserver.io.sendPenUpdate();

    // TODO: this likely needs to be sent ONLY to new connections
    cncserver.io.sendBufferComplete();

    socket.on('disconnect', function(){
      //console.log('user disconnected');
    });

    // Shortcuts for moving and height for streaming lots of commands.
    socket.on('move', cncserver.io.shortcut.move);
    socket.on('height', cncserver.io.shortcut.height);
  });


  /**
   * Send an update to all Stream clients about the actualPen object.
   * Called whenever actualPen object has been changed, E.G.: right before
   * a serial command is run, or internal state changes.
   */
  cncserver.io.sendPenUpdate = function () {
    if (cncserver.exports.penUpdateTrigger) {
      cncserver.exports.penUpdateTrigger(cncserver.actualPen);
    }
    io.emit('pen update', cncserver.actualPen);
  };

  /**
   * Send an update to all stream clients when something is added to the buffer.
   * Includes only the item added to the buffer, expects the client to handle.
   */
  cncserver.io.sendBufferAdd = function(item, hash) {
    var data = {
      type: 'add',
      item: item,
      hash: hash
    };

    if (cncserver.exports.bufferUpdateTrigger) {
      cncserver.exports.bufferUpdateTrigger(data);
    }
    io.emit('buffer update', data);
  };


  /**
   * Send an update to all stream clients when something is removed from the
   * buffer. Assumes the client knows where to remove from.
   */
  cncserver.io.sendBufferRemove = function() {
    var data = {
      type: 'remove'
    };

    if (cncserver.exports.bufferUpdateTrigger) {
      cncserver.exports.bufferUpdateTrigger(data);
    }
    io.emit('buffer update', data);
  };

  /**
   * Send an update to all stream clients when something is added to the buffer.
   * Includes only the item added to the buffer, expects the client to handle.
   */
  cncserver.io.sendBufferVars = function() {
    var data = {
      type: 'vars',
      bufferRunning: cncserver.buffer.running,
      bufferPaused: cncserver.buffer.paused,
      bufferPausePen: cncserver.buffer.pausePen
    };

    if (cncserver.exports.bufferUpdateTrigger) {
      cncserver.exports.bufferUpdateTrigger(data);
    }
    io.emit('buffer update', data);
  };

  /**
   * Send an update to all stream clients about everything buffer related.
   * Called only during connection inits.
   */
  cncserver.io.sendBufferComplete = function () {
    var data = {
      type: 'complete',
      bufferList: cncserver.buffer.data,
      bufferData: cncserver.buffer.dataSet,
      bufferRunning: cncserver.buffer.running,
      bufferPaused: cncserver.buffer.paused,
      bufferPausePen: cncserver.buffer.pausePen
    };

    // Low-level event callback trigger to avoid Socket.io overhead
    if (cncserver.exports.bufferUpdateTrigger) {
      cncserver.exports.bufferUpdateTrigger(data);
    }
    io.emit('buffer update', data);
  };

  /**
   * Send an update to all stream clients of the given custom text string.
   *
   * @param {string} message
   *   Message to send out to all clients.
   */
  cncserver.io.sendMessageUpdate = function (message) {
    io.emit('message update', {
      message: message,
      timestamp: new Date().toString()
    });
  };

  /**
   * Send an update to all stream clients of a machine name callback event.
   *
   * @param {string} name
   *   Machine name of callback to send to clients
   */
  cncserver.io.sendCallbackUpdate = function (name) {
    io.emit('callback update', {
      name: name,
      timestamp: new Date().toString()
    });
  };

  /**
   * Trigger manual swap complete to all stream clients. Buffer will be paused.
   *
   * @param {int} vIndex
   *   Virtual index of manual swap
   */
  cncserver.io.manualSwapTrigger = function (vIndex) {
    io.emit('manualswap trigger', {
      index: vIndex
    });
  };

  // Shortcut functions for move/height streaming.
  cncserver.io.shortcut = {
    move: function(data) {
      data.ignoreTimeout = 1;
      cncserver.control.setPen(data, function(){
        if (data.returnData) io.emit('move', cncserver.pen);
      });
    },

    height: function(data) {
      cncserver.control.setPen({ignoreTimeout: 1, state: data.state},
        function(){
          if (data.returnData) io.emit('height', cncserver.pen);
        }
      );
    }
  };
};

"use strict";

/**
 * @file Abstraction module for all Socket I/O related code for CNC Server!
 *
 */

module.exports = function(cncserver) {
  // Central Socket.io object for streaming state data
  var io = require('socket.io')(cncserver.server);

  // SOCKET DATA STREAM ========================================================
  io.on('connection', function(socket){
    // Send buffer and pen updates on user connect
    cncserver.io.sendPenUpdate();

    // TODO: this likely needs to be sent ONLY to new connections
    cncserver.io.sendBufferComplete();

    socket.on('disconnect', function(){
      //console.log('user disconnected');
    });
  });


  /**
   * Send an update to all Stream clients about the actualPen object.
   * Called whenever actualPen object has been changed, E.G.: right before
   * a serial command is run, or internal state changes.
   */
  cncserver.io.sendPenUpdate = function () {
    // Low-level event callback trigger to avoid Socket.io overhead
    if (exports.penUpdateTrigger) {
      exports.penUpdateTrigger(cncserver.actualPen);
    } else {
      // TODO: This sucks, but even sending these smaller packets is somewhat
      // blocking and screws with buffer send timing. Need to either make these
      // packets smaller, or limit the number of direct updates per second to
      // the transfer rate to clients? Who knows.
      io.emit('pen update', cncserver.actualPen);
    }
  };

  /**
   * Send an update to all stream clients when something is added to the buffer.
   * Includes only the item added to the buffer, expects the client to handle.
   */
  cncserver.io.sendBufferAdd = function(item) {
    var data = {
      type: 'add',
      item: item
    };

    // Low-level event callback trigger to avoid Socket.io overhead
    if (exports.bufferUpdateTrigger) {
      exports.bufferUpdateTrigger(data);
    } else {
      io.emit('buffer update', data);
    }
  };


  /**
   * Send an update to all stream clients when something is removed from the
   * buffer. Assumes the client knows where to remove from.
   */
  cncserver.io.sendBufferRemove = function() {
    var data = {
      type: 'remove'
    };

    // Low-level event callback trigger to avoid Socket.io overhead
    if (exports.bufferUpdateTrigger) {
      exports.bufferUpdateTrigger(data);
    } else {
      io.emit('buffer update', data);
    }
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

    // Low-level event callback trigger to avoid Socket.io overhead
    if (cncserver.exports.bufferUpdateTrigger) {
      cncserver.exports.bufferUpdateTrigger(data);
    } else {
      io.emit('buffer update', data);
    }
  };

  /**
   * Send an update to all stream clients about everything buffer related.
   * Called only during connection inits.
   */
  cncserver.io.sendBufferComplete = function () {
    var data = {
      type: 'complete',
      buffer: cncserver.buffer.data,
      bufferRunning: cncserver.buffer.running,
      bufferPaused: cncserver.buffer.paused,
      bufferPausePen: cncserver.buffer.pausePen
    };

    // Low-level event callback trigger to avoid Socket.io overhead
    if (cncserver.exports.bufferUpdateTrigger) {
      cncserver.exports.bufferUpdateTrigger(data);
    } else {
      io.emit('buffer update', data);
    }
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
};

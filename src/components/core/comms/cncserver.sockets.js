/**
 * @file Abstraction module for all Socket I/O related code for CNC Server!
 *
 */
const socketio = require('socket.io');

const sockets = {}; // Export interface.

module.exports = (cncserver) => {
  const io = socketio(cncserver.server.httpServer);

  // SOCKET DATA STREAM ========================================================
  io.on('connection', (socket) => {
    // Send buffer and pen updates on user connect
    cncserver.sockets.sendPenUpdate();

    // TODO: this likely needs to be sent ONLY to new connections
    cncserver.sockets.sendBufferComplete();

    socket.on('disconnect', () => {
      // console.log('user disconnected');
    });

    // Shortcuts for moving and height for streaming lots of commands.
    socket.on('move', cncserver.sockets.shortcut.move);
    socket.on('height', cncserver.sockets.shortcut.height);
  });


  /**
   * Send an update to all Stream clients about the actualPen object.
   * Called whenever actualPen object has been changed, E.G.: right before
   * a serial command is run, or internal state changes.
   */
  sockets.sendPenUpdate = () => {
    if (cncserver.exports.penUpdateTrigger) {
      cncserver.exports.penUpdateTrigger(cncserver.actualPen.state);
    }
    io.emit('pen update', cncserver.actualPen.state);
  };

  /**
   * Send an update to all stream clients when something is added to the buffer.
   * Includes only the item added to the buffer, expects the client to handle.
   */
  sockets.sendBufferAdd = (item, hash) => {
    const data = {
      type: 'add',
      item,
      hash,
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
  sockets.sendBufferRemove = () => {
    const data = {
      type: 'remove',
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
  sockets.sendBufferVars = () => {
    const data = {
      type: 'vars',
      bufferRunning: cncserver.buffer.running,
      bufferPaused: cncserver.buffer.paused,
      bufferPausePen: cncserver.buffer.pausePen,
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
  sockets.sendBufferComplete = () => {
    const data = {
      type: 'complete',
      bufferList: cncserver.buffer.data,
      bufferData: cncserver.buffer.dataSet,
      bufferRunning: cncserver.buffer.running,
      bufferPaused: cncserver.buffer.paused,
      bufferPausePen: cncserver.buffer.pausePen,
    };

    // Low-level event callback trigger to avoid Socket.io overhead
    if (cncserver.exports.bufferUpdateTrigger) {
      cncserver.exports.bufferUpdateTrigger(data);
    }
    io.emit('buffer update', data);

    // Send this second.
    sockets.sendPaperUpdate('preview');
    sockets.sendPaperUpdate('stage');
  };

  /**
   * Send an update to all stream clients of the given custom text string.
   *
   * @param {string} message
   *   Message to send out to all clients.
   */
  sockets.sendMessageUpdate = (message) => {
    io.emit('message update', {
      message,
      timestamp: new Date().toString(),
    });
  };


  /**
   * Send an update to all stream clients of a machine name callback event.
   *
   * @param {string} name
   *   Machine name of callback to send to clients
   */
  sockets.sendCallbackUpdate = (name) => {
    io.emit('callback update', {
      name,
      timestamp: new Date().toString(),
    });
  };

  /**
   * Trigger manual swap complete to all stream clients. Buffer will be paused.
   *
   * @param {int} vIndex
   *   Virtual index of manual swap
   */
  sockets.manualSwapTrigger = (vIndex) => {
    io.emit('manualswap trigger', { index: vIndex });
  };

  /**
   * Send an update to all stream clients for a Paper layer update.
   */
  sockets.sendPaperUpdate = (layer = 'preview') => {
    if (layer === 'preview') {
      cncserver.drawing.colors.snapPathColors(
        cncserver.drawing.base.layers.preview
      );
    }

    io.emit('paper layer', {
      layer,
      paperJSON: cncserver.drawing.base.layers[layer].exportJSON(),
      timestamp: new Date().toString(),
    });
  };

  // Shortcut functions for move/height streaming.
  sockets.shortcut = {
    move: (data) => {
      cncserver.pen.setPen(data, () => {
        if (data.returnData) io.emit('move', cncserver.pen.state);
      });
    },

    height: data => {
      cncserver.pen.setPen({ state: data.state }, () => {
        if (data.returnData) io.emit('height', cncserver.pen.state);
      });
    },
  };

  return sockets;
};

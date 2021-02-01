/**
 * @file Abstraction module for all Socket I/O related code for CNC Server!
 *
 */
import socketio from 'socket.io';
import { httpServer } from 'cs/server';
import { setPen, state } from 'cs/pen';
import { state as actualPenState } from 'cs/actualPen';
import { state as bufferState } from 'cs/buffer';
import { layers } from 'cs/drawing/base';
import { snapPathsToColorset } from 'cs/drawing/colors';

const io = socketio(httpServer);

// Shortcut functions for move/height streaming.
export const shortcut = {
  move: data => {
    setPen(data, () => {
      if (data.returnData) io.emit('move', state);
    });
  },

  height: data => {
    setPen({ state: data.state }, () => {
      if (data.returnData) io.emit('height', state);
    });
  },
};

/**
  * Send an update to all Stream clients about the actualPen object.
  * Called whenever actualPen object has been changed, E.G.: right before
  * a serial command is run, or internal state changes.
  */
export function sendPenUpdate() {
  /* TODO: This is not the right way to do this.
  if (cncserver.exports.penUpdateTrigger) {
    cncserver.exports.penUpdateTrigger(cncserver.actualPen.state);
  }
  */

  io.emit('pen update', actualPenState);
}

/**
  * Send an update to all stream clients when something is added to the buffer.
  * Includes only the item added to the buffer, expects the client to handle.
  */
export function sendBufferAdd(item, hash) {
  const data = {
    type: 'add',
    item,
    hash,
  };

  /* TODO: This is not the right way to do this.
  if (cncserver.exports.bufferUpdateTrigger) {
    cncserver.exports.bufferUpdateTrigger(data);
  }
  */

  io.emit('buffer update', data);
}

/**
  * Send an update to all stream clients when something is removed from the
  * buffer. Assumes the client knows where to remove from.
  */
export function sendBufferRemove() {
  const data = {
    type: 'remove',
  };

  /* TODO: This is not the right way to do this.
  if (cncserver.exports.bufferUpdateTrigger) {
    cncserver.exports.bufferUpdateTrigger(data);
  }
  */

  io.emit('buffer update', data);
}

/**
  * Send an update to all stream clients when something is added to the buffer.
  * Includes only the item added to the buffer, expects the client to handle.
  */
export function sendBufferVars() {
  const data = {
    type: 'vars',
    bufferRunning: bufferState.running,
    bufferPaused: bufferState.paused,
    bufferPausePen: bufferState.pausePen,
  };

  /* TODO: This is not the right way to do this.
  if (cncserver.exports.bufferUpdateTrigger) {
    cncserver.exports.bufferUpdateTrigger(data);
  }
  */

  io.emit('buffer update', data);
}

/**
  * Send an update to all stream clients of the given custom text string.
  *
  * @param {string} message
  *   Message to send out to all clients.
  */
export function sendMessageUpdate(message) {
  io.emit('message update', {
    message,
    timestamp: new Date().toString(),
  });
}

/**
  * Send an update to all stream clients of a machine name callback event.
  *
  * @param {string} name
  *   Machine name of callback to send to clients
  */
export function sendCallbackUpdate(name) {
  io.emit('callback update', {
    name,
    timestamp: new Date().toString(),
  });
}

/**
  * Trigger manual swap complete to all stream clients. Buffer will be paused.
  *
  * @param {int} vIndex
  *   Virtual index of manual swap
  */
export function manualSwapTrigger(vIndex) {
  io.emit('manualswap trigger', { index: vIndex });
}

/**
  * Send an update to all stream clients for a Paper layer update.
  */
export function sendPaperUpdate(layer = 'preview') {
  if (layer === 'preview') {
    snapPathsToColorset(layers.preview);
    sendPaperUpdate('print');
  }

  io.emit('paper layer', {
    layer,
    paperJSON: layers[layer].exportJSON(),
    timestamp: new Date().toString(),
  });
}

/**
  * Send an update to all stream clients about everything buffer related.
  * Called only during connection inits.
  */
export function sendBufferComplete() {
  const data = {
    type: 'complete',
    bufferList: bufferState.data,
    bufferData: bufferState.dataSet,
    bufferRunning: bufferState.running,
    bufferPaused: bufferState.paused,
    bufferPausePen: bufferState.pausePen,
  };

  // Low-level event callback trigger to avoid Socket.io overhead
  /* TODO: This is not the right way to do this.
  if (cncserver.exports.bufferUpdateTrigger) {
    cncserver.exports.bufferUpdateTrigger(data);
  }
  */
  io.emit('buffer update', data);

  // Send this second.
  sendPaperUpdate('preview');
  sendPaperUpdate('stage');
  sendPaperUpdate('tools');
}

// SOCKET DATA STREAM.
io.on('connection', socket => {
  // Send buffer and pen updates on user connect
  sendPenUpdate();

  // TODO: this likely needs to be sent ONLY to new connections
  sendBufferComplete();

  socket.on('disconnect', () => {
    // console.log('user disconnected');
  });

  // Shortcuts for moving and height for streaming lots of commands.
  socket.on('move', shortcut.move);
  socket.on('height', shortcut.height);
});

/**
 * @file CNC Server IPC runner. Handles outputting serial commands with the
 * correct timing, so the main thread can be as bogged down as it wants, this
 * process will remain untouched as long as there's a CPU to handle it.
 *
 * This is an entirely separate application that runs connected only via IPC
 * socket messages, always use the API to communicate via serial, not this.
 */

// REQUIRES ====================================================================
const { Readable, Writable } = require('stream');
const serial = require('./cncserver.runner.serial');
const ipc = require('./cncserver.runner.ipc')({
  ipcHost: 'cncserver',
  config: {
    id: 'cncrunner',
    silent: true,
    retry: 1000,
    maxRetries: 10,
  },
});

// RUNNER STATE ================================================================
const state = {
  instructionStreamRunning: false,
  instructionIsExecuting: false,
  instructionHashExecuting: null,
  paused: false,
  simulation: true, // Assume simulation mode by default, bound to serial state.
};

// Runner config defaults, overridden on ready.
global.config = {
  ack: 'OK',
  debug: false,
  showSerial: false,
};

// This node stream buffers instructions to be written to the serial port.
let instructionStream = null;
let instructionRenderer = null;

// Time in ms to remove from every expected request
const durationOffset = 1;
let durationTimer = 0;

// Callback for every instruction stream item to write to destination.
function instructionStreamWrite(item, _, callback) {
  if (global.debug) console.log(`STREAM RUNNING ITEM: ${item.hash}`);

  state.instructionStreamRunning = true;
  state.instructionIsExecuting = true;
  state.instructionHashExecuting = item.hash;
  ipc.sendMessage('buffer.item.start', item.hash);

  // Some items don't have any rendered commands, only run those that do!
  if (item.commands.length) {
    durationTimer = new Date();
    serial.writeMultiple(item.commands, (err) => {
      setTimeout(() => {
        ipc.sendMessage('buffer.item.done', item.hash);
        state.instructionIsExecuting = false;
        if (global.debug) console.log(`ITEM DONE: ${item.hash}`);
        callback(err);
      }, item.duration - durationOffset - (new Date() - durationTimer));
    });
  } else {
    state.instructionIsExecuting = false;
    ipc.sendMessage('buffer.item.done', item.hash);
    if (global.debug) console.log(`NO COMMANDS ITEM: ${item.hash}`);
  }
}

// Destroy and initialize the main instruction delivery streams.
function initInstructionStreams() {
  if (instructionStream) {
    instructionStream.destroy(null);
    instructionRenderer.destroy(null);
  }

  instructionStream = new Readable({
    objectMode: true,
    highWaterMark: 1,
    read: () => {},
  });

  // This node stream transforms the instructionStream source into commands.
  instructionRenderer = new Writable({
    objectMode: true,
    highWaterMark: 1,
    write: instructionStreamWrite,
  });

  // Pipe source to destination.
  instructionStream.pipe(instructionRenderer);

  // Cork the output if state says we shouldn't be running after clear.
  if (state.paused) {
    instructionRenderer.cork();
  }

  instructionStream.on('end', () => {
    console.log('STREAM IS EMPTY');
    ipc.sendMessage('buffer.empty');

    // Buffer Empty.
    state.instructionStreamRunning = false;
    state.instructionIsExecuting = false;
    ipc.sendMessage('buffer.running', state.instructionStreamRunnin);
  });
}

// Direct stream
const directStream = new Readable({
  objectMode: true,
  highWaterMark: 1,
  read: () => {},
});

// This node stream transforms the directStream source into commands.
const directRenderer = new Writable({
  objectMode: true,
  highWaterMark: 1,
  write: (item, _, callback) => {
    console.log('DIRECT Stream writing!', item.commands);
    serial.writeMultiple(item.commands, (err) => {
      setTimeout(() => {
        callback(err);
      }, item.duration);
    });
  },
});

/**
 * Pause/unpause setter
 */
state.setPaused = (paused, init = false) => {
  state.paused = !!paused;

  if (!instructionStream || init) {
    // Init direct and instruction streams.
    directStream.pipe(directRenderer);
    initInstructionStreams();
  }

  if (paused) {
    instructionRenderer.cork();
  } else {
    instructionRenderer.uncork();
  }
};

/**
 * Simulation state setter
 */

state.setSimulation = (isSimulating) => {
  state.simulation = isSimulating;
  ipc.sendMessage('serial.simulation', isSimulating);
};


// Setup serial port event bindings/callbacks.
serial.bindAll({
  // Called only on a successfull connection.
  connect: (options) => {
    ipc.sendMessage('serial.connected');
    state.setPaused(false);
    console.log('CONNECTED TO ', options.port);
  },

  // Called whenever the simulation state changes, managed by serial module.
  simulation: state.setSimulation,

  // Called for every line read from the serial port.
  read: data => ipc.sendMessage('serial.data', data.toString()),

  // Called for any fatal initialization or transmission error.
  error: (type, err) => {
    ipc.sendMessage('serial.error', {
      type,
      message: err.toString(),
    });
  },

  // Called on serial diconnect at start of reconnection (if valid).
  disconnect: () => {
    // Pause during disconnection to prevent draining to nothing.
    state.setPaused(true);
  },

  // Called on serial close if reconnect fails.
  close: (err) => {
    console.log(err);
    console.log(`Serial Disconnected: ${err.toString()}`);
    ipc.sendMessage('serial.disconnected', {
      type: 'disconnect',
      message: err.toString(),
    });
  },
});

/**
 * IPC Message callback event parser/handler.
 *
 * @param  {object} packet
 *   The entire message object directly from the event.
 */
function gotMessage(packet) {
  const { data } = packet;

  switch (packet.command) {
    case 'runner.config':
      global.config = data;
      if (data.debug) {
        console.log('Config data:', JSON.stringify(data));
        global.debug = true;
      }
      break;
    case 'runner.shutdown':
      console.log('Recieved kill signal from host, shutting down runner.');
      process.exit(0);
      break;

    case 'serial.connect':
      serial.connect(data);
      break;

    case 'serial.direct.command':
      directStream.push(data);
      break;

    case 'buffer.add': // Add to the end of the buffer, last to be executed.
      // Buffer item data comes in in the following object format:
      //   hash {string}      : The tracking hash for this buffer item.
      //   duration {number}  : The duration of all the commands, in ms.
      //   commands {array}   : Array of rendered serial command strings.
      instructionStream.push(data);
      break;

    case 'buffer.pause': // Pause the running of the buffer.
      state.setPaused(true);
      console.log('BUFFER PAUSED');
      break;

    case 'buffer.resume': // Resume running of the buffer.
      state.setPaused(false);
      console.log('BUFFER RESUMED');
      break;

    case 'buffer.clear': // Clear the entire buffer.
      initInstructionStreams();
      console.log('BUFFER CLEARED');
      break;

    default:
  }
}

// Catch any uncaught error.
process.on('uncaughtException', (err) => {
  // Assume Disconnection and kill the process.
  serial.triggerBind('disconnect', err);
  console.error('Uncaught error, disconnected from server, shutting down');
  console.error(err);
  process.exit(0);
});

// Fully initialize the IPC comms/server with bindings.
ipc.connect({
  connect: () => {
    console.log('Connected to CNCServer!');
    ipc.sendMessage('runner.ready');
  },
  disconnect: () => {
    // ipc.log('Disconnected from server, shutting down'.notice);
    // process.exit(0);
  },
  destroy: () => {
    console.log('All IPC connection retries failed or disconnected, shutting down');
    process.exit(0);
  },
  'app.message': gotMessage,
});

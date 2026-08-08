/**
 * @file CNC Server IPC runner. Handles outputting serial commands with the
 * correct timing, so the main thread can be as bogged down as it wants, this
 * process will remain untouched as long as there's a CPU to handle it.
 *
 * This is an entirely separate application that runs connected only via IPC
 * socket messages, always use the API to communicate via serial, not this.
 */

import { Readable, Writable } from 'stream';
import fs from 'fs';
import readline from 'readline';
import net from 'net';
import path from 'path';
import { homedir } from 'os';

import * as serial from './cncserver.runner.serial.js';
import initIPC from './cncserver.runner.ipc.js';

const ipc = initIPC({
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

// ── Move file runner ──────────────────────────────────────────────────────────

// Live control state — adjusted by Unix socket commands.
const liveControl = {
  speedMultiplier: 1.0,
  zMin: 0,
  zMax: 100,
};

let moveFileRunning = false;

// Send one command and wait for the bot to ACK it before resolving.
function writeAndWaitAck(command) {
  return new Promise((resolve, reject) => {
    serial.write(command, err => { if (err) reject(err); });
    // ACK arrives via the read binding — stash the resolver.
    serial._pendingAck = resolve;
  });
}

// Called from the read binding for every serial line received.
function handleSerialRead(data) {
  const str = data.toString().trim();
  if (!str) return;
  ipc.sendMessage('serial.data', str);
  if (serial._pendingAck) {
    const resolve = serial._pendingAck;
    serial._pendingAck = null;
    resolve(str);
  }
}

// Read the entire move file line by line, sending each command and awaiting ACK.
async function runMoveFile(filePath) {
  moveFileRunning = true;
  const spm = global.config.stepsPerMM;
  const pos = { x: 0, y: 0 };

  // Wait for the file to exist (it may be truncated/created just before this).
  while (!fs.existsSync(filePath)) await new Promise(r => setTimeout(r, 50));

  // Poll for new lines — cncrender streams strokes in as print.js renders them.
  let offset = 0;
  let idleMs = 0;
  const IDLE_TIMEOUT = 10000; // give up after 10s of no new data

  while (moveFileRunning) {
    const stat = fs.statSync(filePath);

    if (stat.size > offset) {
      idleMs = 0;
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(stat.size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      fs.closeSync(fd);
      offset = stat.size;

      const lines = buf.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }

        if (msg.t === 'move') {
          const dur = Math.round((msg.dur || 1) / liveControl.speedMultiplier);
          const absX = spm ? Math.round(msg.x * spm.x) : Math.round(msg.x);
          const absY = spm ? Math.round(msg.y * spm.y) : Math.round(msg.y);
          const dx = absX - pos.x;
          const dy = absY - pos.y;
          pos.x = absX;
          pos.y = absY;
          await writeAndWaitAck(`SM,${dur},${dx},${dy}`);
        } else if (msg.t === 'z') {
          const height = msg.z === 0 ? liveControl.zMin : liveControl.zMax;
          await writeAndWaitAck(`SP,${height}`);
        }
      }
    } else {
      idleMs += 50;
      if (idleMs >= IDLE_TIMEOUT) {
        console.log('RUNNER: move file idle timeout, stopping');
        break;
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }

  moveFileRunning = false;
  console.log('RUNNER: move file run complete');
}

function startMoveFileRun(filePath) {
  moveFileRunning = false; // cancel any in-progress run
  console.log('RUNNER: starting move file run:', filePath);
  runMoveFile(filePath).catch(err => console.error('RUNNER: runMoveFile error:', err));
}

// ── Unix socket live control ──────────────────────────────────────────────────

const SOCKET_PATH = path.resolve(homedir(), 'cncserver', 'runner.sock');

function startControlSocket() {
  // Remove stale socket if present.
  if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH);

  const server = net.createServer(conn => {
    const rl = readline.createInterface({ input: conn });
    rl.on('line', line => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      switch (msg.cmd) {
        case 'speed':
          liveControl.speedMultiplier = Math.max(0.1, Number(msg.multiplier) || 1.0);
          break;
        case 'z_range':
          liveControl.zMin = Number(msg.min ?? 0);
          liveControl.zMax = Number(msg.max ?? 100);
          break;
        case 'pause':
          state.setPaused(true);
          break;
        case 'resume':
          state.setPaused(false);
          break;
        default:
          break;
      }
    });
  });

  server.listen(SOCKET_PATH, () => {
    if (global.debug) console.log(`RUNNER: control socket at ${SOCKET_PATH}`);
  });

  server.on('error', err => console.error('RUNNER socket error:', err.message));
}


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
    serial.writeMultiple(item.commands, err => {
      setTimeout(() => {
        ipc.sendMessage('buffer.item.done', item.hash);
        state.instructionIsExecuting = false;
        if (global.debug) console.log(`ITEM DONE: ${item.hash}`);
        callback(err);
      }, item.duration - durationOffset - (new Date() - durationTimer));
    });
  } else if (item.special) {
    state.instructionIsExecuting = false;
    ipc.sendMessage('buffer.item.done', item.hash);
    if (global.debug) console.log('SPECIAL ITEM:', item.special);

    // TODO: Support other special low level commands?
    if (item.special === 'pause') {
      state.setPaused(true);
    }

    callback();
  } else {
    state.instructionIsExecuting = false;
    ipc.sendMessage('buffer.item.done', item.hash);
    if (global.debug) console.log(`NO COMMANDS ITEM: ${item.hash}`);
    callback();
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
    if (global.config.showSerial) console.log('DIRECT Stream writing!', item.commands);
    serial.writeMultiple(item.commands, err => {
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
    // console.log('CORKED RENDERER');
    instructionRenderer.cork();
  } else {
    // console.log('UNCORKED RENDERER');
    instructionRenderer.uncork();
  }
};

/**
 * Simulation state setter
 */
state.setSimulation = isSimulating => {
  state.simulation = isSimulating;
  ipc.sendMessage('serial.simulation', isSimulating);
};


// Setup serial port event bindings/callbacks.
serial.bindAll({
  // Called only on a successfull connection.
  connect: (options) => {
    ipc.sendMessage('serial.connected');
    state.setPaused(false);
  },

  // Called whenever the simulation state changes, managed by serial module.
  simulation: state.setSimulation,

  // Called for every line read from the serial port.
  read: data => {
    handleSerialRead(data);
  },

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
  close: err => {
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
      startControlSocket();
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
      if (!instructionStream) {
        initInstructionStreams();
      }
      instructionStream.push(data);
      break;

    case 'buffer.pause': // Pause the running of the buffer.
      state.setPaused(true);
      console.log('BUFFER PAUSED');
      break;

    case 'buffer.resume': // Resume running of the buffer.
      state.setPaused(false);
      console.log('BUFFER RESUMED');
      console.log(`BUFFER ITEMS: ${instructionStream.readableLength}`);
      break;

    case 'buffer.clear': // Clear the entire buffer.
      initInstructionStreams();
      console.log('BUFFER CLEARED');
      break;

    case 'movefile.start':
      startMoveFileRun(data);
      break;

    default:
  }
}

// Catch any uncaught error.
process.on('uncaughtException', err => {
  // Assume Disconnection and kill the process.
  serial.triggerBind('disconnect', err);
  console.error('Uncaught error, disconnected from server, shutting down');
  console.error(err);
  process.exit(0);
});

// Fully initialize the IPC comms/server with bindings.
ipc.connect({
  connect: () => {
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

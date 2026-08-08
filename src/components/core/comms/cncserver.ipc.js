/**
 * @file Abstraction module for all Inter Process Communication related code.
 * cncrunner (Rust) is the sole serial owner — spawned once on connect,
 * killed on shutdown. All serial I/O routes through its stdin/stdout.
 */
import { spawn } from 'child_process';
import readline from 'readline';
import nodeIPC from 'node-ipc';
import path from 'path';
import { trigger, bindTo } from 'cs/binder';
import { gConf, botConf, bot } from 'cs/settings';
import { callbacks as serialCallbacks } from 'cs/serial';
import { forceState } from 'cs/pen';
import { __basedir } from 'cs/utils';

const CNCRUNNER_BIN = path.resolve(
  __basedir, '..', 'src', 'cncrunner', 'target', 'debug', 'cncrunner'
);

// Active cncrunner child process.
let proc = null;

// Cached firmware version from ready event.
let cachedVersion = null;

// Pending resolver for getSerialValue — resolved by next "data" event.
export const state = {
  getSerialValueCallback: null,
};

// ── Output ────────────────────────────────────────────────────────────────────

function sendToRunner(obj) {
  if (!proc) return;
  try { proc.stdin.write(JSON.stringify(obj) + '\n'); } catch { /* gone */ }
}

export function sendMessage(command, data) {
  // Map legacy IPC command names to cncrunner stdin messages.
  switch (command) {
    case 'serial.direct.command':
      // data.commands is an array — send each as an immediate write.
      for (const cmd of (data.commands || [])) {
        sendToRunner({ cmd: 'write', data: cmd });
      }
      break;
    default:
      break;
  }
}

// ── cncrunner lifecycle ───────────────────────────────────────────────────────

export function connect(connectData) {
  if (proc) {
    try { proc.kill(); } catch { /* gone */ }
    proc = null;
  }

  const cfg = {
    port:           connectData.port,
    baud:           connectData.baudRate,
    setup_commands: connectData.setupCommands || [],
    steps_per_mm:   bot.stepsPerMM,
    z_min:          0,
    z_max:          100,
  };

  console.log(`[cncrunner] spawning on ${cfg.port}`);
  proc = spawn(CNCRUNNER_BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });

  proc.stdin.write(JSON.stringify(cfg) + '\n');

  const rl = readline.createInterface({ input: proc.stdout });
  rl.on('line', line => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    switch (msg.t) {
      case 'ready':
        console.log(`Serial connection open at ${cfg.baud}bps`);
        cachedVersion = `EBBv13_and_above EB Firmware Version ${msg.version}`;
        // Resolve any pending version query immediately.
        if (state.getSerialValueCallback) {
          const cb = state.getSerialValueCallback;
          state.getSerialValueCallback = null;
          cb(cachedVersion);
        }
        trigger('serial.connected');
        if (serialCallbacks.connect) serialCallbacks.connect();
        if (serialCallbacks.success) serialCallbacks.success();
        forceState({ simulation: 0 });
        break;

      case 'data':
        if (state.getSerialValueCallback) {
          const cb = state.getSerialValueCallback;
          state.getSerialValueCallback = null;
          cb(msg.msg);
        } else {
          trigger('serial.message', msg.msg);
        }
        break;

      case 'pos':
        trigger('runner.pos', { x: msg.x, y: msg.y });
        break;

      case 'ack':
        trigger('runner.ack', msg.i);
        break;

      case 'done':
        console.log('[cncrunner] print done');
        trigger('runner.done');
        break;

      case 'error':
        console.error('[cncrunner]', msg.msg);
        trigger('serial.message', msg.msg);
        break;

      default:
        break;
    }
  });

  proc.stderr.on('data', d => console.error(`[cncrunner] ${d.toString().trim()}`));
  proc.on('exit', code => {
    console.log(`[cncrunner] exited: ${code}`);
    proc = null;
    if (serialCallbacks.disconnect) serialCallbacks.disconnect();
  });
}

export function shutdown() {
  if (proc) { try { proc.kill(); } catch { /* gone */ } proc = null; }
}

// ── Serial value helper (used by ebb.js for version query etc.) ───────────────

export const getSerialValue = (command) => new Promise(resolve => {
  if (command === 'version' && cachedVersion) {
    // Version already known from ready event — resolve immediately.
    resolve(cachedVersion);
    return;
  }
  // For any other command, set callback and send as immediate write.
  state.getSerialValueCallback = resolve;
  sendToRunner({ cmd: 'write', data: command });
});

export const getSerialValueRaw = command => new Promise(resolve => {
  state.getSerialValueCallback = resolve;
  sendToRunner({ cmd: 'write', data: command });
});

// ── Binder wiring ─────────────────────────────────────────────────────────────

export function initServer(options, callback) {
  if (options.localRunner) {
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  // Keep the node-ipc server alive for the spawner (fill/vectorize workers).
  nodeIPC.config.silent = true;
  nodeIPC.config.id = 'cncserver';
  nodeIPC.serve(() => {
    trigger('ipc.serve');
  });
  nodeIPC.server.start();

  // Start move file run when print rendering is ready.
  bindTo('print.movefile.ready', 'ipc', filePath => {
    console.log('[cncrunner] starting run:', filePath);
    sendToRunner({ cmd: 'run', file: filePath });
  });

  if (callback) callback();
}

// Legacy no-ops kept so callers don't break during transition.
export const runner = { init: () => {}, shutdown };

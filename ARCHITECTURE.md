# CNCServer Architecture — 2026 Revamp

## What This Project Is

CNCServer is an API server and default controller for serial-connected plotters
(WaterColorBot, AxiDraw, EggBot). It manages project state as local JSON, drives
a drawing pipeline (SVG import → path planning → serial output), and hosts a
browser UI for composing and printing.

The goal of this revamp is to modernize the stack, fix the data pipeline
bottlenecks, and make the system actually usable for real painting sessions with
a live bot.

---

## Current Stack (what exists, warts and all)

**Server**: Node.js ESM, Express 5, import-maps via `@node-loader/import-maps`,
`loader.js` preload shim for Node 24 compatibility.

**IPC**: `node-ipc` Unix socket between main process and runner subprocess.
The runner owns serial timing — this separation is correct and should be kept.
The `node-ipc` library itself is the problem (fragile, abandoned, verbose).

**Drawing pipeline**:
- Paper.js (server-side, headless via `paper-jsdom`) for SVG import, boolean
  ops, path cleanup, layer management
- Spawner (`cncserver.drawing.spawner.js`) forks Node subprocesses for heavy
  fill/vectorize work, communicates back via node-ipc
- Acceleration planning (`cncserver.drawing.accell.js`) — pure JS, steps along
  Paper paths at 0.5 unit resolution, yields to event loop via setTimeout
- Stipple vectorizer shells out to a native `voronoi_stippler` binary, but TSP
  reordering of the output dots happens in JS — this is the worst bottleneck

**UI**: jQuery + Bulma + Paper.js + socket.io loaded as globals from
`node_modules` static routes. Hybrids web components for some panels. No build
step but also no importmap — relies on script tags and globals. Half-baked;
the composing/printing tabs exist but most controls are stubs.

**Runner**: Separate Node process, receives buffer items over IPC, writes serial
commands with correct timing. Has its own stream pipeline (Readable → Writable)
with cork/uncork for pause/resume.

---

## Key Problems to Solve

### 1. Compute bottlenecks in JS

These operations are too slow in JS and block or stutter the event loop:

- **TSP path ordering** for stipple output — nearest-neighbor + 2-opt on 2000+
  unordered dots. JS implementations take seconds to minutes. Should be <100ms.
- **Acceleration planning** — stepping along Paper paths, computing speed
  profiles with curvature lookahead. Currently async with setTimeout batching
  but still slow and single-threaded.
- **Fill generation** — offset and hatch fills on complex paths. Currently
  spawned JS subprocesses talking back via node-ipc.
- **Brush lag compensation** — forward-simulation of implement physics to
  pre-correct ferrule positions so the brush tip traces the intended path.
  Proven working in the `virtual-draw-bot` Rust project. Needs to live here
  for final output path generation.

### 2. Buffer flooding over IPC

The current model sends every buffer item (rendered serial command + duration)
over the node-ipc socket to the runner. For a complex painting this is thousands
of messages. The runner has no way to apply live changes (speed, z-range) once
items are in flight.

### 3. UI is not a creative tool

The current interface is an admin panel. It has no concept of what a user needs
standing at a bot: live preview of what will be drawn, implement selection with
visual compensation preview, live speed/z control during a print run.

### 4. node-ipc dependency

`node-ipc` is fragile, has had supply-chain issues, and is overkill for what is
essentially two processes on the same machine. Should be replaced with Node's
built-in `net` module (Unix socket) or stdin/stdout for the spawner pattern.

---

## Target Architecture

```
cncserver (Node — API, project state, serial I/O)
    │
    ├── HTTP REST API  (project, content, tools, print control)
    ├── WebSocket      (live state updates to UI)
    ├── Serial port    (serialport library — stays in Node)
    │
    ├── stdin/stdout ──► cncrender (Rust subprocess)
    │       │               ├── TSP path ordering
    │       │               ├── Acceleration planning
    │       │               ├── Brush lag / implement compensation
    │       │               ├── Fill generation (offset, hatch)
    │       │               └── Writes: move file (NDJSON, streaming)
    │       │
    │       └── progress/result lines streamed back to Node
    │
    └── runner (Node subprocess — unchanged role, new protocol)
            ├── Tails move file via fs.watch + readline
            ├── Writes serial commands with correct timing
            └── Accepts live control messages (speed, z-range)
                via small WebSocket or Unix socket from main process
```

### cncrender — Rust subprocess

Lives at `src/cncrender/` within this repo. Built with `cargo build --release`,
binary checked in or built on install via a postinstall script.

**Protocol**: newline-delimited JSON on stdin/stdout. Node sends one job object,
Rust streams progress lines, ends with a result line or error line.

```json
// Node → Rust (stdin, one line)
{"job":"tsp","points":[{"x":10,"y":20}, ...],"hash":"abc123"}

// Rust → Node (stdout, streaming)
{"type":"progress","pct":42}
{"type":"result","hash":"abc123","ordered":[...]}
```

**Move file format**: NDJSON, one move per line, written as computed.
```json
{"t":"move","x":1234,"y":567,"z":0,"spd":75,"dur":120}
{"t":"move","x":1240,"y":571,"z":0,"spd":78,"dur":118}
{"t":"z","z":1,"dur":300}
```

Runner tails this file. No IPC flooding. Live speed/z changes apply at the
next move boundary.

### What stays in Node / Paper.js

- SVG import, boolean ops, path cleanup (Paper.js server-side)
- Project state (JSON files, schemas, presets)
- HTTP API routes
- Serial port management
- Socket.io for UI live state
- Colorset management, tool change sequencing

Paper.js flattens paths to point arrays, hands them to cncrender via stdin.
cncrender returns ordered/compensated move data. Paper.js is not involved in
the final move generation.

### New UI (clearstack-style)

Replace the jQuery/Bulma globals interface with a proper clearstack SPA:
- Native ESM, importmap, hybrids web components, no build step
- Express static serve from `src/interface/` (same pattern as clearstack POC)
- WebSocket for live state (pen position, buffer progress, implement status)
- Brush lag preview rendered client-side in canvas (lightweight forward-sim
  in JS is fine for preview — only the final output needs Rust precision)
- Live print controls: speed slider, z-range inputs, pause/resume

---

## Implement / Brush Lag — Where Each Part Lives

| Concern | Where |
|---|---|
| Implement presets (JSON) | cncserver `src/presets/implements/` — unchanged |
| UI preview of lag compensation | Browser canvas — JS forward-sim is fine |
| Final output compensation | `cncrender` Rust — same algorithm as vbot |
| Implement params → cncrender | Passed as part of the job JSON on stdin |

The vbot project (`../virtual-draw-bot`) keeps its own copy of the compensation
logic for use as a simulator. cncrender has its own copy. They share the same
algorithm but are not linked as a Cargo workspace — keeping the projects
independent.

---

## Runner — What Changes

The runner's role (serial timing isolation) is correct and stays. What changes:

- **Input**: Instead of receiving buffer items over node-ipc, it tails the move
  file written by cncrender
- **Live control**: Accepts a small set of control messages (speed multiplier,
  z min/max, pause, resume, cancel) via a Unix socket or stdin from the main
  process — not a full IPC library
- **Bezier/smooth z**: Entry and exit moves (brush down/up) use a slow bezier
  approach curve rather than a step jump. The runner computes this locally from
  the z-range parameters — it doesn't need to go back to cncrender for this.

---

## node-ipc Replacement Plan

Current uses of node-ipc:
1. Main ↔ Runner (buffer items, serial events) — replace with `net` Unix socket,
   same message format, no library
2. Main ↔ Spawner subprocesses (fill/vectorize work) — replace with
   stdin/stdout NDJSON (same protocol as cncrender)

The spawner pattern itself is fine. The IPC library is the problem.

---

## Migration Order (rough)

1. **cncrender crate** — TSP first (highest pain, clearest win)
2. **Spawner protocol** — swap node-ipc for stdin/stdout in spawner.js
3. **Runner protocol** — swap node-ipc for net Unix socket, add move file tailing
4. **Acceleration planning** — move to cncrender, Paper.js hands off point arrays
5. **Brush lag compensation** — add to cncrender as final output stage
6. **New UI** — clearstack SPA, replace globals interface
7. **node-ipc removal** — once 1-3 are done, dependency drops entirely

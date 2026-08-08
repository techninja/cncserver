# TODO — Next Session

See `ARCHITECTURE.md` for full background and rationale.
See `src/cncrender/BRUSH_COMPENSATION.md` for brush lag algorithm notes.

---

## Completed this session (v3-node-24-rust)

- [x] Node 24 compatibility — `loader.js` import-map shim
- [x] `cncrender` Rust crate — TSP, accell, compensate, render_stroke jobs
- [x] `cncrunner` Rust binary — sole serial owner, reads move file, emits events
- [x] `cncserver.ipc.js` rewritten — spawns cncrunner directly, no node-ipc for serial
- [x] Move file format — NDJSON, mm coordinates (4dp), `t:move/z/stroke_done`
- [x] Brush lag compensation — geometric forward-tangent offset with:
  - 2mm look-ahead tangent averaging to suppress sharp-corner spikes
  - Confidence weighting to taper offset at reversals
  - Start taper over `lead` distance
  - End extension in 0.5mm steps over `max_lag` distance
  - Bounds clamping to `maxAreaMM`
- [x] Implement preset wired through colorset → `set.implement` → cncrender job
- [x] Speed floor at `min_speed` so `dur` values are always meaningful
- [x] Nearest-neighbour path sort per color group
- [x] Pen-up transit before every stroke (including first, using park {0,0})
- [x] Sub-mm coordinate precision (`{:.4}` in cncrender output)
- [x] Write queue in cncrunner for rapid-fire SET color commands
- [x] Serial connect sequence: setup commands → V query → drain OK → emit ready

---

## Next session priorities

### 1. Brush lag — physical calibration
- Print "Thank You" on real WCB with crayola-size-3-brush
- Measure actual tip deviation vs intended path at worst-case curves
- Add `lag_calibration: 1.0` field to implement preset JSON
- Tune `lead` multiplier formula against physical output
- Update vbot to match physical brush behavior once calibrated

### 2. Brush lag — remaining algorithm issues
- Sharp reversal corners (h descender, k junction, u/o exits): confidence
  taper `/ 2.0` divisor — try `/ 1.5` to reduce inward dip without re-spiking
- Pen-down/up coordinated Z+XY: add `touchdown_mm` / `liftoff_mm` to implement
  presets; cncrunner emits slow approach moves at stroke start/end

### 3. cncrunner — move file execution
- Verify cncrunner correctly converts mm → steps using `steps_per_mm` config
- Test pause/resume/stop commands during a live print
- Add speed multiplier command (`speed <0.0-2.0>`) that scales all `dur` values

### 4. node-ipc removal
- Runner still uses node-ipc for buffer/direct serial path (legacy)
- Replace `cncserver.runner.js` node-ipc with `net` Unix socket
- Once done, `node-ipc` drops from dependencies entirely

### 5. UI — print controls
- Speed slider wired to cncrunner `speed` command
- Pause/resume button
- Live pen position display from cncrunner `pos` events
- Print progress (strokes done / total)

---

## Deferred

- New clearstack-style UI (big lift, do after pipeline is solid)
- Bezier smooth Z entry/exit in cncrunner
- Fill generation (offset/hatch) ported to cncrender
- Spawner protocol — swap node-ipc for stdin/stdout in spawner.js
- node-ipc full removal

---

## Reference

- Brush lag algorithm: `src/cncrender/BRUSH_COMPENSATION.md`
- cncrender: `src/cncrender/src/main.rs` — `compensate_brush_lag()`
- cncrunner: `src/cncrunner/src/main.rs`
- Print pipeline: `src/components/core/control/cncserver.print.js`
- IPC: `src/components/core/comms/cncserver.ipc.js`
- Runner serial: `src/components/core/runner/cncserver.runner.serial.js`
- WCB constants: 17.47 steps/mm, 6315×3600 steps canvas
- vbot PTY: `cd ../virtual-draw-bot && cargo run` — note PTY path, set in config.ini

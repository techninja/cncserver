# Brush Lag Compensation — Session Notes

## Algorithm (current state)

`compensate_brush_lag` in `src/cncrender/src/main.rs`:

1. **`max_lag`** = `length_mm * (1 - stiffness) * spm` — physical max brush deflection in mm
2. **`lead`** = `max_lag * (1 + (1 - stiffness) * 0.5)` — ferrule lead distance, scaled up for floppier brushes
3. **Tangent averaging** — for each point, average tangent vectors over 2mm ahead to smooth sharp reversals
4. **Confidence weighting** — scale offset by `(sum_magnitude / 2.0).min(1.0)` so near-180° reversals taper offset toward zero rather than spiking
5. **Start taper** — ramp offset from 0 → full over first `lead` mm of arc
6. **Bounds clamp** — clamp ferrule to `[0, maxAreaMM]` before extension
7. **End extension** — step `max_lag` mm past last desired point in 0.5mm increments along final tangent

## Known remaining issues

- **Sharp reversal corners** (h descender, k junction, u/o exits): confidence taper reduces but doesn't eliminate the inward dip. The `/ 2.0` divisor in confidence could be tuned to `/ 1.5` to reduce dip without re-introducing spikes.
- **Physical calibration**: the `lead` multiplier `(1 + (1-stiffness)*0.5)` was tuned visually against the vbot simulator. Real physical prints will need per-implement offset calibration — suggest adding a `lag_calibration` field to implement presets (default 1.0, user adjusts after first print).
- **Pen-down/up motion**: implement presets should eventually include `touchdown_mm` and `liftoff_mm` — distance to travel while lowering/raising Z — for coordinated XY+Z moves at stroke start/end.

## Implement params that drive compensation

From `crayola-size-3-brush.json` (generic-watercolor-generic):
- `length: 10.75` → bristle length in mm
- `stiffness: 0.25` → 0=completely floppy, 1=rigid pen
- `width: 3` → bristle width (used for `is_pen` check: width ≤ 1 skips compensation)

## Key files

- `src/cncrender/src/main.rs` — `compensate_brush_lag()` function
- `src/components/core/control/cncserver.print.js` — `accelMoveOnPath()`, passes implement params to cncrender
- `src/components/core/drawing/cncserver.drawing.colors.js` — `set.implement` holds active colorset's implement name
- `src/presets/implements/` — implement preset JSONs

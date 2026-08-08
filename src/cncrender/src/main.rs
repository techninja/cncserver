use std::io::{self, BufRead, Write};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── Shared types ─────────────────────────────────────────────────────────────

#[derive(Deserialize, Serialize, Clone, Copy)]
struct Point {
    x: f64,
    y: f64,
}

// ── Accell job ────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct AccellSettings {
    accel_rate: f64,
    speed_multiplier: f64,
    min_speed: f64,
    resolution: f64,
    max_deflection: f64,
}

impl Default for AccellSettings {
    fn default() -> Self {
        Self {
            accel_rate: 25.0,
            speed_multiplier: 0.75,
            min_speed: 15.0,
            resolution: 0.5,
            max_deflection: 10.0,
        }
    }
}

#[derive(Deserialize)]
struct AccellJob {
    hash: String,
    points: Vec<Point>,
    #[serde(default)]
    settings: Option<AccellSettings>,
}

#[derive(Serialize, Clone)]
struct AccellPoint {
    x: f64,
    y: f64,
    speed: f64,
    tangent_x: f64,
    tangent_y: f64,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum AccellOut {
    Result { hash: String, points: Vec<AccellPoint> },
}

fn angle_diff(a: f64, b: f64) -> f64 {
    (a - b).abs() % 360.0
}

// Returns (tangent_x, tangent_y) unit vector between two points.
fn tangent(a: Point, b: Point) -> (f64, f64) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let len = (dx * dx + dy * dy).sqrt();
    if len == 0.0 { (0.0, 0.0) } else { (dx / len, dy / len) }
}

fn vec_angle(tx: f64, ty: f64) -> f64 {
    ty.atan2(tx).to_degrees()
}

// Walk the flat point list from `from_i` and find how far we can go before
// the cumulative angle change exceeds `threshold`. Returns that distance.
fn lookahead_distance(
    pts: &[Point],
    from_i: usize,
    look_len: f64,
    threshold: f64,
    resolution: f64,
) -> Option<f64> {
    if from_i + 1 >= pts.len() {
        return None;
    }
    let (start_tx, start_ty) = tangent(pts[from_i], pts[from_i + 1]);
    let start_angle = vec_angle(start_tx, start_ty);
    let mut dist_walked = 0.0;

    let mut i = from_i;
    while i + 1 < pts.len() && dist_walked < look_len {
        let d = dist(pts[i], pts[i + 1]);
        let (tx, ty) = tangent(pts[i], pts[i + 1]);
        let a = vec_angle(tx, ty);
        if angle_diff(start_angle, a) > threshold {
            return Some(dist_walked.max(resolution));
        }
        dist_walked += d;
        i += 1;
    }
    None
}

fn ses_smooth(vals: &[f64], alpha: f64) -> Vec<f64> {
    if vals.is_empty() { return vec![]; }
    let mut out = Vec::with_capacity(vals.len());
    let mut s = vals[0];
    out.push(s);
    for &v in &vals[1..] {
        s = alpha * v + (1.0 - alpha) * s;
        out.push(s);
    }
    // Drop last (matches JS `forecast.pop()`)
    if out.len() > 1 { out.pop(); out.push(*out.last().unwrap()); }
    out
}

fn run_accell(job: AccellJob) {
    let s = job.settings.unwrap_or_default();
    let pts = &job.points;

    if pts.len() < 2 {
        let out = AccellOut::Result { hash: job.hash, points: vec![] };
        println!("{}", serde_json::to_string(&out).unwrap());
        return;
    }

    let mut speed: f64 = 0.0;
    let mut raw: Vec<AccellPoint> = Vec::with_capacity(pts.len());
    let mut speed_vals: Vec<f64> = Vec::with_capacity(pts.len());

    for i in 0..pts.len() {
        let (tx, ty) = if i + 1 < pts.len() {
            tangent(pts[i], pts[i + 1])
        } else {
            tangent(pts[i - 1], pts[i])
        };

        let step_speed = if i == 0 {
            0.0
        } else {
            let look_len = (speed * s.speed_multiplier).max(s.min_speed);
            match lookahead_distance(pts, i, look_len, s.max_deflection, s.resolution) {
                Some(d) => {
                    speed = d / s.speed_multiplier;
                    d
                }
                None => {
                    speed = (speed + s.accel_rate * s.resolution).min(100.0).max(0.0);
                    speed
                }
            }
        };

        speed_vals.push(step_speed);
        raw.push(AccellPoint {
            x: pts[i].x,
            y: pts[i].y,
            speed: step_speed,
            tangent_x: tx,
            tangent_y: ty,
        });
    }

    // Apply simple exponential smoothing (α=0.3, matches zodiac-ts SES).
    let smoothed = ses_smooth(&speed_vals, 0.3);
    for (p, &spd) in raw.iter_mut().zip(smoothed.iter()) {
        p.speed = (spd * 10.0).round() / 10.0;
    }

    let out = AccellOut::Result { hash: job.hash, points: raw };
    println!("{}", serde_json::to_string(&out).unwrap());
}

// ── Render stroke job (accell + compensate, streaming) ───────────────────────

#[derive(Deserialize)]
struct RenderStrokeJob {
    hash: String,
    points: Vec<Point>,
    #[serde(default)]
    settings: Option<AccellSettings>,
    implement: ImplementParams,
}

fn run_render_stroke(job: RenderStrokeJob) {
    let s = job.settings.unwrap_or_default();
    let pts = &job.points;

    if pts.len() < 2 {
        println!("{}", r#"{"t":"z","z":1,"dur":0}"#);
        io::stdout().flush().ok();
        return;
    }

    // 1. Accell
    let mut speed: f64 = 0.0;
    let mut raw: Vec<AccellPoint> = Vec::with_capacity(pts.len());
    let mut speed_vals: Vec<f64> = Vec::with_capacity(pts.len());
    for i in 0..pts.len() {
        let (tx, ty) = if i + 1 < pts.len() {
            tangent(pts[i], pts[i + 1])
        } else {
            tangent(pts[i - 1], pts[i])
        };
        let step_speed = if i == 0 {
            0.0
        } else {
            let look_len = (speed * s.speed_multiplier).max(s.min_speed);
            match lookahead_distance(pts, i, look_len, s.max_deflection, s.resolution) {
                Some(d) => { speed = d / s.speed_multiplier; d }
                None => {
                    speed = (speed + s.accel_rate * s.resolution).min(100.0).max(0.0);
                    speed
                }
            }
        };
        speed_vals.push(step_speed);
        raw.push(AccellPoint { x: pts[i].x, y: pts[i].y, speed: step_speed, tangent_x: tx, tangent_y: ty });
    }
    let smoothed = ses_smooth(&speed_vals, 0.3);
    for (p, &spd) in raw.iter_mut().zip(smoothed.iter()) {
        p.speed = (spd * 10.0).round() / 10.0;
    }

    // 2. Compensate
    let accell_pts: Vec<Point> = raw.iter().map(|p| Point { x: p.x, y: p.y }).collect();
    let ferrule = compensate_brush_lag(&accell_pts, &job.implement);

    // 3. Stream move lines — pen down first
    println!("{}", r#"{"t":"z","z":0,"dur":0}"#);
    io::stdout().flush().ok();

    let last_speed = raw.last().map(|p| p.speed).unwrap_or(s.min_speed);
    for (i, &(fx, fy)) in ferrule.iter().enumerate() {
        let spd = raw.get(i).map(|p| p.speed).unwrap_or(last_speed).max(s.min_speed);
        let (dx, dy) = if i > 0 {
            (fx - ferrule[i-1].0, fy - ferrule[i-1].1)
        } else {
            (0.0, 0.0)
        };
        let d = (dx*dx + dy*dy).sqrt();
        let dur = ((d / spd) * 1000.0).round().max(1.0) as u32;
        println!(
            "{{\"t\":\"move\",\"x\":{:.4},\"y\":{:.4},\"spd\":{},\"dur\":{}}}",
            fx, fy, spd, dur
        );
        io::stdout().flush().ok();
    }

    // Pen up + sentinel
    println!("{}", r#"{"t":"z","z":1,"dur":0}"#);
    println!("{{\"t\":\"stroke_done\",\"hash\":\"{}\"}}", job.hash);
    io::stdout().flush().ok();
}

// ── Compensate job ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ImplementParams {
    width_mm: f64,
    length_mm: f64,
    stiffness: f64,
    spm: f64,
    #[serde(default = "default_bounds")]
    bounds_x: f64,
    #[serde(default = "default_bounds")]
    bounds_y: f64,
}

fn default_bounds() -> f64 { f64::MAX }

#[derive(Deserialize)]
struct CompensateJob {
    hash: String,
    points: Vec<Point>,
    implement: ImplementParams,
}

#[derive(Serialize)]
struct CompensatedPoint {
    ferrule_x: f64,
    ferrule_y: f64,
    desired_x: f64,
    desired_y: f64,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum CompensateOut {
    Result { hash: String, points: Vec<CompensatedPoint> },
}

fn is_pen(imp: &ImplementParams) -> bool {
    imp.stiffness >= 1.0 || imp.width_mm <= 1.0
}

// Direct geometric lag compensation: offset each ferrule point forward along
// the path tangent by max_lag. The tip trails the ferrule by that distance,
// so leading by max_lag puts the tip at the desired position.
// An end-extension then steps forward until the simulated tip reaches the
// last desired point.
fn compensate_brush_lag(pts: &[Point], imp: &ImplementParams) -> Vec<(f64, f64)> {
    if is_pen(imp) || pts.len() < 2 {
        return pts.iter().map(|p| (p.x, p.y)).collect();
    }

    let max_lag = imp.length_mm * (1.0 - imp.stiffness) * imp.spm;
    // Stiffer brushes need less lead; floppy brushes need more.
    let lead    = max_lag * (1.0 + (1.0 - imp.stiffness) * 0.5);

    // Forward tangent at each point averaged over max_lag distance ahead
    // to prevent spikes at sharp corners from single-segment tangent noise.
    let n = pts.len();
    let mut ferrule: Vec<(f64, f64)> = (0..n).map(|i| {
        // Accumulate tangent vector over up to max_lag mm ahead.
        let mut tx = 0.0f64;
        let mut ty = 0.0f64;
        let mut walked = 0.0f64;
        let mut j = i;
        while j + 1 < n && walked < 2.0 {
            let (stx, sty) = tangent(pts[j], pts[j + 1]);
            let seg = dist(pts[j], pts[j + 1]);
            tx += stx;
            ty += sty;
            walked += seg;
            j += 1;
        }
        let tlen = (tx*tx + ty*ty).sqrt();
        // Use magnitude as a confidence weight — near-zero means sharp reversal.
        // Scale offset by confidence so reversals taper smoothly to zero rather than spiking.
        let confidence = (tlen / 2.0).min(1.0);
        let (tx, ty) = if tlen > 1e-9 { (tx/tlen * confidence, ty/tlen * confidence) } else { (0.0, 0.0) };
        (pts[i].x + tx * lead, pts[i].y + ty * lead)
    }).collect();

    // Clamp ferrule displacement between consecutive points to suppress any
    // remaining spikes — max jump is lead mm per 0.5mm step.
    for i in 1..n {
        let dx = ferrule[i].0 - ferrule[i-1].0;
        let dy = ferrule[i].1 - ferrule[i-1].1;
        let d = (dx*dx + dy*dy).sqrt();
        if d > lead * 2.0 {
            ferrule[i].0 = ferrule[i-1].0 + dx / d * lead * 2.0;
            ferrule[i].1 = ferrule[i-1].1 + dy / d * lead * 2.0;
        }
    }

    // Taper offset at stroke start over lead distance.
    let mut arc = vec![0.0f64; n];
    for i in 1..n {
        let dx = pts[i].x - pts[i-1].x;
        let dy = pts[i].y - pts[i-1].y;
        arc[i] = arc[i-1] + (dx*dx + dy*dy).sqrt();
    }
    for i in 0..n {
        let t = (arc[i] / lead.max(1.0)).min(1.0);
        ferrule[i].0 = pts[i].x + (ferrule[i].0 - pts[i].x) * t;
        ferrule[i].1 = pts[i].y + (ferrule[i].1 - pts[i].y) * t;
    }

    // Clamp to bot bounds.
    for p in ferrule.iter_mut() {
        p.0 = p.0.max(0.0).min(imp.bounds_x);
        p.1 = p.1.max(0.0).min(imp.bounds_y);
    }

    // Extend ferrule past end so tip reaches last desired point.
    // Cap extension at max_lag — longer strokes need less since ferrule already leads.
    if n >= 2 {
        let (ex, ey) = (pts[n-1].x - pts[n-2].x, pts[n-1].y - pts[n-2].y);
        let ed = (ex*ex + ey*ey).sqrt();
        if ed > 1e-9 {
            let (ux, uy) = (ex / ed, ey / ed);
            let last = ferrule.last().copied().unwrap();
            let ext = max_lag.min(lead);
            let steps = (ext / 0.5).ceil() as usize;
            for s in 1..=steps {
                let t = (s as f64 * 0.5).min(ext);
                ferrule.push((last.0 + ux * t, last.1 + uy * t));
            }
        }
    }

    ferrule
}

fn run_compensate(job: CompensateJob) {
    let desired: Vec<Point> = job.points.clone();
    let ferrule = compensate_brush_lag(&job.points, &job.implement);
    let last_desired = *desired.last().unwrap();

    let points: Vec<CompensatedPoint> = ferrule.iter().enumerate().map(|(i, &(fx, fy))| {
        let d = desired.get(i).copied().unwrap_or(last_desired);
        CompensatedPoint { ferrule_x: fx, ferrule_y: fy, desired_x: d.x, desired_y: d.y }
    }).collect();

    let out = CompensateOut::Result { hash: job.hash, points };
    println!("{}", serde_json::to_string(&out).unwrap());
}

// ── TSP job ───────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct TspJob {
    hash: String,
    points: Vec<Point>,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum TspOut {
    Progress { hash: String, pct: u8 },
    Result { hash: String, ordered: Vec<Point>, length_mm: f64 },
}

fn dist(a: Point, b: Point) -> f64 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    (dx * dx + dy * dy).sqrt()
}

fn tour_length(pts: &[Point], order: &[usize]) -> f64 {
    let n = order.len();
    (0..n).map(|i| dist(pts[order[i]], pts[order[(i + 1) % n]])).sum()
}

fn nearest_neighbor(pts: &[Point]) -> Vec<usize> {
    let n = pts.len();
    let mut visited = vec![false; n];
    let mut tour = Vec::with_capacity(n);
    let mut cur = 0;
    visited[cur] = true;
    tour.push(cur);
    for _ in 1..n {
        let next = (0..n)
            .filter(|&j| !visited[j])
            .min_by(|&a, &b| {
                dist(pts[cur], pts[a])
                    .partial_cmp(&dist(pts[cur], pts[b]))
                    .unwrap()
            })
            .unwrap();
        visited[next] = true;
        tour.push(next);
        cur = next;
    }
    tour
}

fn two_opt(pts: &[Point], mut tour: Vec<usize>, hash: &str) -> Vec<usize> {
    let n = tour.len();
    if n < 4 {
        return tour;
    }
    let max_iter = 10_000usize;
    let deadline = Instant::now() + std::time::Duration::from_millis(500);
    let report_every = (max_iter / 20).max(1); // ~5% steps
    let mut last_pct: u8 = 0;

    let mut improved = true;
    let mut iter = 0;
    while improved && iter < max_iter && Instant::now() < deadline {
        improved = false;
        'outer: for i in 0..n - 1 {
            for j in i + 2..n {
                if j == n - 1 && i == 0 {
                    continue;
                }
                let a = tour[i];
                let b = tour[i + 1];
                let c = tour[j];
                let d = tour[(j + 1) % n];
                if dist(pts[a], pts[b]) + dist(pts[c], pts[d])
                    > dist(pts[a], pts[c]) + dist(pts[b], pts[d])
                {
                    tour[i + 1..=j].reverse();
                    improved = true;
                    iter += 1;

                    // Emit progress every ~5%
                    let pct = ((iter * 100) / max_iter).min(99) as u8;
                    if pct != last_pct && iter % report_every == 0 {
                        last_pct = pct;
                        let msg = TspOut::Progress { hash: hash.to_string(), pct };
                        println!("{}", serde_json::to_string(&msg).unwrap());
                        io::stdout().flush().ok();
                    }

                    if iter >= max_iter || Instant::now() >= deadline {
                        break 'outer;
                    }
                }
            }
        }
    }
    tour
}

fn run_tsp(job: TspJob) {
    let pts = &job.points;
    if pts.is_empty() {
        let out = TspOut::Result {
            hash: job.hash,
            ordered: vec![],
            length_mm: 0.0,
        };
        println!("{}", serde_json::to_string(&out).unwrap());
        return;
    }

    let tour = nearest_neighbor(pts);
    let tour = two_opt(pts, tour, &job.hash);
    let length_mm = tour_length(pts, &tour);
    let ordered: Vec<Point> = tour.iter().map(|&i| pts[i]).collect();

    let out = TspOut::Result { hash: job.hash, ordered, length_mm };
    println!("{}", serde_json::to_string(&out).unwrap());
}

// ── Entry point ───────────────────────────────────────────────────────────────

fn main() {
    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = line.expect("stdin read error");
        if line.trim().is_empty() {
            continue;
        }

        let v: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("parse error: {e}");
                continue;
            }
        };

        match v.get("job").and_then(Value::as_str) {
            Some("tsp") => {
                match serde_json::from_value::<TspJob>(v) {
                    Ok(job) => run_tsp(job),
                    Err(e) => eprintln!("tsp job parse error: {e}"),
                }
            }
            Some("accell") => {
                match serde_json::from_value::<AccellJob>(v) {
                    Ok(job) => run_accell(job),
                    Err(e) => eprintln!("accell job parse error: {e}"),
                }
            }
            Some("compensate") => {
                match serde_json::from_value::<CompensateJob>(v) {
                    Ok(job) => run_compensate(job),
                    Err(e) => eprintln!("compensate job parse error: {e}"),
                }
            }
            Some("render_stroke") => {
                match serde_json::from_value::<RenderStrokeJob>(v) {
                    Ok(job) => run_render_stroke(job),
                    Err(e) => eprintln!("render_stroke job parse error: {e}"),
                }
            }
            Some(other) => eprintln!("unknown job: {other}"),
            None => eprintln!("missing 'job' field"),
        }

        io::stdout().flush().ok();
    }
}

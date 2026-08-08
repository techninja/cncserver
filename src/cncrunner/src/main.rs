use std::io::{self, BufRead, Read, Seek, Write};
use std::fs::File;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use serialport::SerialPort;

// ── Config (first stdin line) ─────────────────────────────────────────────────

#[derive(Deserialize)]
struct Config {
    port: String,
    baud: u32,
    setup_commands: Vec<String>,
    steps_per_mm: StepsPerMM,
    #[serde(default)]
    z_min: u32,
    #[serde(default = "default_z_max")]
    z_max: u32,
}

#[derive(Deserialize, Clone, Copy)]
struct StepsPerMM {
    x: f64,
    y: f64,
}

fn default_z_max() -> u32 { 100 }

// ── Control messages (stdin after config) ─────────────────────────────────────

#[derive(Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
enum CtrlMsg {
    Run    { file: String },
    Stop,
    Pause,
    Resume,
    Speed  { mul: f64 },
    Write  { data: String },
}

// ── Output events (stdout NDJSON) ─────────────────────────────────────────────

fn emit(obj: &str) {
    println!("{obj}");
    io::stdout().flush().ok();
}

fn emit_ready(version: &str) {
    emit(&format!(r#"{{"t":"ready","version":{}}}"#,
        serde_json::to_string(version).unwrap()));
}

fn emit_pos(x: i64, y: i64) {
    emit(&format!(r#"{{"t":"pos","x":{x},"y":{y}}}"#));
}

fn emit_ack(i: usize) {
    emit(&format!(r#"{{"t":"ack","i":{i}}}"#));
}

fn emit_done() { emit(r#"{"t":"done"}"#); }

fn emit_data(msg: &str) {
    emit(&format!(r#"{{"t":"data","msg":{}}}"#,
        serde_json::to_string(msg).unwrap()));
}

fn emit_error(msg: &str) {
    emit(&format!(r#"{{"t":"error","msg":{}}}"#,
        serde_json::to_string(msg).unwrap()));
}

// ── Shared control state ──────────────────────────────────────────────────────

struct ControlInner {
    paused:        bool,
    stop:          bool,
    speed_mul:     f64,
    write_queue:   Vec<String>,
    pending_run:   Option<String>,
}

#[derive(Clone)]
struct Control {
    inner: Arc<Mutex<ControlInner>>,
}

impl Control {
    fn new() -> Self {
        Self { inner: Arc::new(Mutex::new(ControlInner {
            paused: false, stop: false, speed_mul: 1.0,
            write_queue: Vec::new(), pending_run: None,
        }))}
    }

    fn apply(&self, msg: CtrlMsg) {
        let mut g = self.inner.lock().unwrap();
        match msg {
            CtrlMsg::Pause          => g.paused = true,
            CtrlMsg::Resume         => g.paused = false,
            CtrlMsg::Stop           => g.stop = true,
            CtrlMsg::Speed { mul }  => g.speed_mul = mul.max(0.1),
            CtrlMsg::Write { data } => g.write_queue.push(data),
            CtrlMsg::Run   { file } => g.pending_run = Some(file),
        }
    }

    fn is_stopped(&self) -> bool { self.inner.lock().unwrap().stop }
    fn is_paused(&self)  -> bool { self.inner.lock().unwrap().paused }
    fn speed_mul(&self)  -> f64  { self.inner.lock().unwrap().speed_mul }

    fn drain_write_queue(&self) -> Vec<String> {
        let mut g = self.inner.lock().unwrap();
        std::mem::take(&mut g.write_queue)
    }

    fn take_pending_run(&self) -> Option<String> {
        self.inner.lock().unwrap().pending_run.take()
    }

    // Block until unpaused or stopped. Returns false if stopped.
    fn wait_if_paused(&self) -> bool {
        loop {
            { let g = self.inner.lock().unwrap();
              if g.stop   { return false; }
              if !g.paused { return true; } }
            thread::sleep(Duration::from_millis(20));
        }
    }
}

// ── Serial helpers ────────────────────────────────────────────────────────────

fn write_and_wait_ack(port: &mut Box<dyn SerialPort>, command: &str) -> Result<String, String> {
    port.write_all(format!("{command}\r").as_bytes()).map_err(|e| e.to_string())?;
    port.flush().map_err(|e| e.to_string())?;
    read_line(port)
}

fn read_line(port: &mut Box<dyn SerialPort>) -> Result<String, String> {
    let mut response = String::new();
    let mut byte = [0u8; 1];
    loop {
        match port.read(&mut byte) {
            Ok(1) => {
                let ch = byte[0] as char;
                if ch == '\r' || ch == '\n' {
                    let trimmed = response.trim().to_string();
                    if !trimmed.is_empty() { return Ok(trimmed); }
                    response.clear();
                } else {
                    response.push(ch);
                }
            }
            Ok(_) => {}
            Err(e) if e.kind() == io::ErrorKind::TimedOut => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
}

// ── Move file runner ──────────────────────────────────────────────────────────

fn service_pending_write(port: &mut Box<dyn SerialPort>, ctrl: &Control) {
    for cmd in ctrl.drain_write_queue() {
        match write_and_wait_ack(port, &cmd) {
            Ok(resp) => emit_data(&resp),
            Err(e)   => emit_error(&e),
        }
    }
}

fn run_move_file(file: &str, cfg: &Config, port: &mut Box<dyn SerialPort>, ctrl: &Control) {
    let spm = cfg.steps_per_mm;
    let mut pos_x: i64 = 0;
    let mut pos_y: i64 = 0;
    let mut line_index: usize = 0;
    let mut offset: u64 = 0;
    let mut idle_ms: u64 = 0;
    const IDLE_TIMEOUT_MS: u64 = 10_000;

    loop {
        if ctrl.is_stopped() { return; }
        service_pending_write(port, ctrl);

        let file_len = match std::fs::metadata(file) {
            Ok(m) => m.len(),
            Err(_) => { thread::sleep(Duration::from_millis(50)); continue; }
        };

        if file_len > offset {
            idle_ms = 0;
            let mut f = match File::open(file) {
                Ok(f) => f,
                Err(e) => { emit_error(&e.to_string()); return; }
            };
            f.seek(io::SeekFrom::Start(offset)).ok();
            let mut buf = vec![0u8; (file_len - offset) as usize];
            f.read_exact(&mut buf).ok();
            offset = file_len;

            for raw in buf.split(|&b| b == b'\n') {
                let line = match std::str::from_utf8(raw) {
                    Ok(s) => s.trim(),
                    Err(_) => continue,
                };
                if line.is_empty() { continue; }

                let msg: serde_json::Value = match serde_json::from_str(line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                if !ctrl.wait_if_paused() { return; }
                service_pending_write(port, ctrl);

                let t = msg.get("t").and_then(|v| v.as_str()).unwrap_or("");
                match t {
                    "move" => {
                        let x_mm    = msg["x"].as_f64().unwrap_or(0.0);
                        let y_mm    = msg["y"].as_f64().unwrap_or(0.0);
                        let dur_raw = msg["dur"].as_f64().unwrap_or(1.0);
                        let dur     = ((dur_raw / ctrl.speed_mul()).round() as u32).max(1);
                        let abs_x   = (x_mm * spm.x).round() as i64;
                        let abs_y   = (y_mm * spm.y).round() as i64;
                        let dx = abs_x - pos_x;
                        let dy = abs_y - pos_y;
                        pos_x = abs_x;
                        pos_y = abs_y;
                        match write_and_wait_ack(port, &format!("SM,{dur},{dx},{dy}")) {
                            Ok(_)  => { emit_pos(pos_x, pos_y); emit_ack(line_index); }
                            Err(e) => { emit_error(&e); return; }
                        }
                    }
                    "z" => {
                        let z      = msg["z"].as_f64().unwrap_or(1.0);
                        let height = if z == 0.0 { cfg.z_min } else { cfg.z_max };
                        if let Err(e) = write_and_wait_ack(port, &format!("SP,{height}")) {
                            emit_error(&e); return;
                        }
                    }
                    _ => {}
                }
                line_index += 1;
            }
        } else {
            idle_ms += 50;
            if idle_ms >= IDLE_TIMEOUT_MS { break; }
            thread::sleep(Duration::from_millis(50));
        }
    }

    emit_done();
}

// ── Entry point ───────────────────────────────────────────────────────────────

fn main() {
    let stdin = io::stdin();
    let mut lines = stdin.lock().lines();

    // First line: config JSON.
    let cfg: Config = match lines.next() {
        Some(Ok(l)) => match serde_json::from_str(&l) {
            Ok(c) => c,
            Err(e) => { emit_error(&format!("config parse: {e}")); return; }
        },
        _ => { emit_error("expected config on stdin"); return; }
    };

    // Open serial port.
    let mut port = match serialport::new(&cfg.port, cfg.baud)
        .timeout(Duration::from_millis(5000))
        .open()
    {
        Ok(p) => p,
        Err(e) => { emit_error(&format!("serial open: {e}")); return; }
    };

    // Send setup commands.
    for cmd in &cfg.setup_commands {
        if let Err(e) = write_and_wait_ack(&mut port, cmd) {
            emit_error(&format!("setup '{cmd}': {e}")); return;
        }
    }

    // Query firmware version — response is two lines: version string then OK.
    let version = match write_and_wait_ack(&mut port, "V") {
        Ok(resp) => {
            let _ = read_line(&mut port); // drain trailing OK
            resp.split("Version ").nth(1)
                .and_then(|s| s.split_whitespace().next())
                .unwrap_or("unknown")
                .to_string()
        }
        Err(e) => { emit_error(&format!("version query: {e}")); return; }
    };

    emit_ready(&version);

    // Spin up stdin reader thread — feeds control messages into shared state.
    let ctrl = Control::new();
    let ctrl_t = ctrl.clone();
    // Drop the stdin lock before spawning so the thread can acquire it.
    drop(lines);
    thread::spawn(move || {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            let line = match line { Ok(l) => l, Err(_) => break };
            if line.trim().is_empty() { continue; }
            match serde_json::from_str::<CtrlMsg>(&line) {
                Ok(msg) => ctrl_t.apply(msg),
                Err(e)  => eprintln!("ctrl parse: {e}"),
            }
        }
    });

    // Main loop: idle until a run is requested, execute, repeat.
    loop {
        if ctrl.is_stopped() { break; }

        service_pending_write(&mut port, &ctrl);

        if let Some(file) = ctrl.take_pending_run() {
            run_move_file(&file, &cfg, &mut port, &ctrl);
        } else {
            thread::sleep(Duration::from_millis(50));
        }
    }
}

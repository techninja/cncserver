/**
 * Integration test: cncrender TSP NDJSON round-trip.
 * Run with: node test/cncrender/tsp.test.js
 */
import { spawn } from 'child_process';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, '../../src/cncrender/bin', process.platform, 'cncrender');

const POINTS = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
  { x: 0, y: 100 }, { x: 50, y: 50 }, { x: 25, y: 75 },
];

const job = { job: 'tsp', hash: 'test-001', points: POINTS };

const proc = spawn(BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });
const rl = readline.createInterface({ input: proc.stdout });
const progress = [];

rl.on('line', line => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.type === 'progress') {
    progress.push(msg.pct);
    process.stdout.write(`  progress ${msg.pct}%\n`);
  } else if (msg.type === 'result') {
    console.log('✓ result received');
    console.log(`  hash:       ${msg.hash}`);
    console.log(`  points in:  ${POINTS.length}`);
    console.log(`  points out: ${msg.ordered.length}`);
    console.log(`  length_mm:  ${msg.length_mm.toFixed(2)}`);
    console.log(`  progress lines: ${progress.length}`);

    const ok =
      msg.hash === job.hash &&
      msg.ordered.length === POINTS.length &&
      msg.length_mm > 0;

    if (!ok) { console.error('FAIL: result validation failed'); process.exit(1); }
    console.log('✓ all assertions passed');
  }
});

proc.stderr.on('data', d => console.error(`stderr: ${d}`));
proc.on('close', code => {
  if (code) { console.error(`FAIL: exit code ${code}`); process.exit(1); }
});

proc.stdin.write(`${JSON.stringify(job)}\n`);
proc.stdin.end();

import { performance } from "node:perf_hooks";
import { parseArg, readJson } from "./agent-lib.mjs";

const base = parseArg("base", "http://localhost:3000");
const concurrency = Number(parseArg("concurrency", "20"));
const requests = Number(parseArg("requests", "100"));
const baseline = readJson(".agent/stress/baseline.json");
const paths = ["/api/leads", "/api/loops", "/api/inbox", "/api/report"];
const latencies = [];
let failures = 0;
let cursor = 0;

// Compile/warm every route before measuring steady-state latency. Cold-start
// latency is tracked separately by deployment telemetry; mixing dev compilation
// into this baseline makes comparisons meaningless.
for (const route of paths) {
  const response = await fetch(`${base}${route}`);
  if (!response.ok) {
    console.error(`warmup failed: ${route} -> ${response.status}`);
    process.exit(1);
  }
  await response.arrayBuffer();
}

async function worker() {
  while (cursor < requests) {
    const index = cursor++;
    const started = performance.now();
    try {
      const response = await fetch(`${base}${paths[index % paths.length]}`);
      if (!response.ok) failures++;
      await response.arrayBuffer();
    } catch {
      failures++;
    }
    latencies.push(performance.now() - started);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
latencies.sort((a, b) => a - b);
const p95 = latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] ?? Infinity;
const allowed = baseline.p95_ms * 1.1;
console.log(JSON.stringify({ requests, concurrency, failures, p95_ms: Math.round(p95), allowed_ms: allowed }, null, 2));
process.exit(failures === 0 && p95 <= allowed ? 0 : 1);

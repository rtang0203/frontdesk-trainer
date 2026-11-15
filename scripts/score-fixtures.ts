// Usage: npm run score:fixtures
// Scores every fixture in fixtures/expected.json and compares each criterion.
// Exits non-zero only on a label mismatch; latency only warns.
import fs from "node:fs";
import path from "node:path";
import { getDefaultScenario } from "@/lib/scenarios";
import { scoreCall } from "@/lib/scoring/scoreCall";

const SLOW_MS = 12_000;
const dir = path.join(process.cwd(), "fixtures");
const expected: Record<string, Record<string, string>> = JSON.parse(
  fs.readFileSync(path.join(dir, "expected.json"), "utf8"),
);
const scenario = getDefaultScenario();

const results = await Promise.all(
  Object.keys(expected).map(async (name) => ({
    name,
    result: await scoreCall(fs.readFileSync(path.join(dir, `${name}.txt`), "utf8"), scenario, { callId: name }),
  })),
);

let mismatches = 0;
const latencies: number[] = [];
for (const { name, result } of results) {
  const { scorecard, latencyMs } = result;
  latencies.push(latencyMs);
  const slow = latencyMs > SLOW_MS ? `  WARNING: over ${SLOW_MS / 1000} s` : "";
  console.log(`${name}: ${scorecard.passed} / ${scorecard.applicable} · ${latencyMs} ms${slow}`);
  for (const c of scorecard.criteria) {
    const want = expected[name][c.id];
    if (want !== c.result) {
      mismatches++;
      console.log(`  MISMATCH ${c.id}: expected ${want}, got ${c.result}\n    feedback: ${c.feedback}`);
    }
  }
}

const sorted = [...latencies].sort((a, b) => a - b);
const mid = Math.floor(sorted.length / 2);
const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
console.log(`\nLatency median ${median} ms (${latencies.join(", ")} ms)${median > SLOW_MS ? "  WARNING: median over 12 s" : ""}`);
console.log(mismatches ? `${mismatches} criterion mismatch(es)` : "All criteria match");
process.exit(mismatches ? 1 : 0);

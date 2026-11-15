// Usage: npm run score -- fixtures/good_botox_1.txt
import fs from "node:fs";
import { getDefaultScenario } from "@/lib/scenarios";
import { scoreCall } from "@/lib/scoring/scoreCall";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run score -- <transcript.txt>");
  process.exit(2);
}

const result = await scoreCall(fs.readFileSync(file, "utf8"), getDefaultScenario(), { callId: file });
console.log(JSON.stringify(result.scorecard, null, 2));
console.log(`\n${result.scorecard.passed} / ${result.scorecard.applicable} · ${result.model} · ${result.latencyMs} ms`);

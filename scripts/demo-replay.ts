// Usage: npm run demo:replay -- good_botox_2
// Live-demo fallback: plays a saved transcript through the same pipeline as a real call.
// The live page tags these calls "Recorded call"; tell the room it is a recording.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { supabaseCallStore as store } from "@/lib/calls";
import { claimForScoring, scoreAndSave } from "@/lib/pipeline";
import { getDefaultScenario } from "@/lib/scenarios";
import { stripNoResponseLines, type TranscriptEntry } from "@/lib/transcript";

const IN_PROGRESS_MS = 3000;

const name = process.argv[2];
if (!name) {
  console.error("Usage: npm run demo:replay -- <fixture>   (for example good_botox_2)");
  process.exit(2);
}
const file = path.join(process.cwd(), "fixtures", name.endsWith(".txt") ? name : `${name}.txt`);
if (!fs.existsSync(file)) {
  console.error(`No fixture at ${file}`);
  process.exit(2);
}
const transcript = stripNoResponseLines(fs.readFileSync(file, "utf8")).trim();
const transcriptObject: TranscriptEntry[] = transcript.split("\n").flatMap((line) => {
  const m = /^(agent|user):\s*(.*)$/i.exec(line.trim());
  return m ? [{ role: m[1].toLowerCase(), content: m[2] }] : [];
});

const scenario = getDefaultScenario();
const retellCallId = `replay_${randomUUID()}`;
const startedAt = new Date();

await store.insertIfAbsent({
  retell_call_id: retellCallId,
  scenario_id: scenario.id,
  call_type: "replay",
  status: "in_progress",
  started_at: startedAt.toISOString(),
});
console.log(`in_progress  ${retellCallId}`);
await sleep(IN_PROGRESS_MS);

const endedAt = new Date();
await store.update(retellCallId, {
  transcript,
  transcript_object: transcriptObject,
  ended_at: endedAt.toISOString(),
  duration_ms: endedAt.getTime() - startedAt.getTime(),
});
if (!(await claimForScoring(store, retellCallId))) {
  console.error("Could not claim the call for scoring");
  process.exit(1);
}
console.log("scoring");

const row = await scoreAndSave(store, retellCallId);
if (row?.status === "scored") {
  console.log(`scored       ${row.passed} / ${row.applicable} · ${row.scoring_latency_ms} ms`);
} else {
  console.error(`failed       ${row?.scoring_error ?? "unknown error"}`);
  process.exit(1);
}

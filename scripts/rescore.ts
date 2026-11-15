// Usage: npm run rescore -- <call_id>
// Accepts the row id (uuid) or the Retell call id. Saves the result as scored or failed.
import { supabaseCallStore } from "@/lib/calls";
import { getDb } from "@/lib/db";
import { scoreAndSave } from "@/lib/pipeline";

const id = process.argv[2];
if (!id) {
  console.error("Usage: npm run rescore -- <call_id>");
  process.exit(2);
}

const column = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? "id" : "retell_call_id";
const { data, error } = await getDb().from("calls").select("retell_call_id").eq(column, id).maybeSingle();
if (error) throw new Error(error.message);
if (!data) {
  console.error(`No call with ${column} ${id}`);
  process.exit(1);
}

const row = await scoreAndSave(supabaseCallStore, data.retell_call_id);
if (row?.status === "scored") {
  console.log(`scored: ${row.passed} / ${row.applicable} · ${row.scoring_model} · ${row.scoring_latency_ms} ms`);
} else {
  console.error(`failed: ${row?.scoring_error ?? "unknown error"}`);
  process.exit(1);
}

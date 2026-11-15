import type { CallRow, CallStore } from "@/lib/calls";
import { getDefaultScenario, getScenario } from "@/lib/scenarios";
import { scoreCall } from "@/lib/scoring/scoreCall";

/**
 * Atomically move a call from dialing/in_progress to scoring.
 * Returns false when another delivery (or nothing) claimed it.
 * Shared by the webhook and demo:replay so the two paths can't drift.
 */
export function claimForScoring(store: CallStore, retellCallId: string): Promise<boolean> {
  return store.update(retellCallId, { status: "scoring" }, ["dialing", "in_progress"]);
}

/**
 * Score a stored call and save the result as scored or failed. Never throws:
 * it runs after the webhook response, where nobody could catch it.
 */
export async function scoreAndSave(
  store: CallStore,
  retellCallId: string,
  score: typeof scoreCall = scoreCall,
): Promise<CallRow | null> {
  try {
    const row = await store.getByRetellId(retellCallId);
    if (!row) throw new Error(`Call ${retellCallId} not found`);
    if (!row.transcript?.trim()) throw new Error("Call has no transcript");
    const scenario = getScenario(row.scenario_id) ?? getDefaultScenario();
    const result = await score(row.transcript, scenario, { callId: retellCallId });
    await store.update(retellCallId, {
      status: "scored",
      scorecard: result.scorecard,
      passed: result.scorecard.passed,
      applicable: result.scorecard.applicable,
      scoring_model: result.model,
      scoring_latency_ms: result.latencyMs,
      scoring_error: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[scoring] call ${retellCallId} failed: ${message}`);
    try {
      await store.update(retellCallId, { status: "failed", scoring_error: message.slice(0, 1000) });
    } catch (saveError) {
      console.error(`[scoring] call ${retellCallId}: could not save failure`, saveError);
    }
  }
  return store.getByRetellId(retellCallId).catch(() => null);
}

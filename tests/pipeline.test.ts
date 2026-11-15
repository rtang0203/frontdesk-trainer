import { describe, expect, it, vi } from "vitest";
import { claimForScoring, scoreAndSave } from "@/lib/pipeline";
import { getDefaultScenario } from "@/lib/scenarios";
import type { scoreCall } from "@/lib/scoring/scoreCall";
import { memoryStore } from "./memoryStore";

const scenario = getDefaultScenario();
const card = {
  criteria: scenario.rubric.map((r, i) => ({
    id: r.id,
    result: i === 0 ? ("fail" as const) : i === 1 ? ("not_applicable" as const) : ("pass" as const),
    quote: null,
    feedback: "f",
    say_instead: null,
  })),
  best_moment: "b",
  top_fix: "t",
  passed: scenario.rubric.length - 2,
  applicable: scenario.rubric.length - 1,
};

async function seeded() {
  const { store, rows } = memoryStore();
  await store.insertIfAbsent({
    retell_call_id: "c1",
    scenario_id: scenario.id,
    status: "in_progress",
    transcript: "User: Hi\nAgent: Hello",
  });
  return { store, rows };
}

describe("scoreAndSave", () => {
  it("saves a scored call with totals, model, and latency", async () => {
    const { store, rows } = await seeded();
    expect(await claimForScoring(store, "c1")).toBe(true);
    expect(await claimForScoring(store, "c1")).toBe(false);
    const score = vi.fn<typeof scoreCall>().mockResolvedValue({ scorecard: card, model: "m", latencyMs: 1234 });
    await scoreAndSave(store, "c1", score);
    expect(score).toHaveBeenCalledWith("User: Hi\nAgent: Hello", scenario, { callId: "c1" });
    const row = rows.get("c1")!;
    expect(row.status).toBe("scored");
    expect(row.passed).toBe(card.passed);
    expect(row.applicable).toBe(card.applicable);
    expect(row.scoring_model).toBe("m");
    expect(row.scoring_latency_ms).toBe(1234);
  });

  it("marks the call failed with the error instead of throwing", async () => {
    const { store, rows } = await seeded();
    await scoreAndSave(store, "c1", vi.fn<typeof scoreCall>().mockRejectedValue(new Error("Scoring failed validation twice: x")));
    expect(rows.get("c1")!.status).toBe("failed");
    expect(rows.get("c1")!.scoring_error).toBe("Scoring failed validation twice: x");
  });

  it("clears an earlier error when a rescore succeeds", async () => {
    const { store, rows } = await seeded();
    await store.update("c1", { status: "failed", scoring_error: "Scoring timed out" });
    await scoreAndSave(store, "c1", vi.fn<typeof scoreCall>().mockResolvedValue({ scorecard: card, model: "m", latencyMs: 1 }));
    expect(rows.get("c1")!.status).toBe("scored");
    expect(rows.get("c1")!.scoring_error).toBeNull();
  });
});

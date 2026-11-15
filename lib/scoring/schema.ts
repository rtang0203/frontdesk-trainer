import { z } from "zod";
import type { Scenario } from "@/lib/scenarios";

export const RESULTS = ["pass", "fail", "not_applicable"] as const;
export type CriterionResult = (typeof RESULTS)[number];

const CriterionSchema = z.object({
  id: z.string(),
  result: z.enum(RESULTS),
  quote: z.string().nullable(),
  feedback: z.string().min(1),
  say_instead: z.string().nullable(),
});

/** Shape the model must return. Also the source of the structured-output JSON schema. */
export const ModelScorecardSchema = z.object({
  criteria: z.array(CriterionSchema),
  best_moment: z.string().min(1),
  top_fix: z.string().min(1),
});

export type Criterion = z.infer<typeof CriterionSchema>;
export type ModelScorecard = z.infer<typeof ModelScorecardSchema>;

/** What scoreCall returns and what is stored in calls.scorecard. */
export type Scorecard = ModelScorecard & {
  passed: number;
  applicable: number;
};

/** Structural schema plus the rules a JSON schema can't express. */
export function scorecardValidator(scenario: Scenario) {
  const ids = scenario.rubric.map((r) => r.id);
  return ModelScorecardSchema.superRefine((card, ctx) => {
    if (card.criteria.length !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["criteria"],
        message: `Expected ${ids.length} criteria (${ids.join(", ")}), got ${card.criteria.length}`,
      });
      return;
    }
    card.criteria.forEach((c, i) => {
      if (c.id !== ids[i]) {
        ctx.addIssue({
          code: "custom",
          path: ["criteria", i, "id"],
          message: `Expected id "${ids[i]}" at position ${i}, got "${c.id}"`,
        });
      }
      if (!c.feedback.trim()) {
        ctx.addIssue({ code: "custom", path: ["criteria", i, "feedback"], message: "feedback is empty" });
      }
    });
    if (!card.best_moment.trim()) ctx.addIssue({ code: "custom", path: ["best_moment"], message: "best_moment is empty" });
    if (!card.top_fix.trim()) ctx.addIssue({ code: "custom", path: ["top_fix"], message: "top_fix is empty" });
  });
}

export function computeTotals(criteria: Criterion[]): { passed: number; applicable: number } {
  return {
    passed: criteria.filter((c) => c.result === "pass").length,
    applicable: criteria.filter((c) => c.result !== "not_applicable").length,
  };
}

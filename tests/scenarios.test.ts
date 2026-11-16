import { describe, expect, it } from "vitest";
import { loadScenarios } from "@/lib/scenarios";

// The price list is display-only and repeats spaFacts, which the grader reads.
// If one changes without the other, the trainee is graded against facts they weren't shown.
describe("priceList", () => {
  for (const scenario of loadScenarios()) {
    it(`${scenario.id}: every price list row agrees with a spa fact`, () => {
      const facts = scenario.spaFacts.map((f) => f.toLowerCase());
      for (const item of scenario.priceList ?? []) {
        const match = facts.some((f) => f.includes(item.label.toLowerCase()) && f.includes(item.value.toLowerCase()));
        expect(match, `${item.label}: ${item.value}`).toBe(true);
      }
    });
  }
});

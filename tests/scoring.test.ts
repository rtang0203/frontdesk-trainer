import { describe, expect, it } from "vitest";
import { getDefaultScenario } from "@/lib/scenarios";
import { buildPrompt, loadPromptTemplate } from "@/lib/scoring/prompt";
import { normalizeForQuote, quoteAppears } from "@/lib/scoring/quoteCheck";
import { computeTotals, scorecardValidator, type Criterion } from "@/lib/scoring/schema";

const scenario = getDefaultScenario();

function goodCard() {
  return {
    criteria: scenario.rubric.map(
      (r): Criterion => ({ id: r.id, result: "pass", quote: "hi", feedback: "Nice.", say_instead: null }),
    ),
    best_moment: "Held the price.",
    top_fix: "Offer a time.",
  };
}

describe("buildPrompt", () => {
  it("fills every placeholder in the real template", () => {
    const template = loadPromptTemplate();
    expect(template).toMatch(/\{\{\w+\}\}/);
    const prompt = buildPrompt("user: Hello\nagent: Hi", scenario);
    expect(prompt).not.toMatch(/\{\{\w+\}\}/);
    expect(prompt).toContain(scenario.description);
    expect(prompt).toContain(`- ${scenario.spaFacts[0]}`);
    expect(prompt).toContain(`1. ${scenario.rubric[0].id}: ${scenario.rubric[0].description}`);
    expect(prompt).toContain("user: Hello\nagent: Hi");
  });

  it("does not re-substitute braces inside the transcript", () => {
    expect(buildPrompt("user: {{rubric}}", scenario, "T: {{transcript}}")).toBe("T: user: {{rubric}}");
  });
});

describe("scorecardValidator", () => {
  const validate = scorecardValidator(scenario);

  it("accepts a good response", () => {
    expect(validate.safeParse(goodCard()).success).toBe(true);
  });

  it("rejects a missing criterion", () => {
    const card = goodCard();
    card.criteria.pop();
    expect(validate.safeParse(card).success).toBe(false);
  });

  it("rejects a wrong id", () => {
    const card = goodCard();
    card.criteria[2].id = "accuracy";
    expect(validate.safeParse(card).success).toBe(false);
  });

  it("rejects a wrong order", () => {
    const card = goodCard();
    [card.criteria[0], card.criteria[1]] = [card.criteria[1], card.criteria[0]];
    expect(validate.safeParse(card).success).toBe(false);
  });

  it("rejects a bad result value", () => {
    const card = goodCard() as { criteria: { result: string }[] };
    card.criteria[0].result = "partial";
    expect(validate.safeParse(card).success).toBe(false);
  });

  it("rejects empty feedback, best_moment, or top_fix", () => {
    const a = goodCard();
    a.criteria[0].feedback = "  ";
    expect(validate.safeParse(a).success).toBe(false);
    expect(validate.safeParse({ ...goodCard(), top_fix: " " }).success).toBe(false);
    expect(validate.safeParse({ ...goodCard(), best_moment: "" }).success).toBe(false);
  });
});

describe("computeTotals", () => {
  it("counts pass and excludes not_applicable from applicable", () => {
    const c = (result: Criterion["result"]): Criterion => ({ id: "x", result, quote: null, feedback: "f", say_instead: null });
    expect(computeTotals([c("pass"), c("pass"), c("fail"), c("not_applicable")])).toEqual({ passed: 2, applicable: 3 });
    expect(computeTotals([c("not_applicable")])).toEqual({ passed: 0, applicable: 0 });
  });
});

describe("quote check", () => {
  it("ignores case, punctuation, and whitespace", () => {
    const transcript = "user: Thank you for calling Glow Med Spa.  This is   Randy!\nagent: Hi";
    expect(quoteAppears("thank you for calling glow med spa this is randy", transcript)).toBe(true);
    expect(quoteAppears("“Glow Med Spa, this is Randy”", transcript)).toBe(true);
    expect(quoteAppears("We offer a discount", transcript)).toBe(false);
    expect(normalizeForQuote("  It's  $13,\na unit. ")).toBe("its 13 a unit");
  });
});

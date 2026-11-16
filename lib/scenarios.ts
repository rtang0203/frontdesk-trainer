import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const RubricItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
});

const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isDefault: z.boolean().optional(),
  retellAgentIds: z.array(z.string()),
  description: z.string().min(1),
  /** Display only: the "Incoming call" slip and scorecard title. Scoring never reads it. */
  brief: z.object({ caller: z.string().min(1), about: z.string().min(1), role: z.string().min(1) }),
  /**
   * Display only: the trainee's price list. Repeats facts from spaFacts (which also carries
   * grader-only notes), so edit the two together; tests/scenarios.test.ts checks they agree.
   */
  priceList: z
    .array(z.object({ label: z.string().min(1), value: z.string().min(1), note: z.string().min(1).optional() }))
    .optional(),
  spaFacts: z.array(z.string().min(1)).min(1),
  rubric: z.array(RubricItemSchema).min(1),
});

export type RubricItem = z.infer<typeof RubricItemSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;

export const SCENARIOS_DIR = path.join(process.cwd(), "scenarios");

let cache: Scenario[] | undefined;

/** Every folder under scenarios/ with a scenario.json is one scenario. */
export function loadScenarios(): Scenario[] {
  if (cache) return cache;
  const scenarios = fs
    .readdirSync(SCENARIOS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(SCENARIOS_DIR, entry.name, "scenario.json"))
    .filter((file) => fs.existsSync(file))
    .map((file) => ScenarioSchema.parse(JSON.parse(fs.readFileSync(file, "utf8"))));
  if (scenarios.filter((s) => s.isDefault).length !== 1) {
    throw new Error("Exactly one scenario must set isDefault: true");
  }
  cache = scenarios;
  return scenarios;
}

export function getDefaultScenario(): Scenario {
  return loadScenarios().find((s) => s.isDefault)!;
}

export function getScenario(id: string): Scenario | undefined {
  return loadScenarios().find((s) => s.id === id);
}

/** Match by Retell agent id; fall back to the default scenario with a warning. */
export function matchScenario(agentId: string | null | undefined): Scenario {
  const match = agentId ? loadScenarios().find((s) => s.retellAgentIds.includes(agentId)) : undefined;
  if (match) return match;
  console.warn(`No scenario lists agent ${agentId ?? "(none)"}; using the default scenario`);
  return getDefaultScenario();
}

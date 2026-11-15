import fs from "node:fs";
import path from "node:path";
import { SCENARIOS_DIR, type Scenario } from "@/lib/scenarios";

let template: string | undefined;

export function loadPromptTemplate(): string {
  template ??= fs.readFileSync(path.join(SCENARIOS_DIR, "scoring-prompt.md"), "utf8");
  return template;
}

export function buildPrompt(transcript: string, scenario: Scenario, tmpl = loadPromptTemplate()): string {
  const values: Record<string, string> = {
    scenario_description: scenario.description,
    spa_facts: scenario.spaFacts.map((f) => `- ${f}`).join("\n"),
    rubric: scenario.rubric.map((r, i) => `${i + 1}. ${r.id}: ${r.description}`).join("\n"),
    transcript: transcript.trim(),
  };
  // Single pass so text inside a value (e.g. a transcript containing "{{x}}") is never re-substituted.
  return tmpl.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (!(key in values)) throw new Error(`Unknown placeholder ${match} in scoring prompt`);
    return values[key];
  });
}

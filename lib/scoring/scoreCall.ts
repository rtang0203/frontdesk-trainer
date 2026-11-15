import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Scenario } from "@/lib/scenarios";
import { stripNoResponseLines } from "@/lib/transcript";
import { buildPrompt } from "./prompt";
import { findMissingQuotes } from "./quoteCheck";
import { ModelScorecardSchema, computeTotals, scorecardValidator, type Scorecard } from "./schema";

export type ScoreResult = {
  scorecard: Scorecard;
  model: string;
  latencyMs: number;
};

/**
 * Budget for the whole call, SDK retries and the validation retry included.
 * Kept under the webhook route's 60 s max duration.
 */
const TOTAL_BUDGET_MS = 55_000;
const MAX_OUTPUT_TOKENS = 2000;

// JSON schema for structured outputs, generated from the zod schema.
const OUTPUT_FORMAT = (() => {
  const { type, schema } = zodOutputFormat(ModelScorecardSchema);
  return { type, schema };
})();

let defaultClient: Anthropic | undefined;
function getClient(): Anthropic {
  // Per-request timeout; the overall deadline below caps SDK retries too.
  defaultClient ??= new Anthropic({ timeout: 25_000, maxRetries: 2 });
  return defaultClient;
}

class ValidationFailure extends Error {}

export async function scoreCall(
  rawTranscript: string,
  scenario: Scenario,
  opts: { callId?: string; client?: Anthropic } = {},
): Promise<ScoreResult> {
  const model = process.env.SCORING_MODEL;
  if (!model) throw new Error("SCORING_MODEL is not set");
  const client = opts.client ?? getClient();
  const transcript = stripNoResponseLines(rawTranscript);
  const validator = scorecardValidator(scenario);
  const started = Date.now();
  const signal = AbortSignal.timeout(TOTAL_BUDGET_MS);

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildPrompt(transcript, scenario) }];
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await client.messages.create(
      {
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages,
        output_config: { format: OUTPUT_FORMAT },
      },
      { signal },
    );
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    try {
      if (response.stop_reason === "refusal") throw new ValidationFailure("The model refused to grade the call");
      if (response.stop_reason === "max_tokens") throw new ValidationFailure("The model hit max_tokens before finishing");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new ValidationFailure(`Response is not valid JSON: ${(e as Error).message}`);
      }
      const parsed = validator.safeParse(json);
      if (!parsed.success) {
        throw new ValidationFailure(
          parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
        );
      }

      const card = parsed.data;
      const missing = findMissingQuotes(card.criteria, transcript);
      if (missing.length) {
        console.warn(`[quote-check] call ${opts.callId ?? "(none)"}: quote not found in transcript for ${missing.join(", ")}`);
      }
      return {
        scorecard: { ...card, ...computeTotals(card.criteria) },
        model,
        latencyMs: Date.now() - started,
      };
    } catch (e) {
      if (!(e instanceof ValidationFailure)) throw e;
      lastError = e.message;
      if (attempt === 2) break;
      messages.push(
        { role: "assistant", content: text || "(empty response)" },
        {
          role: "user",
          content: `That response was invalid: ${lastError}\nReturn the corrected JSON only, with one entry per rubric item in rubric order.`,
        },
      );
    }
  }
  throw new Error(`Scoring failed validation twice: ${lastError}`);
}

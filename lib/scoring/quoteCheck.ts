import type { Criterion } from "./schema";

export function normalizeForQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteAppears(quote: string, transcript: string): boolean {
  return normalizeForQuote(transcript).includes(normalizeForQuote(quote));
}

/** Ids of criteria whose quote is not found in the transcript. */
export function findMissingQuotes(criteria: Criterion[], transcript: string): string[] {
  return criteria.filter((c) => c.quote !== null && !quoteAppears(c.quote, transcript)).map((c) => c.id);
}

/** The caller prompt makes the agent emit this token when asked to hold. */
export const NO_RESPONSE_TOKEN = "NO_RESPONSE_NEEDED";

export type TranscriptEntry = { role: string; content: string; [key: string]: unknown };

/** Remove agent lines whose content is exactly the hold token. Retell prefixes lines "Agent: "/"User: ". */
export function stripNoResponseLines(transcript: string): string {
  const tokenLine = new RegExp(`^agent:\\s*${NO_RESPONSE_TOKEN}$`, "i");
  return transcript
    .split("\n")
    .filter((line) => !tokenLine.test(line.trim()))
    .join("\n");
}

export function stripNoResponseEntries<T extends TranscriptEntry>(entries: T[]): T[] {
  return entries.filter((e) => !(e.role === "agent" && e.content.trim() === NO_RESPONSE_TOKEN));
}

/** Trainee turns, merging consecutive entries from the same speaker into one turn. */
export function countUserTurns(entries: TranscriptEntry[]): number {
  let turns = 0;
  let prev: string | undefined;
  for (const e of stripNoResponseEntries(entries)) {
    if (!e.content.trim()) continue;
    if (e.role === "user" && prev !== "user") turns++;
    prev = e.role;
  }
  return turns;
}

export const MIN_DURATION_MS = 20_000;
export const MIN_USER_TURNS = 2;

export function isTooShort(input: {
  transcript: string | null | undefined;
  transcriptObject: TranscriptEntry[] | null | undefined;
  durationMs: number | null | undefined;
}): boolean {
  if (!input.transcript || !stripNoResponseLines(input.transcript).trim()) return true;
  if (input.durationMs == null || input.durationMs < MIN_DURATION_MS) return true;
  return countUserTurns(input.transcriptObject ?? []) < MIN_USER_TURNS;
}

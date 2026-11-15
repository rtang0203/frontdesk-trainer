/** 132474 -> "2:12" */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export type TranscriptLine = { speaker: "Caller" | "You"; text: string };

/**
 * Parse Retell's transcript string ("Agent: ..." / "User: ...", either case) into lines
 * labelled for the trainee. Unprefixed lines continue the previous turn.
 */
export function parseTranscript(transcript: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const raw of transcript.split("\n")) {
    const m = /^(agent|user):\s*(.*)$/i.exec(raw.trim());
    if (m) {
      lines.push({ speaker: m[1].toLowerCase() === "agent" ? "Caller" : "You", text: m[2] });
    } else if (raw.trim() && lines.length) {
      lines[lines.length - 1].text += ` ${raw.trim()}`;
    }
  }
  return lines;
}

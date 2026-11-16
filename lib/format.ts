/** 132474 -> "2 min 12 s" */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "None";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, "0")} s`;
}

/** 222000 -> "3 minutes 42 seconds" */
export function formatDurationWords(ms: number | null | undefined): string {
  if (ms == null) return "None";
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const parts = [];
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  if (seconds || !minutes) parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}

/** "Today at 1:02 PM", or "Nov 14 at 4:15 PM" for other days. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day =
    date.toDateString() === new Date().toDateString()
      ? "Today"
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day} at ${time}`;
}

/** "Monday, November 16 at 1:02 PM" */
export function formatLongDateTime(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return `${day} at ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
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

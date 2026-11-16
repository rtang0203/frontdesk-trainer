import type { CallRow, CallStatus, CallSummaryRow } from "@/lib/calls";
import { getScenario } from "@/lib/scenarios";
import type { Scorecard } from "@/lib/scoring/schema";

export const DIALING_STALE_MS = 2 * 60_000;
export const SCORING_STALE_MS = 60_000;
export const IN_PROGRESS_STALE_MS = 15 * 60_000;

type StatusFields = Pick<CallRow, "status" | "updated_at" | "scoring_error">;

/** Read-time stale rules. The stored row is never changed. */
export function applyStale<T extends StatusFields>(row: T, now: Date): T {
  const age = now.getTime() - new Date(row.updated_at).getTime();
  if (row.status === "dialing" && age > DIALING_STALE_MS) return { ...row, status: "no_answer" };
  if (row.status === "scoring" && age > SCORING_STALE_MS) {
    return { ...row, status: "failed", scoring_error: "Scoring timed out" };
  }
  if (row.status === "in_progress" && age > IN_PROGRESS_STALE_MS) {
    return { ...row, status: "failed", scoring_error: "Call result never arrived" };
  }
  return row;
}

/** Active means dialing, in_progress, or scoring after the stale rules are applied. */
export function isActive(row: StatusFields, now: Date): boolean {
  const { status } = applyStale(row, now);
  return status === "dialing" || status === "in_progress" || status === "scoring";
}

/** What the API returns for a call. No raw_payload, and stale rules applied. */
export type CallView = {
  id: string;
  status: CallStatus;
  call_type: string | null;
  direction: string | null;
  from_number: string | null;
  to_number: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  created_at: string;
  scenario: { id: string; name: string; caller: string | null; labels: Record<string, string> };
  scorecard: Scorecard | null;
  passed: number | null;
  applicable: number | null;
  scoring_error: string | null;
  transcript?: string | null;
};

export function toView(row: CallSummaryRow | CallRow, now: Date, withTranscript = false): CallView {
  const r = applyStale(row, now);
  const scenario = getScenario(r.scenario_id);
  const view: CallView = {
    id: r.id,
    status: r.status,
    call_type: r.call_type,
    direction: r.direction,
    from_number: r.from_number,
    to_number: r.to_number,
    started_at: r.started_at,
    ended_at: r.ended_at,
    duration_ms: r.duration_ms,
    created_at: r.created_at,
    scenario: {
      id: r.scenario_id,
      name: scenario?.name ?? r.scenario_id,
      caller: scenario?.brief.caller ?? null,
      labels: Object.fromEntries((scenario?.rubric ?? []).map((item) => [item.id, item.label])),
    },
    scorecard: r.scorecard,
    passed: r.passed,
    applicable: r.applicable,
    scoring_error: r.scoring_error,
  };
  if (withTranscript) view.transcript = "transcript" in r ? r.transcript : null;
  return view;
}

/**
 * The call the live page should show: the newest that was created at or after `since`,
 * or is active (whatever its age). `candidates` must be newest first.
 */
export function pickLatest<T extends CallSummaryRow>(candidates: T[], since: Date, now: Date): T | null {
  return (
    candidates.find((row) => new Date(row.created_at).getTime() >= since.getTime() || isActive(row, now)) ?? null
  );
}

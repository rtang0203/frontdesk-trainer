"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RecordedTag } from "@/components/slip";
import type { CallView } from "@/lib/callView";
import { formatDateTime, formatDuration } from "@/lib/format";

/** Why a call has no score. */
const NO_SCORE: Record<Exclude<CallView["status"], "scored">, string> = {
  dialing: "Calling",
  in_progress: "In progress",
  scoring: "Scoring",
  too_short: "Too short to score",
  no_answer: "No answer",
  failed: "Couldn't score",
};

export default function CallsPage() {
  const [calls, setCalls] = useState<CallView[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/calls?limit=20", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { calls: CallView[] }) => setCalls(d.calls))
      .catch(() => setError(true));
  }, []);

  return (
    <div>
      <h1 className="type-start">Call history</h1>
      <div className="mt-8">
        {error && <p className="font-semibold text-fail">Couldn&apos;t load calls.</p>}
        {!calls && !error && <p className="text-muted">Loading…</p>}
        {calls?.length === 0 && <p className="text-muted">No calls yet.</p>}
        {calls && calls.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b-2 border-ink text-sm">
                <tr>
                  <th className="py-3 pr-6 font-semibold">When</th>
                  <th className="py-3 pr-6 font-semibold">Scenario</th>
                  <th className="py-3 pr-6 font-semibold">Length</th>
                  <th className="py-3 pr-6 font-semibold">Score</th>
                  <th className="py-3 font-semibold">Slip</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b border-rule">
                    <td className="py-3.5 pr-6 whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                    <td className="py-3.5 pr-6 whitespace-nowrap">
                      {c.scenario.name}
                      {c.call_type === "replay" && (
                        <span className="ml-3">
                          <RecordedTag />
                        </span>
                      )}
                    </td>
                    <td className={`py-3.5 pr-6 whitespace-nowrap tabular-nums ${c.duration_ms == null ? "text-muted" : ""}`}>
                      {formatDuration(c.duration_ms)}
                    </td>
                    <td className="py-3.5 pr-6 whitespace-nowrap">
                      {c.status === "scored" ? (
                        <span className="font-display text-2xl font-bold tabular-nums">
                          {c.passed} / {c.applicable}
                        </span>
                      ) : (
                        <span className="text-muted">{NO_SCORE[c.status]}</span>
                      )}
                    </td>
                    <td className="py-3.5 whitespace-nowrap">
                      {c.scorecard && (
                        <Link href={`/calls/${c.id}`} className="font-semibold underline underline-offset-4">
                          Open slip
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

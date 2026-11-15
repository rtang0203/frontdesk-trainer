"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CallView } from "@/lib/callView";
import { formatDateTime, formatDuration } from "@/lib/format";

const STATUS_LABEL: Record<CallView["status"], string> = {
  dialing: "Calling",
  in_progress: "In progress",
  scoring: "Scoring",
  scored: "Scored",
  too_short: "Too short",
  no_answer: "No answer",
  failed: "Failed",
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
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Call history</h1>
      {error && <p className="text-lg text-red-700">Couldn&apos;t load calls.</p>}
      {!calls && !error && <p className="text-lg text-stone-500">Loading…</p>}
      {calls?.length === 0 && <p className="text-lg text-stone-600">No calls yet.</p>}
      {calls && calls.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-stone-200">
          <table className="w-full text-left text-base">
            <thead className="border-b border-stone-200 text-sm uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-3 py-3 font-semibold sm:px-4">When</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Scenario</th>
                <th className="hidden px-4 py-3 font-semibold sm:table-cell">Length</th>
                <th className="px-3 py-3 font-semibold sm:px-4">Score</th>
                <th className="px-3 py-3 font-semibold sm:px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {calls.map((c) => (
                <tr key={c.id} className="relative hover:bg-stone-50">
                  <td className="px-3 py-3 sm:px-4">
                    <Link href={`/calls/${c.id}`} className="after:absolute after:inset-0 sm:whitespace-nowrap">
                      {formatDateTime(c.created_at)}
                    </Link>
                    {/* On phones, scenario and length move under the date so score and status fit. */}
                    <p className="mt-0.5 text-sm text-stone-500 sm:hidden">
                      {c.scenario.name} · {formatDuration(c.duration_ms)}
                      {c.call_type === "replay" && <ReplayTag />}
                    </p>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {c.scenario.name}
                    {c.call_type === "replay" && <ReplayTag />}
                  </td>
                  <td className="hidden px-4 py-3 tabular-nums sm:table-cell">{formatDuration(c.duration_ms)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums sm:px-4">
                    {c.status === "scored" ? `${c.passed} / ${c.applicable}` : "—"}
                  </td>
                  <td className="px-3 py-3 sm:px-4">{STATUS_LABEL[c.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReplayTag() {
  return (
    <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-semibold uppercase text-stone-700">
      Replay
    </span>
  );
}

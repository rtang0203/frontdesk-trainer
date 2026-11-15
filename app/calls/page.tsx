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
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Scenario</th>
                <th className="px-4 py-3 font-semibold">Length</th>
                <th className="px-4 py-3 font-semibold">Score</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {calls.map((c) => (
                <tr key={c.id} className="relative hover:bg-stone-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/calls/${c.id}`} className="after:absolute after:inset-0">
                      {formatDateTime(c.created_at)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {c.scenario.name}
                    {c.call_type === "replay" && (
                      <span className="ml-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-semibold uppercase text-stone-700">
                        Replay
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatDuration(c.duration_ms)}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums">
                    {c.status === "scored" ? `${c.passed} / ${c.applicable}` : "—"}
                  </td>
                  <td className="px-4 py-3">{STATUS_LABEL[c.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

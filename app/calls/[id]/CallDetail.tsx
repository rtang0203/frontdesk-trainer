"use client";

import { useEffect, useState } from "react";
import { Scorecard, Transcript } from "@/components/Scorecard";
import type { CallView } from "@/lib/callView";
import { formatDateTime, formatDuration } from "@/lib/format";

const STATUS_MESSAGE: Partial<Record<CallView["status"], string>> = {
  dialing: "This call hasn't been answered yet.",
  in_progress: "This call is still in progress.",
  scoring: "This call is being scored.",
  too_short: "This call was too short to score.",
  no_answer: "This call wasn't answered.",
  failed: "We couldn't score this call.",
};

export function CallDetail({ id }: { id: string }) {
  const [call, setCall] = useState<CallView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/calls/${id}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) throw new Error("Call not found.");
        if (!r.ok) throw new Error("Couldn't load this call.");
        return r.json();
      })
      .then((d: { call: CallView }) => setCall(d.call))
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-lg text-red-700">{error}</p>;
  if (!call) return <p className="text-lg text-stone-500">Loading…</p>;

  return (
    <div className="space-y-6">
      {call.call_type === "replay" && (
        <span className="inline-block rounded-full bg-stone-200 px-3 py-1 text-sm font-semibold uppercase tracking-wider text-stone-700">
          Recorded call
        </span>
      )}
      {call.scorecard && call.status === "scored" ? (
        <Scorecard call={call} collapseTranscript={false} />
      ) : (
        <>
          <header className="space-y-1">
            <h1 className="text-3xl font-semibold">{STATUS_MESSAGE[call.status]}</h1>
            <p className="text-lg text-stone-600">
              {call.scenario.name} · {formatDateTime(call.created_at)} · {formatDuration(call.duration_ms)}
            </p>
          </header>
          {call.transcript && (
            <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
              <h2 className="mb-4 text-lg font-semibold">Transcript</h2>
              <Transcript transcript={call.transcript} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

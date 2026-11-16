"use client";

import { useEffect, useState } from "react";
import { Scorecard, Transcript } from "@/components/Scorecard";
import { RecordedTag } from "@/components/slip";
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

  if (error) return <p className="font-semibold text-fail">{error}</p>;
  if (!call) return <p className="text-muted">Loading…</p>;

  if (call.scorecard && call.status === "scored") return <Scorecard call={call} collapseTranscript={false} />;

  return (
    <div className="max-w-[640px]">
      {call.call_type === "replay" && (
        <div className="mb-5">
          <RecordedTag />
        </div>
      )}
      <h1 className="type-title">{STATUS_MESSAGE[call.status]}</h1>
      <p className="mt-3 text-muted">
        {call.scenario.name} · {formatDateTime(call.created_at)} · {formatDuration(call.duration_ms)}
      </p>
      {call.transcript && (
        <section className="mt-10">
          <h2 className="border-b-2 border-ink pb-2 font-display text-[22px] font-bold">Transcript</h2>
          <div className="mt-4">
            <Transcript transcript={call.transcript} />
          </div>
        </section>
      )}
    </div>
  );
}

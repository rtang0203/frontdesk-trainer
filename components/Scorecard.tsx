import type { CallView } from "@/lib/callView";
import { formatDateTime, formatDuration, parseTranscript } from "@/lib/format";
import type { CriterionResult } from "@/lib/scoring/schema";

const BADGE: Record<CriterionResult, { label: string; icon: string; className: string }> = {
  pass: { label: "Pass", icon: "✓", className: "bg-emerald-700 text-white" },
  fail: { label: "Fail", icon: "✗", className: "bg-red-700 text-white" },
  not_applicable: { label: "N/A", icon: "–", className: "bg-stone-200 text-stone-700" },
};

export function ResultBadge({ result }: { result: CriterionResult }) {
  const b = BADGE[result];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-base font-semibold ${b.className}`}>
      <span aria-hidden>{b.icon}</span>
      {b.label}
    </span>
  );
}

export function Transcript({ transcript }: { transcript: string }) {
  return (
    <ol className="space-y-3">
      {parseTranscript(transcript).map((line, i) => (
        <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-3 text-base leading-relaxed">
          <span className={`font-semibold ${line.speaker === "You" ? "text-stone-900" : "text-stone-500"}`}>
            {line.speaker}
          </span>
          <span className={line.speaker === "You" ? "text-stone-900" : "text-stone-600"}>{line.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** The scorecard: score, top fix, best moment, criteria, then the transcript. */
export function Scorecard({ call, collapseTranscript }: { call: CallView; collapseTranscript: boolean }) {
  const card = call.scorecard;
  if (!card) return null;
  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <p className="text-7xl font-bold tracking-tight tabular-nums sm:text-8xl" aria-label={`Score ${card.passed} of ${card.applicable}`}>
          {card.passed} / {card.applicable}
        </p>
        <div className="pb-2 text-lg text-stone-600">
          <p className="font-semibold text-stone-900">{call.scenario.name}</p>
          <p>
            {formatDateTime(call.created_at)} · {formatDuration(call.duration_ms)}
          </p>
        </div>
      </header>

      <section className="rounded-xl border-l-8 border-amber-500 bg-amber-50 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-amber-900">Top fix</h2>
        <p className="mt-2 text-xl font-medium leading-snug text-stone-900 sm:text-2xl">{card.top_fix}</p>
      </section>

      <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-800">Best moment</h2>
        <p className="mt-2 text-lg leading-snug">{card.best_moment}</p>
      </section>

      <ul className="divide-y divide-stone-200 rounded-xl bg-white ring-1 ring-stone-200">
        {card.criteria.map((c) => (
          <li key={c.id} className="space-y-2 p-5">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-semibold">{call.scenario.labels[c.id] ?? c.id}</h3>
              <ResultBadge result={c.result} />
            </div>
            {c.quote && (
              <blockquote className="border-l-4 border-stone-300 pl-3 text-lg italic text-stone-700">“{c.quote}”</blockquote>
            )}
            <p className="text-lg leading-snug">{c.feedback}</p>
            {c.say_instead && (
              <p className="text-lg leading-snug">
                <span className="font-semibold">Try saying: </span>“{c.say_instead}”
              </p>
            )}
          </li>
        ))}
      </ul>

      {call.transcript && (
        <details open={!collapseTranscript} className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
          <summary className="cursor-pointer text-lg font-semibold">Transcript</summary>
          <div className="mt-4">
            <Transcript transcript={call.transcript} />
          </div>
        </details>
      )}
    </article>
  );
}

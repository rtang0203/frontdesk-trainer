import { RecordedTag, SlipRows } from "@/components/slip";
import type { CallView } from "@/lib/callView";
import { formatDurationWords, formatLongDateTime, parseTranscript } from "@/lib/format";
import type { CriterionResult } from "@/lib/scoring/schema";

// Hand-drawn marks. The tick and cross overflow their box like a pen mark.
const RESULT: Record<CriterionResult, { word: string; color: string; mark: React.ReactNode }> = {
  pass: {
    word: "Pass",
    color: "text-pass",
    mark: (
      <svg viewBox="0 0 40 40" width="44" height="44" className="absolute -top-3.5 -left-0.75 overflow-visible">
        <path
          d="M7 22c3 2.5 5.5 5.5 7.5 9.5C19 21 25 12.5 35 4"
          fill="none"
          className="stroke-pass"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  fail: {
    word: "Fail",
    color: "text-fail",
    mark: (
      <svg viewBox="0 0 40 40" width="38" height="38" className="absolute -top-1.5 -left-1.5 overflow-visible">
        <path
          d="M8 9c8 6 15 13 24 22M31 8C23 15 15 23 8 32"
          fill="none"
          className="stroke-fail"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  not_applicable: {
    word: "Didn't apply",
    color: "text-ink",
    mark: (
      <svg viewBox="0 0 30 30" width="26" height="26" className="absolute top-0 left-0">
        <path d="M8 13h10" fill="none" className="stroke-ink" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
};

export function Transcript({ transcript }: { transcript: string }) {
  return (
    <ol className="space-y-3">
      {parseTranscript(transcript).map((line, i) => (
        <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-3">
          <span className={`font-semibold ${line.speaker === "You" ? "text-ink" : "text-muted"}`}>{line.speaker}</span>
          <span>{line.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** The scorecard slip: header and score, top fix, best moment, criteria, then the transcript. */
export function Scorecard({ call, collapseTranscript }: { call: CallView; collapseTranscript: boolean }) {
  const card = call.scorecard;
  if (!card) return null;
  return (
    <article className="max-w-[860px] rounded bg-slip p-6 sm:px-11 sm:py-10">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 flex-1 basis-80">
          {call.call_type === "replay" && (
            <p className="mb-3">
              <RecordedTag />
            </p>
          )}
          <h1 className="type-title">{call.scenario.caller ? `Your call with ${call.scenario.caller}` : "Your call"}</h1>
          <div className="mt-4">
            <SlipRows
              rows={[
                ["Scenario", call.scenario.name],
                ["When", formatLongDateTime(call.created_at)],
                ["Length", formatDurationWords(call.duration_ms)],
              ]}
            />
          </div>
        </div>
        <div className="rounded border-2 border-ink bg-page px-7 py-4 text-center">
          <p className="text-sm font-semibold">Score</p>
          <p className="type-score mt-1 whitespace-nowrap tabular-nums" aria-label={`${card.passed} of ${card.applicable}`}>
            {card.passed} / {card.applicable}
          </p>
          <p className="mt-2 space-x-2 text-sm font-bold">
            <span className="text-pass">{card.passed} passed</span>
            <span className="text-fail">{card.applicable - card.passed} failed</span>
          </p>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-[15px] font-bold">Top fix</h2>
        <p className="mt-2 text-[25px] leading-normal font-semibold">
          <mark className="box-decoration-clone bg-highlight px-1.5 py-0.75 text-ink">{card.top_fix}</mark>
        </p>
      </section>

      <section className="mt-6 border-b-2 border-ink pb-6">
        <h2 className="text-[15px] font-bold">Best moment</h2>
        <p className="mt-1 text-lg">{card.best_moment}</p>
      </section>

      <ul>
        {card.criteria.map((c) => {
          const r = RESULT[c.result];
          return (
            <li key={c.id} className="flex gap-4 border-b border-slip-rule py-5">
              <span aria-hidden className="relative mt-0.5 size-7.5 shrink-0 rounded border-2 border-ink bg-page">
                {r.mark}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-[23px] leading-tight font-bold">{call.scenario.labels[c.id] ?? c.id}</h3>
                  <span className={`shrink-0 text-base font-bold ${r.color}`}>{r.word}</span>
                </div>
                {c.quote && <p className="italic">“{c.quote}”</p>}
                <p>{c.feedback}</p>
                {c.say_instead && (
                  <p>
                    <span className="font-bold">Try saying:</span> “{c.say_instead}”
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {call.transcript && (
        <details open={!collapseTranscript} className="pt-5">
          <summary className="w-fit cursor-pointer list-none font-semibold underline underline-offset-4 [&::-webkit-details-marker]:hidden">
            Read the full transcript
          </summary>
          <div className="mt-4">
            <Transcript transcript={call.transcript} />
          </div>
        </details>
      )}
    </article>
  );
}

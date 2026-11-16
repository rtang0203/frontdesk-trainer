"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RESET_LIVE_EVENT } from "@/components/HomeLink";
import { Scorecard } from "@/components/Scorecard";
import { RecordedTag, SlipRows } from "@/components/slip";
import type { CallView } from "@/lib/callView";
import { formatUsPhone } from "@/lib/phone";
import type { Scenario } from "@/lib/scenarios";
import { MIN_DURATION_MS } from "@/lib/transcript";

const POLL_MS = 2000;
const DEMO_NUMBER = process.env.NEXT_PUBLIC_DEMO_PHONE_NUMBER ?? "";
const ACTIVE = new Set(["dialing", "in_progress", "scoring"]);

type PriceItem = NonNullable<Scenario["priceList"]>[number];

/** What the trainee sees before and during a call; comes from the scenario config. */
export type Briefing = { brief: Scenario["brief"]; priceList: PriceItem[]; rubricLabels: string[] };

export function LiveView({ briefing }: { briefing: Briefing }) {
  const [call, setCall] = useState<CallView | null>(null);
  const [detail, setDetail] = useState<CallView | null>(null);
  const sinceRef = useRef<string | null>(null);
  // Bumped on reset so a poll already in flight can't bring back the old call.
  const generationRef = useRef(0);

  const poll = useCallback(async () => {
    // The first poll has no `since`: it anchors the load time to the server clock,
    // and only an active call from before the load is shown.
    const generation = generationRef.current;
    const since = sinceRef.current;
    const res = await fetch(since ? `/api/calls/latest?since=${encodeURIComponent(since)}` : "/api/calls/latest", {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data: { call: CallView | null; serverTime: string } = await res.json();
    if (generation !== generationRef.current) return;
    if (!since) {
      const active = data.call && ACTIVE.has(data.call.status) ? data.call : null;
      // Resuming an active call: anchor at its creation so it stays on screen once it
      // finishes (until a newer call appears). Otherwise anchor at the server's clock.
      sinceRef.current = active ? active.created_at : data.serverTime;
      setCall(active);
    } else {
      setCall(data.call);
    }
  }, []);

  // Start clean, like a fresh load: finished calls clear, and an active call comes back
  // on the first poll. Runs on mount, whenever Next shows this page again after
  // navigating away (it keeps visited pages alive with their state), and when the
  // header logo is clicked while already here.
  const reset = useCallback(() => {
    generationRef.current++;
    sinceRef.current = null;
    setCall(null);
    setDetail(null);
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let run = 0;
    const loop = async (myRun: number) => {
      try {
        await poll();
      } catch {
        // Network blip: keep showing the last state and try again.
      }
      // A restart while this poll was in flight owns the schedule now.
      if (!stopped && myRun === run) timer = window.setTimeout(() => loop(myRun), POLL_MS);
    };
    const restart = () => {
      window.clearTimeout(timer);
      reset();
      loop(++run);
    };
    restart();
    window.addEventListener(RESET_LIVE_EVENT, restart);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener(RESET_LIVE_EVENT, restart);
    };
  }, [poll, reset]);

  // Finished calls: load the transcript once for the scorecard / failure link.
  const callId = call?.id;
  const status = call?.status;
  useEffect(() => {
    if (!callId || (status !== "scored" && status !== "failed")) return;
    let cancelled = false;
    fetch(`/api/calls/${callId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { call: CallView } | null) => {
        if (!cancelled && d) setDetail(d.call);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [callId, status]);

  const active = !!call && ACTIVE.has(call.status);
  const shown = call && detail?.id === call.id && detail.status === call.status ? detail : call;
  const replayTag = call?.call_type === "replay" ? <RecordedTag /> : null;
  const priceList = <PriceList items={briefing.priceList} className="mx-auto mt-24 max-w-[640px]" />;

  if (!call) {
    return (
      <div className="flex flex-wrap items-start gap-x-14 gap-y-12">
        <div className="min-w-0 flex-1 basis-[400px]">
          <h1 className="type-start">Enter your number and we&apos;ll call you</h1>
          <CallMe className="mt-8" label="Your mobile number" button="Call me" hint disabled={false} onStarted={poll} />
          <PriceList items={briefing.priceList} className="mt-10" />
        </div>
        <IncomingCall briefing={briefing} />
      </div>
    );
  }

  switch (call.status) {
    case "dialing":
      return (
        <div>
          <Status tag={replayTag} dot="bg-dot-calling" title="Calling you now." subtitle="Answer as the front desk." />
          {priceList}
        </div>
      );
    case "in_progress":
      return (
        <div>
          <Status tag={replayTag} dot="bg-dot-live" title="Call in progress." subtitle="Hang up when you're done." />
          {priceList}
        </div>
      );
    case "scoring":
      return <Status tag={replayTag} dot="bg-leader" title="Scoring your call." subtitle="This takes about 10 seconds." />;
    case "scored":
      return (
        <div>
          {shown?.scorecard ? (
            <Scorecard call={shown} collapseTranscript />
          ) : (
            <Status tag={replayTag} dot="bg-leader" title="Scoring your call." subtitle="This takes about 10 seconds." />
          )}
          <CallMe className="mt-10" label="Practice again" button="Call me" disabled={active} onStarted={poll} />
        </div>
      );
    case "too_short":
      return (
        <Notice tag={replayTag} title="Too short to score" disabled={active} onStarted={poll}>
          <p className="text-[22px]">That call ended before there was enough to grade.</p>
        </Notice>
      );
    case "no_answer": {
      const lastFour = call.direction === "outbound" ? call.to_number?.replace(/\D/g, "").slice(-4) : undefined;
      return (
        <Notice tag={replayTag} title="No answer" disabled={active} onStarted={poll}>
          {lastFour?.length === 4 && (
            <p className="text-[22px]">We called the number ending in {lastFour} and nobody picked up.</p>
          )}
          <p className="text-[15px] text-muted">
            Some phones silence unknown callers or mark them as spam. Check your recent calls
            {DEMO_NUMBER && ` for ${formatUsPhone(DEMO_NUMBER)}`}, then try again.
          </p>
        </Notice>
      );
    }
    case "failed":
      return (
        <Notice tag={replayTag} title="We couldn't score that call" disabled={active} onStarted={poll}>
          <p className="text-[22px]">
            Something went wrong on our side.{shown?.transcript && " Your transcript is saved."}
          </p>
          {shown?.transcript && (
            <Link href={`/calls/${call.id}`} className="inline-block font-semibold underline underline-offset-4">
              Read the transcript
            </Link>
          )}
        </Notice>
      );
  }
}

// Kept for the page session only (module state survives client navigation, not reloads).
let lastPhone = "";

function CallMe({
  label,
  button,
  hint = false,
  disabled,
  className,
  onStarted,
}: {
  label: string;
  button: string;
  hint?: boolean;
  disabled: boolean;
  className?: string;
  onStarted: () => Promise<void>;
}) {
  const [phone, setPhone] = useState(lastPhone);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reused only when the same submission is retried after a network failure.
  const retryKey = useRef<{ phone: string; key: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || disabled) return;
    setPending(true);
    setError(null);
    lastPhone = phone;
    const key = retryKey.current?.phone === phone ? retryKey.current.key : crypto.randomUUID();
    retryKey.current = { phone, key };
    try {
      const res = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, idempotencyKey: key }),
      });
      retryKey.current = null;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      await onStarted();
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className={className}>
      <label className="block text-[15px] font-semibold" htmlFor="phone">
        {label}
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 555-1234"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="h-14 w-full min-w-0 rounded-md border-2 border-ink bg-page px-4 text-xl placeholder:text-muted sm:max-w-72"
          required
        />
        <button
          type="submit"
          disabled={pending || disabled}
          className="h-14 shrink-0 cursor-pointer rounded-md bg-ink px-7.5 text-[19px] font-semibold text-page disabled:cursor-not-allowed disabled:bg-muted"
        >
          {pending ? "Calling…" : button}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[15px] font-semibold text-fail">
          {error}
        </p>
      )}
      {hint && <p className="mt-3 text-[15px] text-muted">Enter your own number. We&apos;ll call it once for a practice call.</p>}
      {DEMO_NUMBER && (
        <p className="mt-4">
          Or call <span className="font-bold">{formatUsPhone(DEMO_NUMBER)}</span> yourself.
        </p>
      )}
    </form>
  );
}

/** The waiting states: blinking dot, headline, one line under it. */
function Status({ title, subtitle, dot, tag }: { title: string; subtitle: string; dot: string; tag: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center" aria-live="polite">
      {tag && <div className="mb-6">{tag}</div>}
      <span aria-hidden className={`animate-blink size-5.5 rounded-full ${dot}`} />
      <h1 className="type-wait mt-10">{title}</h1>
      <p className="mt-5 text-[28px] leading-tight text-muted">{subtitle}</p>
    </div>
  );
}

/** No answer, too short, and failed: headline, a sentence or two, then the form again. */
function Notice({
  tag,
  title,
  children,
  disabled,
  onStarted,
}: {
  tag: React.ReactNode;
  title: string;
  children: React.ReactNode;
  disabled: boolean;
  onStarted: () => Promise<void>;
}) {
  return (
    <div className="max-w-[640px]">
      {tag && <div className="mb-5">{tag}</div>}
      <h1 className="type-notice">{title}</h1>
      <div className="mt-5 space-y-4">{children}</div>
      <CallMe className="mt-8" label="Your mobile number" button="Call me again" disabled={disabled} onStarted={onStarted} />
    </div>
  );
}

/** The "Incoming call" slip on the start page: who's calling and what gets scored. */
function IncomingCall({ briefing }: { briefing: Briefing }) {
  const { brief, rubricLabels } = briefing;
  return (
    <aside className="min-w-0 flex-1 basis-[360px] rounded bg-slip p-8">
      <h2 className="font-display text-[30px] leading-tight font-bold">Incoming call</h2>
      <div className="mt-5">
        <SlipRows
          rows={[
            ["Caller", brief.caller],
            ["Calling about", brief.about],
            ["You are", brief.role],
            ["How long", `Talk for at least ${MIN_DURATION_MS / 1000} seconds, then hang up`],
          ]}
        />
      </div>
      <h3 className="mt-7 text-[15px] font-bold">You&apos;ll be scored on</h3>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
        {rubricLabels.map((label) => (
          <li key={label} className="flex gap-2.5 leading-snug">
            <span aria-hidden className="mt-0.5 size-4 shrink-0 rounded-[3px] border-2 border-ink bg-page" />
            {label}
          </li>
        ))}
      </ul>
      <p className="mt-7 text-[15px] text-muted">Your marked slip shows up here about 10 seconds after you hang up.</p>
    </aside>
  );
}

/** The spa's prices, with dotted leaders. Kept on screen during the call. */
function PriceList({ items, className }: { items: PriceItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <section className={className}>
      <h2 className="border-b-2 border-ink pb-2 font-display text-[22px] font-bold">Price list</h2>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={item.label}>
            <div className="flex items-baseline gap-2">
              <span>{item.label}</span>
              <span aria-hidden className="min-w-4 flex-1 border-b-2 border-dotted border-leader" />
              <span className="text-right font-bold">{item.value}</span>
            </div>
            {item.note && <p className="text-[15px] text-muted">{item.note}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

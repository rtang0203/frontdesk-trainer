"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RESET_LIVE_EVENT } from "@/components/HomeLink";
import { Scorecard } from "@/components/Scorecard";
import type { CallView } from "@/lib/callView";
import { formatUsPhone } from "@/lib/phone";
import { MIN_DURATION_MS } from "@/lib/transcript";

const POLL_MS = 2000;
const DEMO_NUMBER = process.env.NEXT_PUBLIC_DEMO_PHONE_NUMBER ?? "";
const ACTIVE = new Set(["dialing", "in_progress", "scoring"]);

/** What the trainee sees before and during a call; comes from the scenario config. */
export type Briefing = { text: string; facts: string[] };

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

  if (!call) {
    return (
      <div className="space-y-10">
        <CallMe heading="Enter your number and we'll call you" disabled={false} onStarted={poll} />
        <Instructions briefing={briefing} />
      </div>
    );
  }

  switch (call.status) {
    case "dialing":
      return (
        <div className="space-y-8">
          <Status tag={replayTag} title="Calling you now." subtitle="Answer as the front desk." indicator={<Pulse />} />
          <CheatSheet facts={briefing.facts} />
        </div>
      );
    case "in_progress":
      return (
        <div className="space-y-8">
          <Status tag={replayTag} title="Call in progress" indicator={<Pulse live />} />
          <CheatSheet facts={briefing.facts} />
        </div>
      );
    case "scoring":
      return <Status tag={replayTag} title="Scoring your call" indicator={<Progress />} />;
    case "scored":
      return (
        <div className="space-y-10">
          {replayTag}
          {shown?.scorecard ? <Scorecard call={shown} collapseTranscript /> : <Progress />}
          <footer className="space-y-8 border-t border-stone-200 pt-8">
            <CallMe heading="Practice again" small disabled={active} onStarted={poll} />
            <CheatSheet facts={briefing.facts} />
          </footer>
        </div>
      );
    case "too_short":
      return (
        <div className="space-y-8">
          {replayTag}
          <Notice>That call was too short to score. Try again.</Notice>
          <CallMe heading="Call me again" disabled={active} onStarted={poll} />
          <Instructions briefing={briefing} />
        </div>
      );
    case "no_answer":
      return (
        <div className="space-y-8">
          {replayTag}
          <Notice>No answer. Check your phone and try again.</Notice>
          <CallMe heading="Call me again" disabled={active} onStarted={poll} />
          <Instructions briefing={briefing} />
        </div>
      );
    case "failed":
      return (
        <div className="space-y-8">
          {replayTag}
          <Notice>We couldn&apos;t score that call.</Notice>
          {shown?.transcript && (
            <Link href={`/calls/${call.id}`} className="inline-block text-lg font-medium underline underline-offset-4">
              View the transcript
            </Link>
          )}
          <CallMe heading="Call me again" disabled={active} onStarted={poll} />
          <Instructions briefing={briefing} />
        </div>
      );
  }
}

// Kept for the page session only (module state survives client navigation, not reloads).
let lastPhone = "";

function CallMe({
  heading,
  disabled,
  small = false,
  onStarted,
}: {
  heading: string;
  disabled: boolean;
  small?: boolean;
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
    <form onSubmit={submit} className={small ? "space-y-3" : "space-y-4"}>
      <h1 className={small ? "text-2xl font-semibold" : "text-3xl font-semibold tracking-tight sm:text-4xl"}>{heading}</h1>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="phone">
          Your phone number
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 555-1234"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-xl outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/20 sm:max-w-xs"
          required
        />
        <button
          type="submit"
          disabled={pending || disabled}
          className="rounded-lg bg-stone-900 px-6 py-3 text-xl font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {pending ? "Calling…" : "Call me"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-lg font-medium text-red-700">
          {error}
        </p>
      )}
      <p className="text-base text-stone-600">Enter your own number. We&apos;ll call it once for a practice call.</p>
      {DEMO_NUMBER && (
        <p className="text-sm text-stone-500">
          Or call <span className="font-semibold text-stone-700">{formatUsPhone(DEMO_NUMBER)}</span>
        </p>
      )}
    </form>
  );
}

function Status({
  title,
  subtitle,
  indicator,
  tag,
}: {
  title: string;
  subtitle?: string;
  indicator: React.ReactNode;
  tag: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-6 text-center" aria-live="polite">
      {tag}
      {indicator}
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      {subtitle && <p className="text-2xl text-stone-600">{subtitle}</p>}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="text-2xl font-semibold sm:text-3xl">{children}</p>;
}

function Instructions({ briefing }: { briefing: Briefing }) {
  const steps = [
    DEMO_NUMBER
      ? `Enter your own number and press Call me. Your phone will ring from ${formatUsPhone(DEMO_NUMBER)}.`
      : "Enter your own number and press Call me.",
    `${briefing.text} Answer like you would at work, and stay in character.`,
    `Talk for at least ${MIN_DURATION_MS / 1000} seconds, then hang up. Your scorecard shows up here about 10 seconds later.`,
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500">How it works</h2>
        <ol className="mt-3 space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-base leading-snug">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>
      <CheatSheet facts={briefing.facts} />
    </div>
  );
}

/** The spa facts the trainee is expected to know, kept on screen during the call. */
function CheatSheet({ facts }: { facts: string[] }) {
  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
      <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500">Spa cheat sheet</h2>
      <ul className="mt-3 space-y-2">
        {facts.map((fact) => (
          <li key={fact} className="flex gap-2 text-base leading-snug">
            <span aria-hidden className="text-stone-400">•</span>
            <span>{fact}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecordedTag() {
  return (
    <span className="inline-block rounded-full bg-stone-200 px-3 py-1 text-sm font-semibold uppercase tracking-wider text-stone-700">
      Recorded call
    </span>
  );
}

function Pulse({ live = false }: { live?: boolean }) {
  return (
    <span className="relative flex h-5 w-5" aria-hidden>
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${live ? "bg-red-500" : "bg-stone-400"}`} />
      <span className={`relative inline-flex h-5 w-5 rounded-full ${live ? "bg-red-600" : "bg-stone-500"}`} />
    </span>
  );
}

function Progress() {
  return (
    <span className="block h-2 w-48 overflow-hidden rounded-full bg-stone-200" aria-hidden>
      <span className="block h-full w-1/3 animate-[progress_1.4s_ease-in-out_infinite] rounded-full bg-stone-800" />
    </span>
  );
}

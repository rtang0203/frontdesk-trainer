"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Scorecard } from "@/components/Scorecard";
import type { CallView } from "@/lib/callView";
import { formatUsPhone } from "@/lib/phone";

const POLL_MS = 2000;
const DEMO_NUMBER = process.env.NEXT_PUBLIC_DEMO_PHONE_NUMBER ?? "";
const ACTIVE = new Set(["dialing", "in_progress", "scoring"]);

export function LiveView() {
  const [call, setCall] = useState<CallView | null>(null);
  const [detail, setDetail] = useState<CallView | null>(null);
  const sinceRef = useRef<string | null>(null);

  const poll = useCallback(async () => {
    // The first poll has no `since`: it anchors the load time to the server clock,
    // and only an active call from before the load is shown.
    const since = sinceRef.current;
    const res = await fetch(since ? `/api/calls/latest?since=${encodeURIComponent(since)}` : "/api/calls/latest", {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data: { call: CallView | null; serverTime: string } = await res.json();
    if (!since) {
      sinceRef.current = data.serverTime;
      setCall(data.call && ACTIVE.has(data.call.status) ? data.call : null);
    } else {
      setCall(data.call);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const loop = async () => {
      try {
        await poll();
      } catch {
        // Network blip: keep showing the last state and try again.
      }
      if (!stopped) timer = window.setTimeout(loop, POLL_MS);
    };
    loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [poll]);

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
    return <CallMe heading="Enter your number and we'll call you" disabled={false} onStarted={poll} />;
  }

  switch (call.status) {
    case "dialing":
      return (
        <Status tag={replayTag} title="Calling you now." subtitle="Answer as the front desk." indicator={<Pulse />} />
      );
    case "in_progress":
      return <Status tag={replayTag} title="Call in progress" indicator={<Pulse live />} />;
    case "scoring":
      return <Status tag={replayTag} title="Scoring your call" indicator={<Progress />} />;
    case "scored":
      return (
        <div className="space-y-10">
          {replayTag}
          {shown?.scorecard ? <Scorecard call={shown} collapseTranscript /> : <Progress />}
          <footer className="border-t border-stone-200 pt-8">
            <CallMe heading="Practice again" small disabled={active} onStarted={poll} />
          </footer>
        </div>
      );
    case "too_short":
      return (
        <div className="space-y-8">
          {replayTag}
          <Notice>That call was too short to score. Try again.</Notice>
          <CallMe heading="Call me again" disabled={active} onStarted={poll} />
        </div>
      );
    case "no_answer":
      return (
        <div className="space-y-8">
          {replayTag}
          <Notice>No answer. Check your phone and try again.</Notice>
          <CallMe heading="Call me again" disabled={active} onStarted={poll} />
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
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center" aria-live="polite">
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

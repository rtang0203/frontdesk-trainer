import { Retell } from "retell-sdk";
import { z } from "zod";
import type { CallStore, CallUpdate, NewCall } from "@/lib/calls";
import { maskPhone } from "@/lib/phone";
import { claimForScoring } from "@/lib/pipeline";
import { matchScenario } from "@/lib/scenarios";
import { isTooShort, stripNoResponseEntries, stripNoResponseLines } from "@/lib/transcript";

/**
 * Retell disconnection_reason values meaning the call never became a conversation:
 * every `not_connected` code (no answer, busy, declined, dial failures, spam blocks),
 * plus voicemail and IVR hang-ups.
 * Source: https://docs.retellai.com/reliability/debug-call-disconnect (checked 2026-11-14).
 */
export const NO_ANSWER_REASONS = new Set([
  "dial_no_answer",
  "dial_busy",
  "dial_failed",
  "user_declined",
  "invalid_destination",
  "marked_as_spam",
  "network_blocked",
  "telephony_provider_permission_denied",
  "telephony_provider_unavailable",
  "sip_routing_error",
  "voicemail_reached",
  "ivr_reached",
]);

const TranscriptEntrySchema = z.looseObject({ role: z.string(), content: z.string() });

const RetellCallSchema = z.looseObject({
  call_id: z.string().min(1),
  agent_id: z.string().nullish(),
  call_type: z.string().nullish(),
  direction: z.string().nullish(),
  from_number: z.string().nullish(),
  to_number: z.string().nullish(),
  start_timestamp: z.number().nullish(),
  end_timestamp: z.number().nullish(),
  duration_ms: z.number().nullish(),
  disconnection_reason: z.string().nullish(),
  transcript: z.string().nullish(),
  transcript_object: z.array(TranscriptEntrySchema).nullish(),
});

const WebhookBodySchema = z.looseObject({ event: z.string(), call: RetellCallSchema });

export type RetellCall = z.infer<typeof RetellCallSchema>;
type WebhookBody = z.infer<typeof WebhookBodySchema>;

export type WebhookDeps = {
  store: CallStore;
  /** Called once per call, after this delivery claimed it for scoring. Must not block the response. */
  onClaimed: (retellCallId: string) => void;
};

const toIso = (ms: number | null | undefined) => (ms == null ? null : new Date(ms).toISOString());

/**
 * The webhook body with the call's phone numbers masked everywhere, safe to store.
 * Retell repeats them outside from_number/to_number (SIP headers, dynamic variables).
 */
function maskedPayload(body: WebhookBody): WebhookBody {
  const replacements = [body.call.from_number, body.call.to_number]
    .filter((n): n is string => !!n && n.replace(/\D/g, "").length >= 7)
    .map((n) => ({ pattern: phonePattern(n), mask: maskPhone(n)! }));
  const scrub = (value: unknown): unknown => {
    if (typeof value === "string") return replacements.reduce((s, r) => s.replace(r.pattern, r.mask), value);
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
    return value;
  };
  return WebhookBodySchema.parse(scrub(body));
}

/** Matches the number's last 10 digits, with an optional +1 / 1 prefix. */
function phonePattern(phone: string): RegExp {
  const ten = phone.replace(/\D/g, "").slice(-10);
  return new RegExp(`(?:\\+?1)?${ten}`, "g");
}

/** Fields every webhook write fills from the payload, when the payload has them. */
function partyFields(call: RetellCall): CallUpdate {
  const fields: CallUpdate = {};
  if (call.direction) fields.direction = call.direction;
  if (call.from_number) fields.from_number = maskPhone(call.from_number);
  if (call.to_number) fields.to_number = maskPhone(call.to_number);
  return fields;
}

function newRow(call: RetellCall, raw: unknown): NewCall {
  return {
    retell_call_id: call.call_id,
    retell_agent_id: call.agent_id ?? null,
    scenario_id: matchScenario(call.agent_id).id,
    call_type: call.call_type ?? null,
    status: "in_progress",
    started_at: toIso(call.start_timestamp),
    raw_payload: raw,
    ...partyFields(call),
  };
}

async function onCallStarted(call: RetellCall, raw: unknown, { store }: WebhookDeps) {
  if (await store.insertIfAbsent(newRow(call, raw))) return;
  // Row exists: created by the call-start route (dialing), or a duplicate delivery.
  await store.update(call.call_id, { status: "in_progress", started_at: toIso(call.start_timestamp) }, ["dialing"]);
  await store.update(call.call_id, { ...partyFields(call), raw_payload: raw });
}

async function onCallEnded(call: RetellCall, raw: unknown, { store, onClaimed }: WebhookDeps) {
  const transcript = call.transcript == null ? null : stripNoResponseLines(call.transcript);
  const transcriptObject = call.transcript_object ? stripNoResponseEntries(call.transcript_object) : null;
  const durationMs =
    call.duration_ms ??
    (call.start_timestamp != null && call.end_timestamp != null ? call.end_timestamp - call.start_timestamp : null);

  const ended: CallUpdate = {
    transcript,
    transcript_object: transcriptObject,
    ended_at: toIso(call.end_timestamp),
    duration_ms: durationMs,
    disconnection_reason: call.disconnection_reason ?? null,
    raw_payload: raw,
    ...partyFields(call),
  };
  if (call.start_timestamp != null) ended.started_at = toIso(call.start_timestamp);

  // Upsert without ever writing status on conflict, so a duplicate can't reset scoring/scored.
  if (!(await store.insertIfAbsent({ ...newRow(call, raw), ...ended }))) {
    await store.update(call.call_id, ended);
  }

  const open = ["dialing", "in_progress"] as const;
  if (call.disconnection_reason && NO_ANSWER_REASONS.has(call.disconnection_reason)) {
    await store.update(call.call_id, { status: "no_answer" }, [...open]);
    return;
  }
  if (isTooShort({ transcript, transcriptObject, durationMs })) {
    await store.update(call.call_id, { status: "too_short" }, [...open]);
    return;
  }
  // Atomic claim: only one delivery moves the row to scoring.
  if (await claimForScoring(store, call.call_id)) onClaimed(call.call_id);
}

/** Handle an already-verified webhook body. */
export async function handleRetellEvent(rawBody: string, deps: WebhookDeps): Promise<void> {
  const { event } = z.looseObject({ event: z.string() }).parse(JSON.parse(rawBody));
  if (event !== "call_started" && event !== "call_ended") return;
  const body = WebhookBodySchema.parse(JSON.parse(rawBody));
  // The demo uses phone calls only. Web calls come from Retell's dashboard (its "test webhook"
  // button sends a fake web_call that never ends), and would block the live page as an active call.
  if (body.call.call_type === "web_call") {
    console.warn(`[webhook] ignoring ${body.event} for web call ${body.call.call_id}`);
    return;
  }
  const raw = maskedPayload(body);
  if (body.event === "call_started") await onCallStarted(body.call, raw, deps);
  else await onCallEnded(body.call, raw, deps);
}

/** Verify the signature against the raw body, handle the event, respond 204 with no body. */
export async function processWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-retell-signature");
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) throw new Error("RETELL_API_KEY is not set");
  if (!signature || !(await Retell.verify(rawBody, apiKey, signature))) {
    return new Response(null, { status: 401 });
  }
  await handleRetellEvent(rawBody, deps);
  return new Response(null, { status: 204 });
}

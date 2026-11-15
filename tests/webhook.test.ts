import { sign } from "retell-sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { processWebhook } from "@/lib/webhook";
import { getDefaultScenario } from "@/lib/scenarios";
import realCallEnded from "@/fixtures/retell-call-ended.json";
import realNoAnswer from "@/fixtures/retell-call-ended-no-answer.json";
import realOutbound from "@/fixtures/retell-call-ended-outbound.json";
import { countUserTurns, isTooShort } from "@/lib/transcript";
import { memoryStore } from "./memoryStore";

const KEY = "test_retell_key";
const AGENT = getDefaultScenario().retellAgentIds[0];

beforeAll(() => {
  process.env.RETELL_API_KEY = KEY;
});

const conversation = [
  { role: "user", content: "Glow Medspa, this is Randy." },
  { role: "agent", content: "How much is Botox?" },
  { role: "user", content: "Thirteen dollars a unit." },
  { role: "agent", content: "Okay, bye." },
];

function callPayload(event: string, overrides: Record<string, unknown> = {}) {
  return {
    event,
    call: {
      call_id: "call_1",
      agent_id: AGENT,
      call_type: "phone_call",
      direction: "outbound",
      from_number: "+17775550000",
      to_number: "+14155551947",
      start_timestamp: 1_763_160_000_000,
      ...(event === "call_ended"
        ? {
            end_timestamp: 1_763_160_060_000,
            disconnection_reason: "user_hangup",
            transcript: conversation.map((e) => `${e.role}: ${e.content}`).join("\n"),
            transcript_object: conversation,
          }
        : {}),
      ...overrides,
    },
  };
}

type Deps = Parameters<typeof processWebhook>[1];

async function deliver(body: unknown, deps: Pick<Deps, "store"> & Partial<Deps>, signature?: string) {
  const raw = JSON.stringify(body);
  const request = new Request("http://test/api/webhooks/retell", {
    method: "POST",
    headers: { "x-retell-signature": signature ?? (await sign(raw, KEY)) },
    body: raw,
  });
  return processWebhook(request, { onClaimed: () => {}, ...deps });
}

describe("webhook signature", () => {
  it("rejects a bad or missing signature and writes nothing", async () => {
    const { store, rows } = memoryStore();
    const body = callPayload("call_started");
    expect((await deliver(body, { store }, "v=1,d=" + "0".repeat(64))).status).toBe(401);
    expect((await deliver(body, { store }, await sign(JSON.stringify(body), "wrong_key"))).status).toBe(401);
    const noHeader = new Request("http://test", { method: "POST", body: JSON.stringify(body) });
    expect((await processWebhook(noHeader, { store, onClaimed: () => {} })).status).toBe(401);
    expect(rows.size).toBe(0);
  });

  it("returns 204 with no body and ignores other events", async () => {
    const { store, rows } = memoryStore();
    const res = await deliver(callPayload("call_analyzed"), { store });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(rows.size).toBe(0);
  });

  it("ignores Retell's dashboard test webhook (a web_call that never ends)", async () => {
    const { store, rows } = memoryStore();
    const res = await deliver(
      callPayload("call_started", { call_id: "test_call", agent_id: "test_agent", call_type: "web_call", direction: undefined }),
      { store },
    );
    expect(res.status).toBe(204);
    expect(rows.size).toBe(0);
  });
});

describe("call_started", () => {
  it("creates an in_progress row with masked numbers, and duplicates create nothing new", async () => {
    const { store, rows } = memoryStore();
    await deliver(callPayload("call_started"), { store });
    await deliver(callPayload("call_started"), { store });
    expect(rows.size).toBe(1);
    const row = rows.get("call_1")!;
    expect(row.status).toBe("in_progress");
    expect(row.scenario_id).toBe(getDefaultScenario().id);
    expect(row.to_number).toBe("•••• 1947");
    expect(row.from_number).toBe("•••• 0000");
    expect(row.started_at).toBe(new Date(1_763_160_000_000).toISOString());
  });

  it("moves an existing dialing row to in_progress", async () => {
    const { store, rows } = memoryStore();
    await store.insertIfAbsent({ retell_call_id: "call_1", scenario_id: "price-shopper", status: "dialing" });
    await deliver(callPayload("call_started"), { store });
    expect(rows.get("call_1")!.status).toBe("in_progress");
    expect(rows.size).toBe(1);
  });

  it("fills direction and masked to_number when the webhook creates the row before the call-start route", async () => {
    const { store, rows } = memoryStore();
    await deliver(callPayload("call_started"), { store });
    // The call-start route's insert then finds the row and does nothing.
    expect(
      await store.insertIfAbsent({
        retell_call_id: "call_1",
        scenario_id: "price-shopper",
        status: "dialing",
        direction: "outbound",
        to_number: "•••• 1947",
      }),
    ).toBe(false);
    const row = rows.get("call_1")!;
    expect(row.status).toBe("in_progress");
    expect(row.direction).toBe("outbound");
    expect(row.to_number).toBe("•••• 1947");
  });
});

describe("call_ended", () => {
  it("claims scoring once across repeated deliveries", async () => {
    const { store, rows } = memoryStore();
    const onClaimed = vi.fn();
    await deliver(callPayload("call_started"), { store, onClaimed });
    await deliver(callPayload("call_ended"), { store, onClaimed });
    await deliver(callPayload("call_ended"), { store, onClaimed });
    expect(onClaimed).toHaveBeenCalledTimes(1);
    expect(onClaimed).toHaveBeenCalledWith("call_1");
    expect(rows.size).toBe(1);
    expect(rows.get("call_1")!.status).toBe("scoring");
  });

  it("inserts the row when call_started was missed", async () => {
    const { store, rows } = memoryStore();
    const onClaimed = vi.fn();
    await deliver(callPayload("call_ended"), { store, onClaimed });
    expect(rows.get("call_1")!.status).toBe("scoring");
    expect(rows.get("call_1")!.duration_ms).toBe(60_000);
    expect(onClaimed).toHaveBeenCalledTimes(1);
  });

  it("leaves a scored call scored", async () => {
    const { store, rows } = memoryStore();
    const onClaimed = vi.fn();
    await deliver(callPayload("call_ended"), { store, onClaimed });
    await store.update("call_1", { status: "scored" });
    await deliver(callPayload("call_ended"), { store, onClaimed });
    expect(rows.get("call_1")!.status).toBe("scored");
    expect(onClaimed).toHaveBeenCalledTimes(1);
  });

  it("marks a short call too_short without scoring", async () => {
    const { store, rows } = memoryStore();
    const onClaimed = vi.fn();
    await deliver(callPayload("call_ended", { end_timestamp: 1_763_160_010_000 }), { store, onClaimed });
    expect(rows.get("call_1")!.status).toBe("too_short");
    expect(onClaimed).not.toHaveBeenCalled();
  });

  it("drops NO_RESPONSE_NEEDED lines before saving", async () => {
    const { store, rows } = memoryStore();
    const entries = [...conversation.slice(0, 2), { role: "agent", content: "NO_RESPONSE_NEEDED" }, ...conversation.slice(2)];
    await deliver(
      callPayload("call_ended", {
        // Retell's real transcript string capitalizes the speaker prefixes.
        transcript: entries.map((e) => `${e.role === "agent" ? "Agent" : "User"}: ${e.content}`).join("\n"),
        transcript_object: entries,
      }),
      { store },
    );
    const row = rows.get("call_1")!;
    expect(row.transcript).not.toContain("NO_RESPONSE_NEEDED");
    expect(row.transcript_object!.map((e) => e.content)).not.toContain("NO_RESPONSE_NEEDED");
  });
});

describe("captured outbound payloads", () => {
  async function dialingStore(retellCallId: string) {
    const { store, rows } = memoryStore();
    await store.insertIfAbsent({
      retell_call_id: retellCallId,
      scenario_id: "price-shopper",
      status: "dialing",
      direction: "outbound",
      to_number: "•••• 2746",
    });
    return { store, rows };
  }

  it("sets no_answer for the real voicemail call_ended and never schedules scoring", async () => {
    const { store, rows } = await dialingStore(realNoAnswer.call.call_id);
    const onClaimed = vi.fn();
    await deliver(realNoAnswer, { store, onClaimed });
    await deliver(realNoAnswer, { store, onClaimed });
    expect(rows.get(realNoAnswer.call.call_id)!.status).toBe("no_answer");
    expect(onClaimed).not.toHaveBeenCalled();
  });

  it("claims the real answered outbound call for scoring from dialing", async () => {
    const { store, rows } = await dialingStore(realOutbound.call.call_id);
    const onClaimed = vi.fn();
    await deliver(realOutbound, { store, onClaimed });
    expect(rows.get(realOutbound.call.call_id)!.status).toBe("scoring");
    expect(onClaimed).toHaveBeenCalledTimes(1);
  });
});

describe("masking", () => {
  it("masks numbers before saving, including everywhere inside raw_payload", async () => {
    const { store, rows } = memoryStore();
    await deliver(
      callPayload("call_ended", {
        // Real payloads repeat the numbers in SIP headers and dynamic variables.
        custom_sip_headers: { "p-asserted-identity": "<sip:+14155551947@10.0.0.1;user=phone>" },
        retell_llm_dynamic_variables: { diversion: "<sip:+17775550000@twilio.com>;reason=unconditional" },
      }),
      { store },
    );
    const row = rows.get("call_1")!;
    expect(JSON.stringify(row)).not.toContain("4155551947");
    expect(JSON.stringify(row)).not.toContain("7775550000");
    const call = (row.raw_payload as { call: Record<string, unknown> }).call;
    expect(call.to_number).toBe("•••• 1947");
    expect(call.from_number).toBe("•••• 0000");
    expect(JSON.stringify(call.custom_sip_headers)).toContain("<sip:•••• 1947@");
  });

  it("handles the captured real inbound call_ended payload", async () => {
    const { store, rows } = memoryStore();
    const onClaimed = vi.fn();
    const real = realCallEnded;
    await deliver(real, { store, onClaimed });
    const row = rows.get(real.call.call_id)!;
    expect(row.direction).toBe("inbound");
    expect(row.status).toBe("scoring");
    expect(onClaimed).toHaveBeenCalledTimes(1);
  });
});

describe("too-short rule", () => {
  const long = { durationMs: 60_000, transcript: "user: a\nagent: b\nuser: c" };

  it("flags an empty transcript", () => {
    expect(isTooShort({ ...long, transcript: "", transcriptObject: conversation })).toBe(true);
  });

  it("flags a call under 20 seconds", () => {
    expect(isTooShort({ ...long, durationMs: 19_999, transcriptObject: conversation })).toBe(true);
    expect(isTooShort({ ...long, transcriptObject: conversation })).toBe(false);
  });

  it("flags a one-turn call and merges consecutive same-speaker entries", () => {
    const oneTurn = [
      { role: "user", content: "Yes. Absolutely." },
      { role: "user", content: "Tuesday afternoon, I have two o'clock." },
      { role: "agent", content: "Great." },
    ];
    expect(countUserTurns(oneTurn)).toBe(1);
    expect(isTooShort({ ...long, transcriptObject: oneTurn })).toBe(true);
    expect(countUserTurns(conversation)).toBe(2);
  });
});

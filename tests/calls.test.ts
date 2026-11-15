import { describe, expect, it, vi } from "vitest";
import type { CallStatus } from "@/lib/calls";
import { applyStale, pickLatest, toView } from "@/lib/callView";
import { normalizeUsPhone } from "@/lib/phone";
import { MAX_OUTBOUND_PER_HOUR, startCall, type RetellCalls } from "@/lib/startCall";
import { memoryStore } from "./memoryStore";

const NOW = new Date("2026-11-14T20:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const row = (status: CallStatus, updatedAgoMs: number) => ({ status, updated_at: ago(updatedAgoMs), scoring_error: null });

describe("stale rules", () => {
  it("scoring older than 60 s is failed with 'Scoring timed out'; newer stays scoring", () => {
    expect(applyStale(row("scoring", 61_000), NOW)).toMatchObject({ status: "failed", scoring_error: "Scoring timed out" });
    expect(applyStale(row("scoring", 59_000), NOW).status).toBe("scoring");
  });

  it("in_progress older than 15 min is failed with 'Call result never arrived'", () => {
    expect(applyStale(row("in_progress", 15 * 60_000 + 1000), NOW)).toMatchObject({
      status: "failed",
      scoring_error: "Call result never arrived",
    });
    expect(applyStale(row("in_progress", 14 * 60_000), NOW).status).toBe("in_progress");
  });

  it("dialing older than 2 min is no_answer", () => {
    expect(applyStale(row("dialing", 2 * 60_000 + 1000), NOW).status).toBe("no_answer");
    expect(applyStale(row("dialing", 60_000), NOW).status).toBe("dialing");
  });

  it("leaves finished calls alone", () => {
    expect(applyStale(row("scored", 10 * 60 * 60_000), NOW).status).toBe("scored");
  });
});

describe("latest?since", () => {
  async function storeWith(rows: { id: string; status: CallStatus; created: number; updated: number }[]) {
    let clock = NOW;
    const { store, rows: map } = memoryStore(() => clock);
    for (const r of rows) {
      clock = new Date(NOW.getTime() - r.created);
      await store.insertIfAbsent({ retell_call_id: r.id, scenario_id: "price-shopper", status: r.status });
      map.get(r.id)!.updated_at = ago(r.updated);
    }
    return store;
  }
  const since = new Date(NOW.getTime() - 5_000);

  it("returns an active call created before since", async () => {
    const store = await storeWith([{ id: "old_active", status: "in_progress", created: 60_000, updated: 30_000 }]);
    const picked = pickLatest(await store.listLatestCandidates(since.toISOString()), since, NOW);
    expect(picked?.retell_call_id).toBe("old_active");
  });

  it("does not return a stale or finished call from before since", async () => {
    const store = await storeWith([
      { id: "stale_scoring", status: "scoring", created: 120_000, updated: 90_000 },
      { id: "old_scored", status: "scored", created: 60_000, updated: 50_000 },
    ]);
    expect(pickLatest(await store.listLatestCandidates(since.toISOString()), since, NOW)).toBeNull();
  });

  it("keeps showing a finished call created after since", async () => {
    const store = await storeWith([{ id: "new_scored", status: "scored", created: 1_000, updated: 500 }]);
    expect(pickLatest(await store.listLatestCandidates(since.toISOString()), since, NOW)?.retell_call_id).toBe(
      "new_scored",
    );
  });

  it("never returns raw_payload", async () => {
    const { store } = memoryStore(() => NOW);
    await store.insertIfAbsent({ retell_call_id: "c", scenario_id: "price-shopper", status: "scored", raw_payload: { x: 1 } });
    expect(toView((await store.getByRetellId("c"))!, NOW, true)).not.toHaveProperty("raw_payload");
  });
});

describe("normalizeUsPhone", () => {
  it("accepts US formats and rejects others", () => {
    expect(normalizeUsPhone("(415) 555-0123")).toBe("+14155550123");
    expect(normalizeUsPhone("415.555.0123")).toBe("+14155550123");
    expect(normalizeUsPhone("+1 415 555 0123")).toBe("+14155550123");
    expect(normalizeUsPhone("14155550123")).toBe("+14155550123");
    expect(normalizeUsPhone("+44 20 7946 0958")).toBeNull();
    expect(normalizeUsPhone("555-0123")).toBeNull();
    expect(normalizeUsPhone("415-555-012a")).toBeNull();
    expect(normalizeUsPhone("(015) 555-0123")).toBeNull();
  });
});

describe("startCall", () => {
  const FROM = "+17775550000";
  function setup() {
    const { store, rows } = memoryStore(() => NOW);
    let n = 0;
    const createPhoneCall = vi.fn<RetellCalls["createPhoneCall"]>(async () => ({ call_id: `call_${++n}` }));
    return { store, rows, createPhoneCall, deps: { store, retell: { createPhoneCall }, fromNumber: FROM, now: NOW } };
  }

  it("rejects non-US and malformed numbers without calling Retell", async () => {
    const { deps, createPhoneCall } = setup();
    for (const phone of ["+44 20 7946 0958", "12345", "", "call me"]) {
      expect(await startCall({ phone }, deps)).toEqual({ status: 400, body: { error: "Enter a US phone number" } });
    }
    expect(await startCall(null, deps)).toMatchObject({ status: 400 });
    expect(createPhoneCall).not.toHaveBeenCalled();
  });

  it("places the call and stores a dialing row with only the masked number", async () => {
    const { deps, rows, createPhoneCall } = setup();
    const res = await startCall({ phone: "(415) 555-1947", idempotencyKey: "k1" }, deps);
    expect(res.status).toBe(201);
    expect(createPhoneCall).toHaveBeenCalledWith({
      from_number: FROM,
      to_number: "+14155551947",
      override_agent_id: "agent_024251ac761abc082404386d93",
      idempotency_key: "k1",
    });
    const stored = rows.get("call_1")!;
    expect(res.body.id).toBe(stored.id);
    expect(stored).toMatchObject({ status: "dialing", direction: "outbound", to_number: "•••• 1947" });
    expect(JSON.stringify(stored)).not.toContain("4155551947");
  });

  it("returns 409 while a call is active", async () => {
    const { deps, createPhoneCall } = setup();
    await startCall({ phone: "4155551947" }, deps);
    expect(await startCall({ phone: "4155551947" }, deps)).toEqual({
      status: 409,
      body: { error: "A call is already in progress" },
    });
    expect(createPhoneCall).toHaveBeenCalledTimes(1);
  });

  it("returns 429 after 10 outbound calls in an hour", async () => {
    const { deps, store } = setup();
    for (let i = 0; i < MAX_OUTBOUND_PER_HOUR; i++) {
      await startCall({ phone: "4155551947" }, deps);
      await store.update(`call_${i + 1}`, { status: "no_answer" });
    }
    expect(await startCall({ phone: "4155551947" }, deps)).toEqual({
      status: 429,
      body: { error: "Too many calls. Try again later" },
    });
  });

  it("returns 502 and creates no row when Retell rejects the call", async () => {
    const { deps, rows, createPhoneCall } = setup();
    createPhoneCall.mockRejectedValueOnce(new Error("400 invalid number"));
    expect((await startCall({ phone: "4155551947" }, deps)).status).toBe(502);
    expect(rows.size).toBe(0);
  });
});

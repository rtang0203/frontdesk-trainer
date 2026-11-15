import { randomUUID } from "node:crypto";
import { ACTIVE_STATUSES, type CallRow, type CallStore } from "@/lib/calls";

/** In-memory CallStore with the same conditional-write semantics as the Supabase one. */
export function memoryStore(now: () => Date = () => new Date()) {
  const newestFirst = () =>
    [...rows.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => structuredClone(r));
  const rows = new Map<string, CallRow>();
  const store: CallStore = {
    async insertIfAbsent(row) {
      if (rows.has(row.retell_call_id)) return false;
      const ts = now().toISOString();
      rows.set(row.retell_call_id, {
        id: randomUUID(),
        org_id: "demo",
        retell_agent_id: null,
        call_type: null,
        direction: null,
        from_number: null,
        to_number: null,
        started_at: null,
        ended_at: null,
        duration_ms: null,
        disconnection_reason: null,
        transcript: null,
        transcript_object: null,
        scorecard: null,
        passed: null,
        applicable: null,
        scoring_model: null,
        scoring_latency_ms: null,
        scoring_error: null,
        raw_payload: null,
        created_at: ts,
        updated_at: ts,
        ...structuredClone(row),
      });
      return true;
    },
    async update(retellCallId, fields, onlyIfStatus) {
      const row = rows.get(retellCallId);
      if (!row || (onlyIfStatus && !onlyIfStatus.includes(row.status))) return false;
      Object.assign(row, structuredClone(fields), { updated_at: now().toISOString() });
      return true;
    },
    async getByRetellId(retellCallId) {
      const row = rows.get(retellCallId);
      return row ? structuredClone(row) : null;
    },
    async getById(id) {
      const row = [...rows.values()].find((r) => r.id === id);
      return row ? structuredClone(row) : null;
    },
    async listRecent(limit) {
      return newestFirst().slice(0, limit);
    },
    async listLatestCandidates(sinceIso) {
      return newestFirst()
        .filter((r) => r.created_at >= sinceIso || (ACTIVE_STATUSES as readonly string[]).includes(r.status))
        .slice(0, 20);
    },
    async countOutboundSince(sinceIso) {
      return [...rows.values()].filter((r) => r.direction === "outbound" && r.created_at >= sinceIso).length;
    },
  };
  return { store, rows };
}

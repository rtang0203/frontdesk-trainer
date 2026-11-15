import { getDb } from "@/lib/db";
import type { Scorecard } from "@/lib/scoring/schema";
import type { TranscriptEntry } from "@/lib/transcript";

export const STATUSES = ["dialing", "in_progress", "scoring", "scored", "too_short", "no_answer", "failed"] as const;
export type CallStatus = (typeof STATUSES)[number];

export type CallRow = {
  id: string;
  org_id: string;
  retell_call_id: string;
  retell_agent_id: string | null;
  scenario_id: string;
  call_type: string | null;
  direction: string | null;
  from_number: string | null;
  to_number: string | null;
  status: CallStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  disconnection_reason: string | null;
  transcript: string | null;
  transcript_object: TranscriptEntry[] | null;
  scorecard: Scorecard | null;
  passed: number | null;
  applicable: number | null;
  scoring_model: string | null;
  scoring_latency_ms: number | null;
  scoring_error: string | null;
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
};

export type NewCall = Pick<CallRow, "retell_call_id" | "scenario_id" | "status"> &
  Partial<Omit<CallRow, "id" | "created_at" | "updated_at">>;
export type CallUpdate = Partial<Omit<CallRow, "id" | "retell_call_id" | "created_at" | "updated_at">>;

/** Persistence used by the webhook, the call-start route, and the scripts. */
export interface CallStore {
  /** Insert unless a row with this retell_call_id exists. Returns true if inserted. */
  insertIfAbsent(row: NewCall): Promise<boolean>;
  /**
   * Update by retell_call_id, optionally only where status is one of `onlyIfStatus`.
   * Atomic in the database. Returns true if a row was updated.
   */
  update(retellCallId: string, fields: CallUpdate, onlyIfStatus?: CallStatus[]): Promise<boolean>;
  getByRetellId(retellCallId: string): Promise<CallRow | null>;
  getById(id: string): Promise<CallRow | null>;
  /** Newest first, without transcripts or raw_payload. */
  listRecent(limit: number): Promise<CallSummaryRow[]>;
  /** Newest first: rows created at or after `sinceIso`, plus rows in an active status of any age. */
  listLatestCandidates(sinceIso: string): Promise<CallSummaryRow[]>;
  countOutboundSince(sinceIso: string): Promise<number>;
}

export const ACTIVE_STATUSES = ["dialing", "in_progress", "scoring"] as const satisfies CallStatus[];

/** Columns safe and cheap enough for lists and polling. Never raw_payload. */
const SUMMARY_COLUMNS =
  "id,org_id,retell_call_id,retell_agent_id,scenario_id,call_type,direction,from_number,to_number,status,started_at,ended_at,duration_ms,disconnection_reason,scorecard,passed,applicable,scoring_model,scoring_latency_ms,scoring_error,created_at,updated_at";
export type CallSummaryRow = Omit<CallRow, "transcript" | "transcript_object" | "raw_payload">;

const ORG_ID = "demo";
const CANDIDATE_LIMIT = 20;

export const supabaseCallStore: CallStore = {
  async insertIfAbsent(row) {
    const { data, error } = await getDb()
      .from("calls")
      .upsert(row, { onConflict: "retell_call_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`insert call: ${error.message}`);
    return (data?.length ?? 0) > 0;
  },

  async update(retellCallId, fields, onlyIfStatus) {
    let query = getDb().from("calls").update(fields).eq("retell_call_id", retellCallId);
    if (onlyIfStatus) query = query.in("status", onlyIfStatus);
    const { data, error } = await query.select("id");
    if (error) throw new Error(`update call: ${error.message}`);
    return (data?.length ?? 0) > 0;
  },

  async getByRetellId(retellCallId) {
    const { data, error } = await getDb().from("calls").select("*").eq("retell_call_id", retellCallId).maybeSingle();
    if (error) throw new Error(`get call: ${error.message}`);
    return data as CallRow | null;
  },

  async getById(id) {
    const { data, error } = await getDb().from("calls").select("*").eq("org_id", ORG_ID).eq("id", id).maybeSingle();
    if (error) throw new Error(`get call: ${error.message}`);
    return data as CallRow | null;
  },

  async listRecent(limit) {
    const { data, error } = await getDb()
      .from("calls")
      .select(SUMMARY_COLUMNS)
      .eq("org_id", ORG_ID)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`list calls: ${error.message}`);
    return data as unknown as CallSummaryRow[];
  },

  async listLatestCandidates(sinceIso) {
    const { data, error } = await getDb()
      .from("calls")
      .select(SUMMARY_COLUMNS)
      .eq("org_id", ORG_ID)
      .or(`created_at.gte."${sinceIso}",status.in.(${ACTIVE_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(CANDIDATE_LIMIT);
    if (error) throw new Error(`latest calls: ${error.message}`);
    return data as unknown as CallSummaryRow[];
  },

  async countOutboundSince(sinceIso) {
    const { count, error } = await getDb()
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ORG_ID)
      .eq("direction", "outbound")
      .gte("created_at", sinceIso);
    if (error) throw new Error(`count calls: ${error.message}`);
    return count ?? 0;
  },
};

import { z } from "zod";
import type { CallStore } from "@/lib/calls";
import { isActive } from "@/lib/callView";
import { maskPhone, normalizeUsPhone } from "@/lib/phone";
import { getDefaultScenario } from "@/lib/scenarios";

export const MAX_OUTBOUND_PER_HOUR = 10;

const StartBodySchema = z.object({ phone: z.string(), idempotencyKey: z.string().optional() });

/** The slice of the Retell client this route uses, so tests can mock it. */
export type RetellCalls = {
  createPhoneCall(params: {
    from_number: string;
    to_number: string;
    override_agent_id?: string;
    idempotency_key?: string;
  }): Promise<{ call_id: string }>;
};

export type StartResult = { status: number; body: { id?: string; error?: string } };

export async function startCall(
  input: unknown,
  deps: { store: CallStore; retell: RetellCalls; fromNumber: string; now?: Date },
): Promise<StartResult> {
  const now = deps.now ?? new Date();
  const parsed = StartBodySchema.safeParse(input);
  const phone = parsed.success ? normalizeUsPhone(parsed.data.phone) : null;
  if (!parsed.success || !phone) return { status: 400, body: { error: "Enter a US phone number" } };
  const idempotencyKey = parsed.data.idempotencyKey || undefined;

  // One call at a time. Not atomic with the insert below; see the spec's accepted risk.
  const candidates = await deps.store.listLatestCandidates(now.toISOString());
  if (candidates.some((row) => isActive(row, now))) {
    return { status: 409, body: { error: "A call is already in progress" } };
  }
  const hourAgo = new Date(now.getTime() - 60 * 60_000).toISOString();
  if ((await deps.store.countOutboundSince(hourAgo)) >= MAX_OUTBOUND_PER_HOUR) {
    return { status: 429, body: { error: "Too many calls. Try again later" } };
  }

  const scenario = getDefaultScenario();
  let callId: string;
  try {
    const created = await deps.retell.createPhoneCall({
      from_number: deps.fromNumber,
      to_number: phone,
      override_agent_id: scenario.retellAgentIds[0],
      idempotency_key: idempotencyKey,
    });
    callId = created.call_id;
  } catch (e) {
    // Never log the entered number; Retell's error message doesn't include it.
    console.error(`[start] Retell rejected the call: ${e instanceof Error ? e.message : String(e)}`);
    return { status: 502, body: { error: "Couldn't place the call. Try again, or call the number below." } };
  }

  // The webhook may already have created this row; then this does nothing.
  await deps.store.insertIfAbsent({
    retell_call_id: callId,
    retell_agent_id: scenario.retellAgentIds[0],
    scenario_id: scenario.id,
    call_type: "phone_call",
    status: "dialing",
    direction: "outbound",
    from_number: maskPhone(deps.fromNumber),
    to_number: maskPhone(phone),
  });
  const row = await deps.store.getByRetellId(callId);
  return { status: 201, body: { id: row?.id } };
}

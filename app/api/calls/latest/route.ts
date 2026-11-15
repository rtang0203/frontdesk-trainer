import { supabaseCallStore } from "@/lib/calls";
import { pickLatest, toView } from "@/lib/callView";

/**
 * The newest call created at or after `since`, or active whatever its age.
 * Without `since`, the most recent call. `serverTime` lets the live page anchor to the server clock.
 */
export async function GET(request: Request): Promise<Response> {
  const now = new Date();
  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : null;
  if (since && Number.isNaN(since.getTime())) {
    return Response.json({ error: "since must be an ISO timestamp" }, { status: 400 });
  }
  const row = since
    ? pickLatest(await supabaseCallStore.listLatestCandidates(since.toISOString()), since, now)
    : ((await supabaseCallStore.listRecent(1))[0] ?? null);
  return Response.json(
    { call: row ? toView(row, now) : null, serverTime: now.toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

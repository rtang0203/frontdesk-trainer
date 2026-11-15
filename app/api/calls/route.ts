import { supabaseCallStore } from "@/lib/calls";
import { toView } from "@/lib/callView";

/** Recent calls, newest first, without transcripts. */
export async function GET(request: Request): Promise<Response> {
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 100) : 20;
  const now = new Date();
  const rows = await supabaseCallStore.listRecent(limit);
  return Response.json({ calls: rows.map((row) => toView(row, now)) }, { headers: { "Cache-Control": "no-store" } });
}

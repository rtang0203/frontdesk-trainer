import { supabaseCallStore } from "@/lib/calls";
import { toView } from "@/lib/callView";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One call with transcript and scorecard. */
export async function GET(_request: Request, ctx: RouteContext<"/api/calls/[id]">): Promise<Response> {
  const { id } = await ctx.params;
  const row = UUID.test(id) ? await supabaseCallStore.getById(id) : null;
  if (!row) return Response.json({ error: "Call not found" }, { status: 404 });
  return Response.json({ call: toView(row, new Date(), true) }, { headers: { "Cache-Control": "no-store" } });
}

import { after } from "next/server";
import { supabaseCallStore } from "@/lib/calls";
import { scoreAndSave } from "@/lib/pipeline";
import { processWebhook } from "@/lib/webhook";

// Scoring runs in after(), which shares this budget. scoreCall caps itself at 55 s.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return processWebhook(request, {
    store: supabaseCallStore,
    onClaimed: (retellCallId) => after(() => scoreAndSave(supabaseCallStore, retellCallId)),
  });
}

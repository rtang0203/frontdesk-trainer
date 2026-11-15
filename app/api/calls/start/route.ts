import { Retell } from "retell-sdk";
import { supabaseCallStore } from "@/lib/calls";
import { startCall } from "@/lib/startCall";

export async function POST(request: Request): Promise<Response> {
  const fromNumber = process.env.NEXT_PUBLIC_DEMO_PHONE_NUMBER;
  if (!fromNumber) throw new Error("NEXT_PUBLIC_DEMO_PHONE_NUMBER is not set");
  const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });
  const input = await request.json().catch(() => null);
  const result = await startCall(input, { store: supabaseCallStore, retell: retell.call, fromNumber });
  return Response.json(result.body, { status: result.status });
}

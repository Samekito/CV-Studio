// GET /api/health, public, for uptime monitors. 200 when the app can reach its database,
// 503 when it cannot. Says nothing else: no versions, no config, no counts.
import { NextResponse } from "next/server";
import { errorMessage, log } from "@/lib/log";
import { adminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Asks for headers only, no rows: the cheapest query that still proves the database answers.
    const { error } = await adminClient().from("invites").select("email", { head: true }).limit(1);
    if (error) throw new Error(error.message);
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    log.error("health.failed", { error: errorMessage(err) });
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

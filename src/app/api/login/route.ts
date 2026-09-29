// POST logs in with email + password (Supabase sets the session cookies); DELETE logs out.
// Login is rate-limited per email and per IP (lib/rate-limit.ts) before Supabase is asked.
import { NextResponse } from "next/server";
import { recordEvent } from "@/lib/events";
import { bad, clientIp, jsonError, route, tooMany } from "@/lib/http";
import { limits, withinLimits } from "@/lib/rate-limit";
import { userClient } from "@/lib/supabase";

export const POST = route("login", async (request) => {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!email || !password) return bad("Enter your email and password.");
  if (!(await withinLimits(limits.loginByEmail(email), limits.loginByIp(clientIp(request))))) return tooMany();

  const supabase = await userClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Same message for unknown email, wrong password and a disabled account, so the form cannot
    // be used to probe who has an account.
    return jsonError("Wrong email or password.", 401);
  }
  await recordEvent("login", data.user.id);
  return NextResponse.json({ ok: true });
});

export const DELETE = route("logout", async () => {
  const supabase = await userClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
});

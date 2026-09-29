// POST creates an account for an invited email, then logs it in.
// Needs the email AND its one-time invite code (made on the Admin page), so knowing someone's
// address is not enough to claim their account. Supabase's own public sign-up must be switched
// off (README.md), so this route is the only way in. There is no admin shortcut: the first
// admin is invited by SQL like anyone else (README.md, first-time setup).
import { NextResponse } from "next/server";
import { recordEvent } from "@/lib/events";
import { bad, clientIp, jsonError, route, tooMany } from "@/lib/http";
import { hashInviteCode } from "@/lib/invites";
import { log } from "@/lib/log";
import { limits, withinLimits } from "@/lib/rate-limit";
import { adminClient, userClient } from "@/lib/supabase";
import { EMAIL } from "@/lib/validate";

// One answer for "not invited", "wrong code" and "code already used", so the form cannot be
// used to find out which emails are on the invite list.
const NO_MATCH = "That email and invite code do not match an open invite.";

export const POST = route("signup", async (request) => {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string; code?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const code = body.code ?? "";
  if (!EMAIL.test(email)) return bad("Enter a valid email address.");
  if (!code.trim()) return bad("Enter the invite code you were sent.");
  if (password.length < 8) return bad("Use a password of at least 8 characters.");
  if (!(await withinLimits(limits.signupByIp(clientIp(request))))) return tooMany();

  const admin = adminClient();
  const { data: invite, error } = await admin
    .from("invites")
    .select("email")
    .eq("email", email)
    .eq("code_hash", hashInviteCode(code))
    .maybeSingle();
  if (error) throw new Error(`invite lookup: ${error.message}`);
  if (!invite) return jsonError(NO_MATCH, 403);

  // email_confirm: the one-time code proves the invite reached this person, without an email service.
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createError) {
    if (createError.code === "email_exists" || createError.code === "user_already_exists") {
      return jsonError("That email already has an account. Log in instead.", 409);
    }
    if (createError.code === "weak_password") return bad(createError.message);
    throw new Error(`account creation: ${createError.message}`);
  }

  // The code is spent the moment the account exists, whatever happens next.
  const { error: spendError } = await admin.from("invites").update({ code_hash: null }).eq("email", email);
  if (spendError) log.error("signup.code_not_cleared", { error: spendError.message });
  await recordEvent("signup", created.user.id);

  const supabase = await userClient();
  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
  if (loginError) {
    log.warn("signup.first_login_failed", { error: loginError.message });
    // The account exists, so "try again" would only produce "already has an account".
    return NextResponse.json({ ok: true, loginNeeded: true, message: "Account created. Log in to continue." }, { status: 201 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
});

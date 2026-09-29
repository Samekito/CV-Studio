// Admin only (ADMIN_USER_ID).
// GET    -> AdminData: invites with sign-up status, today's usage, and 7-day event totals.
// POST   { email }            -> invites someone and returns a fresh one-time code, shown once.
//                                 Posting an existing email replaces its code.
// PATCH  { userId, disabled } -> disables or re-enables an account (Supabase ban). A disabled
//                                 user cannot log in again; a session already open can last
//                                 until its access token expires (an hour by default).
// DELETE ?email=              -> withdraws an invite that has not been used.
import { NextResponse } from "next/server";
import { currentUser, notLoggedIn, type SessionUser } from "@/lib/auth";
import { bad, jsonError, route } from "@/lib/http";
import { hashInviteCode, newInviteCode } from "@/lib/invites";
import { log } from "@/lib/log";
import { adminClient } from "@/lib/supabase";
import type { AdminData, EventTotal, InviteRow } from "@/lib/types";
import { dailyLimit, usageToday } from "@/lib/usage";
import { EMAIL, UUID } from "@/lib/validate";

const EVENT_DAYS = 7;
// Supabase has no "ban forever"; a century is the conventional stand-in.
const DISABLED_FOR = "876000h";

async function requireAdmin(): Promise<SessionUser | Response> {
  const user = await currentUser();
  if (!user) return notLoggedIn();
  if (!user.isAdmin) return jsonError("Admins only.", 403);
  return user;
}

export const GET = route("admin.get", async () => {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const db = adminClient();

  const [invites, users, usage, events] = await Promise.all([
    db.from("invites").select("email, created_at, code_hash").order("created_at", { ascending: false }),
    // Invite-only, so one page of 1,000 covers every account.
    db.auth.admin.listUsers({ perPage: 1000 }),
    usageToday(),
    db.rpc("event_summary", { p_days: EVENT_DAYS }),
  ]);
  if (invites.error) throw new Error(`load invites: ${invites.error.message}`);
  if (users.error) throw new Error(`load users: ${users.error.message}`);
  if (events.error) throw new Error(`load events: ${events.error.message}`);

  const now = Date.now();
  const userByEmail = new Map(users.data.users.map((u) => [u.email?.toLowerCase() ?? "", u]));
  const rows: InviteRow[] = invites.data.map((invite) => {
    const account = userByEmail.get(invite.email);
    return {
      email: invite.email,
      invited_on: invite.created_at.slice(0, 10),
      has_code: Boolean(invite.code_hash),
      joined: Boolean(account),
      user_id: account?.id ?? null,
      disabled: Boolean(account?.banned_until && Date.parse(account.banned_until) > now),
      used_today: account ? (usage.get(account.id) ?? 0) : 0,
    };
  });
  // Postgres counts arrive as strings (bigint); the page wants numbers.
  const totals = (events.data as { name: string; total: number | string; users: number | string }[]).map(
    (e): EventTotal => ({ name: e.name, total: Number(e.total), users: Number(e.users) }),
  );
  const result: AdminData = { dailyLimit: dailyLimit(), invites: rows, events: totals };
  return NextResponse.json(result);
});

export const POST = route("admin.invite", async (request) => {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL.test(email)) return bad("Enter a valid email address.");

  const code = newInviteCode();
  const { error } = await adminClient()
    .from("invites")
    .upsert({ email, code_hash: hashInviteCode(code) }, { onConflict: "email" });
  if (error) throw new Error(`save invite: ${error.message}`);
  log.info("admin.invite_code_issued");
  // The only time the code leaves the server in readable form.
  return NextResponse.json({ email, code }, { status: 201, headers: { "Cache-Control": "no-store" } });
});

export const PATCH = route("admin.account", async (request) => {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const body = (await request.json().catch(() => ({}))) as { userId?: string; disabled?: boolean };
  if (!body.userId || !UUID.test(body.userId) || typeof body.disabled !== "boolean") return bad("Send a userId and disabled: true or false.");
  if (body.userId === admin.id) return bad("You cannot disable your own account.");

  const { error } = await adminClient().auth.admin.updateUserById(body.userId, {
    ban_duration: body.disabled ? DISABLED_FOR : "none",
  });
  if (error) throw new Error(`update account: ${error.message}`);
  log.info(body.disabled ? "admin.account_disabled" : "admin.account_enabled", { target: body.userId });
  return NextResponse.json({ ok: true });
});

export const DELETE = route("admin.withdraw", async (request) => {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const email = (new URL(request.url).searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) return bad("Missing email.");
  const { error } = await adminClient().from("invites").delete().eq("email", email);
  if (error) throw new Error(`remove invite: ${error.message}`);
  return NextResponse.json({ ok: true });
});

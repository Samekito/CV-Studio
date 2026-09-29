// Who is calling, for route handlers. The proxy already turned away anyone without a session;
// this reads the verified user id and email so handlers can scope work and check admin rights.
// The admin is identified by account id (ADMIN_USER_ID), which, unlike an email, cannot be changed.
import { NextResponse } from "next/server";
import { setLogUser } from "./log";
import { userClient } from "./supabase";

export type SessionUser = { id: string; email: string; isAdmin: boolean };

export function isAdminId(userId: string): boolean {
  const admin = process.env.ADMIN_USER_ID?.trim();
  return Boolean(admin) && userId === admin;
}

export async function currentUser(): Promise<SessionUser | null> {
  const supabase = await userClient();
  // getClaims verifies the session token rather than trusting the cookie contents.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const email = typeof claims.email === "string" ? claims.email : "";
  setLogUser(claims.sub);
  return { id: claims.sub, email, isAdmin: isAdminId(claims.sub) };
}

export function notLoggedIn() {
  return NextResponse.json({ error: "Not logged in." }, { status: 401 });
}

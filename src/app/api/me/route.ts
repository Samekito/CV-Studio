// GET the logged-in user's account summary (Me): id, email, admin flag, today's usage, and name
// plus tracks. Loaded on every page by the nav, so it leaves out the Fact Bank text.
import { NextResponse } from "next/server";
import { currentUser, notLoggedIn } from "@/lib/auth";
import { route } from "@/lib/http";
import { getProfileSummary } from "@/lib/profile";
import type { Me } from "@/lib/types";
import { dailyLimit, usageToday } from "@/lib/usage";

export const GET = route("me", async () => {
  const user = await currentUser();
  if (!user) return notLoggedIn();
  const [profile, usage] = await Promise.all([getProfileSummary(), usageToday(user.id)]);
  const me: Me = {
    userId: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    dailyLimit: user.isAdmin ? null : dailyLimit(),
    usedToday: usage.get(user.id) ?? 0,
    profile,
  };
  return NextResponse.json(me);
});

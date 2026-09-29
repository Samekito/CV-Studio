// The logged-in user's full profile: name, track labels and Fact Bank.
// GET returns Profile, or { profile: null } before onboarding. PUT saves it.
import { NextResponse } from "next/server";
import { currentUser, notLoggedIn } from "@/lib/auth";
import { recordEvent } from "@/lib/events";
import { bad, route, tooMany } from "@/lib/http";
import { cleanTracks, getProfile, MAX_FACT_BANK, saveProfile } from "@/lib/profile";
import { limits, withinLimits } from "@/lib/rate-limit";

export const GET = route("profile.get", async () => {
  if (!(await currentUser())) return notLoggedIn();
  return NextResponse.json({ profile: await getProfile() });
});

export const PUT = route("profile.put", async (request) => {
  const user = await currentUser();
  if (!user) return notLoggedIn();
  if (!(await withinLimits(limits.writesByUser(user.id)))) return tooMany("Too many saves in a minute. Wait a moment.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("Body must be JSON.");

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const factBank = typeof body.fact_bank === "string" ? body.fact_bank.trim() : "";
  const tracks = cleanTracks(body.tracks);
  if (!fullName || fullName.length > 100) return bad("Enter your full name (up to 100 characters).");
  if (typeof tracks === "string") return bad(tracks);
  if (factBank.length < 300) return bad("That looks too short to be a full Fact Bank.");
  if (factBank.length > MAX_FACT_BANK) return bad("Fact Bank is too long.");

  await saveProfile(user.id, { full_name: fullName, tracks, fact_bank: factBank });
  await recordEvent("profile.saved", user.id);
  return NextResponse.json({ ok: true });
});

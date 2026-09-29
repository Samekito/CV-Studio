// Tracker storage. GET lists (without the saved CV and letter), GET ?id= returns one row in
// full, POST creates, PATCH updates (?id=), DELETE removes (?id=).
// Every query runs as the logged-in user, so RLS limits it to their own applications and
// fills user_id on insert. Writes are rate-limited and each user is capped at 500 rows.
import { NextResponse } from "next/server";
import { cleanApplication, MAX_APPLICATIONS_PER_USER } from "@/lib/applications";
import { currentUser, notLoggedIn } from "@/lib/auth";
import { recordEvent } from "@/lib/events";
import { bad, jsonError, route, tooMany } from "@/lib/http";
import { limits, withinLimits } from "@/lib/rate-limit";
import { userClient } from "@/lib/supabase";
import { APPLICATION_LIST_COLUMNS } from "@/lib/types";
import { UUID } from "@/lib/validate";

const notFound = () => jsonError("Not found.", 404);
const slowDown = () => tooMany("Too many changes in a minute. Wait a moment.");

export const GET = route("applications.get", async (request) => {
  if (!(await currentUser())) return notLoggedIn();
  const supabase = await userClient();
  const id = new URL(request.url).searchParams.get("id");

  if (id !== null) {
    if (!UUID.test(id)) return bad("Invalid id.");
    const { data, error } = await supabase.from("applications").select(`${APPLICATION_LIST_COLUMNS}, cv, cover_letter`).eq("id", id).maybeSingle();
    if (error) throw new Error(`load one: ${error.message}`);
    return data ? NextResponse.json(data) : notFound();
  }

  const { data, error } = await supabase
    .from("applications")
    .select(APPLICATION_LIST_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`load list: ${error.message}`);
  return NextResponse.json(data);
});

export const POST = route("applications.post", async (request) => {
  const user = await currentUser();
  if (!user) return notLoggedIn();
  if (!(await withinLimits(limits.writesByUser(user.id)))) return slowDown();
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!input) return bad("Body must be JSON.");
  const row = cleanApplication({ status: "draft", ...input });
  if (typeof row === "string") return bad(row);
  if (!row.company || !row.role) return bad("Company and role are required.");

  const supabase = await userClient();
  const { count, error: countError } = await supabase.from("applications").select("id", { count: "exact", head: true });
  if (countError) throw new Error(`count: ${countError.message}`);
  if ((count ?? 0) >= MAX_APPLICATIONS_PER_USER) {
    return jsonError(`The tracker holds up to ${MAX_APPLICATIONS_PER_USER} applications. Delete old ones to add more.`, 409);
  }

  const { data, error } = await supabase.from("applications").insert(row).select(APPLICATION_LIST_COLUMNS).single();
  if (error) throw new Error(`save: ${error.message}`);
  await recordEvent("application.saved", user.id);
  return NextResponse.json(data, { status: 201 });
});

export const PATCH = route("applications.patch", async (request) => {
  const user = await currentUser();
  if (!user) return notLoggedIn();
  if (!(await withinLimits(limits.writesByUser(user.id)))) return slowDown();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return bad("Invalid id.");
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!input) return bad("Body must be JSON.");
  const row = cleanApplication(input);
  if (typeof row === "string") return bad(row);

  const supabase = await userClient();
  const { data, error } = await supabase.from("applications").update(row).eq("id", id).select(APPLICATION_LIST_COLUMNS);
  if (error) throw new Error(`update: ${error.message}`);
  // RLS hides other users' rows, so someone else's id looks exactly like a missing one.
  if (!data?.length) return notFound();
  return NextResponse.json(data[0]);
});

export const DELETE = route("applications.delete", async (request) => {
  const user = await currentUser();
  if (!user) return notLoggedIn();
  if (!(await withinLimits(limits.writesByUser(user.id)))) return slowDown();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return bad("Invalid id.");
  const supabase = await userClient();
  const { data, error } = await supabase.from("applications").delete().eq("id", id).select("id");
  if (error) throw new Error(`delete: ${error.message}`);
  if (!data?.length) return notFound();
  return NextResponse.json({ ok: true });
});

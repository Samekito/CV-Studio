// Product analytics kept in our own database (events table, 0002_hardening.sql): which
// features people use, not what they write. Recording never blocks or fails the request.
import { errorMessage, log } from "./log";
import { adminClient } from "./supabase";

export type EventName =
  | "signup"
  | "login"
  | "generate.tailor"
  | "generate.answers"
  | "generate.bio"
  | "generate.draft_profile"
  | "generate.failed"
  | "profile.saved"
  | "application.saved";

export async function recordEvent(name: EventName, userId: string | null): Promise<void> {
  try {
    const { error } = await adminClient().from("events").insert({ name, user_id: userId });
    if (error) log.warn("event.not_recorded", { name, error: error.message });
  } catch (err) {
    log.warn("event.not_recorded", { name, error: errorMessage(err) });
  }
}

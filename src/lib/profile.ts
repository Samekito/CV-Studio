// Server-side access to the logged-in user's profile (name, tracks, Fact Bank), plus the blank
// template new users start from. Every query runs as the user, so RLS returns only their row.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { userClient } from "./supabase";
import { isTrack, type Profile, type ProfileSummary, type Tracks } from "./types";

export const MAX_FACT_BANK = 60000; // characters; a full one is about 15,000

export async function factBankTemplate(): Promise<string> {
  return readFile(path.join(process.cwd(), "src", "data", "fact-bank-template.md"), "utf8");
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await userClient();
  const { data, error } = await supabase.from("profiles").select("full_name, tracks, fact_bank").maybeSingle();
  if (error) throw new Error(`Could not load the profile: ${error.message}`);
  return data as Profile | null;
}

// Name and tracks only, for /api/me: the Fact Bank can be 60,000 characters and the nav loads on every page.
export async function getProfileSummary(): Promise<ProfileSummary | null> {
  const supabase = await userClient();
  const { data, error } = await supabase.from("profiles").select("full_name, tracks").maybeSingle();
  if (error) throw new Error(`Could not load the profile: ${error.message}`);
  return data as ProfileSummary | null;
}

export async function saveProfile(userId: string, profile: Profile): Promise<void> {
  const supabase = await userClient();
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, ...profile, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Could not save the profile: ${error.message}`);
}

// Keep only A/B/C keys with a non-empty label, trimmed. Returns an error message instead when invalid.
export function cleanTracks(input: unknown): Tracks | string {
  if (!input || typeof input !== "object") return "Tracks are missing.";
  const out: Tracks = {};
  for (const [key, label] of Object.entries(input)) {
    if (isTrack(key) && typeof label === "string" && label.trim()) out[key] = label.trim().slice(0, 60);
  }
  if (Object.keys(out).length === 0) return "Give at least one track a name.";
  return out;
}

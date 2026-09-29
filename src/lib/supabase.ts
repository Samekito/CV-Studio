// Supabase clients for route handlers. Server-only: reads keys from the environment.
// userClient() acts as the logged-in user (from the session cookies), so Row Level Security
// limits every query to that user's rows. adminClient() uses the service key and bypasses RLS;
// it is only for invites, usage counting and the admin page.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SESSION_COOKIE_OPTIONS } from "./session";

export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set. See README.md.");
  return { url, anonKey };
}

export async function userClient() {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
      },
    },
  });
}

export function adminClient() {
  const { url } = supabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_KEY must be set. See README.md.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

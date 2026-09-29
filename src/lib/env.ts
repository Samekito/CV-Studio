// The environment variables the app cannot run without, checked once at server start by
// src/instrumentation.ts, so a missing one is reported at deploy time instead of on a user's
// first request. Optional variables (limits, model overrides) have defaults and are not listed.

export function missingEnvVars(env: Record<string, string | undefined> = process.env): string[] {
  const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY", "ADMIN_USER_ID"];
  required.push((env.LLM_PROVIDER ?? "gemini") === "anthropic" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY");
  return required.filter((name) => !env[name]?.trim());
}

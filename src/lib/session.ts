// Cookie settings for the Supabase session, shared by src/proxy.ts and lib/supabase.ts.
// The session is only ever read on the server, so page scripts get no access to it (httpOnly),
// which keeps the tokens out of reach of any script injected into a page. No imports, so the
// proxy can use it without pulling in server-only modules.
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

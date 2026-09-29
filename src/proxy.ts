// Login gate for every page and API route (Next.js 16 "proxy", formerly middleware).
// Checks the Supabase session and refreshes its cookies when the access token is due.
// Pages redirect to /login; API routes get a 401 so fetch() callers see a clean error.
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_OPTIONS } from "@/lib/session";

// /api/health is public so an uptime monitor can reach it; it reveals only up or down.
const PUBLIC_PATHS = ["/login", "/signup", "/api/login", "/api/signup", "/api/health"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return new NextResponse("CV Studio is not configured: set SUPABASE_URL and SUPABASE_ANON_KEY (see README.md).", {
      status: 500,
    });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      // A refreshed session must reach both the route handler (via the request) and the browser.
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Must run before returning so a token refresh can write its cookies.
  const { data } = await supabase.auth.getClaims();
  if (data?.claims || PUBLIC_PATHS.includes(pathname)) return response;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Everything except Next's own static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import type { NextConfig } from "next";

// Browser security headers for every response. The CSP allows only this site's own scripts,
// styles, fonts and API. 'unsafe-inline' scripts are needed because Next.js inlines its
// hydration data without a nonce. Development only adds 'unsafe-eval' (fast refresh) and Vercel
// Analytics' debug script; in production Analytics loads from this origin (/_vercel/insights).
const isDev = process.env.NODE_ENV !== "production";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Vercel sets HSTS on its own domains; this also covers a custom domain.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Stops `next dev` appending its own agent-rules block to CLAUDE.md; that file is kept by hand.
  agentRules: false,
  // lib/profile.ts reads the onboarding template at runtime, which the bundler cannot see on
  // its own, so it has to be traced into the deployed API functions explicitly.
  outputFileTracingIncludes: {
    "/api/**": ["./src/data/fact-bank-template.md"],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

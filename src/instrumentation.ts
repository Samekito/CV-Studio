// Next.js server start-up hook (register runs once per server instance) and error hook.
// register: refuses to start a production server with required env vars missing, so a bad
// deploy fails loudly at once rather than on each request. Skipped during `next build`, which
// needs no secrets. In development it only warns, so the app still opens to show the problem.
// onRequestError: any error a route did not handle becomes one structured log line.
import type { Instrumentation } from "next";
import { missingEnvVars } from "./lib/env";

export function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const missing = missingEnvVars();
  if (missing.length === 0) return;
  const message = `CV Studio is missing required environment variables: ${missing.join(", ")}. See .env.example.`;
  if (process.env.NODE_ENV === "production") throw new Error(message);
  console.warn(message);
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "request.unhandled",
      method: request.method,
      path: request.path,
      routeType: context.routeType,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
};

// Structured server logs: one JSON object per line, so a log drain or Vercel's log search can
// filter by field. Every line inside a request carries that request's id and route, and the
// user id once it is known, via AsyncLocalStorage (set up by route() in lib/http.ts).
// Never log request bodies, Fact Banks, CVs or secrets: ids, statuses and messages only.
import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = { requestId: string; route: string; userId?: string };

export const requestContext = new AsyncLocalStorage<RequestContext>();

type Level = "info" | "warn" | "error";

function write(level: Level, event: string, fields: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...requestContext.getStore(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields: Record<string, unknown> = {}) => write("info", event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) => write("warn", event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) => write("error", event, fields),
};

// Records who is calling once auth.ts has verified them, for every later log line in this request.
export function setLogUser(userId: string): void {
  const store = requestContext.getStore();
  if (store) store.userId = userId;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

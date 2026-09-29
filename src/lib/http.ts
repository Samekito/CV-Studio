// Shared plumbing for route handlers: JSON error responses, and route(), which wraps a handler
// so every request gets an id, one summary log line, and a JSON 500 instead of a bare error page
// when something throws. Clients see the request id and can quote it when reporting a problem.
import { NextResponse } from "next/server";
import { errorMessage, log, requestContext } from "./log";

export function jsonError(error: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers });
}

export const bad = (error: string) => jsonError(error, 400);

export function tooMany(error = "Too many attempts. Wait 15 minutes and try again.") {
  return jsonError(error, 429, { "Retry-After": "900" });
}

type Handler = (request: Request) => Promise<Response>;

export function route(name: string, handler: Handler): Handler {
  return (request) => {
    const requestId = crypto.randomUUID();
    return requestContext.run({ requestId, route: name }, async () => {
      const started = Date.now();
      let response: Response;
      try {
        response = await handler(request);
      } catch (err) {
        log.error("request.failed", { error: errorMessage(err) });
        response = NextResponse.json(
          { error: `Something went wrong on our side. Reference: ${requestId.slice(0, 8)}` },
          { status: 500 },
        );
      }
      response.headers.set("x-request-id", requestId);
      log.info("request", { method: request.method, status: response.status, ms: Date.now() - started });
      return response;
    });
  };
}

// The caller's IP. Vercel sets x-real-ip and overwrites x-forwarded-for itself, so clients cannot
// spoof them there. Behind another host, check what it sets before trusting these headers.
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// Browser-side call to POST /api/generate, shared by every page that generates. Turns any
// failure into an Error with a message fit to show, and refreshes the nav's usage count.
import { refreshMe } from "./me-client";

export async function callGenerate<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({ error: "The server returned an unreadable response." }))) as T & {
    error?: string;
  };
  void refreshMe(); // a generation, successful or refunded, may have changed today's count
  if (!res.ok || data.error) throw new Error(data.error ?? `Failed (${res.status}).`);
  return data;
}

// Browser-side access to the logged-in user (GET /api/me). One request per page load is
// shared by the nav and the page; call refreshMe() after saving the profile so both update,
// and clearMe() on login or logout so nothing about the previous person lingers.
import { useEffect, useState } from "react";
import type { Me } from "./types";

let pending: Promise<Me> | null = null;
const listeners = new Set<(me: Me | null) => void>();

async function fetchMe(): Promise<Me> {
  const res = await fetch("/api/me");
  if (!res.ok) {
    pending = null; // let the next caller retry instead of reusing a failure
    throw new Error(`Could not load your account (${res.status}).`);
  }
  return (await res.json()) as Me;
}

export function loadMe(): Promise<Me> {
  pending ??= fetchMe();
  return pending;
}

export async function refreshMe(): Promise<Me> {
  pending = fetchMe();
  const me = await pending;
  for (const listener of listeners) listener(me);
  return me;
}

// enabled=false skips the request, for components that also render on signed-out pages.
export function clearMe(): void {
  pending = null;
  for (const listener of listeners) listener(null);
}

export function useMe(enabled = true): { me: Me | null; error: string } {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    listeners.add(setMe);
    loadMe().then(
      (loaded) => live && setMe(loaded),
      (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not load your account."),
    );
    return () => {
      live = false;
      listeners.delete(setMe);
    };
  }, [enabled]);

  return { me, error };
}

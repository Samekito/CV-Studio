// Browser-side tracker API over /api/applications. Applications live in Supabase, one list per
// user. Before accounts existed the tracker could keep rows in this browser's localStorage;
// localApplications() / importLocalApplications() move any such rows into the account once.
import type { Application, ApplicationDetail } from "./types";

const LOCAL_KEY = "cv-studio.applications";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data;
}

export function listApplications(): Promise<Application[]> {
  return api<Application[]>("/api/applications");
}

// One row with its saved CV and letter, loaded when the row is opened.
export function getApplication(id: string): Promise<ApplicationDetail> {
  return api<ApplicationDetail>(`/api/applications?id=${id}`);
}

export function createApplication(input: Partial<ApplicationDetail> & Pick<Application, "company" | "role">): Promise<Application> {
  return api<Application>("/api/applications", { method: "POST", body: JSON.stringify(input) });
}

export function updateApplication(id: string, patch: Partial<Application>): Promise<Application> {
  return api<Application>(`/api/applications?id=${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteApplication(id: string): Promise<void> {
  await api(`/api/applications?id=${id}`, { method: "DELETE" });
}

export function localApplications(): ApplicationDetail[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as ApplicationDetail[];
  } catch {
    // Corrupt or blocked storage: treat as nothing to import rather than crash the page.
    return [];
  }
}

// Oldest first, so the newest ends up on top of the list. Each row is removed from this browser
// as soon as it is saved, so an interrupted import can be resumed without duplicates.
export async function importLocalApplications(): Promise<number> {
  const rows = [...localApplications()].reverse();
  let imported = 0;
  for (const row of rows) {
    await createApplication(row);
    imported += 1;
    const remaining = localApplications().filter((r) => r.id !== row.id);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(remaining));
  }
  localStorage.removeItem(LOCAL_KEY);
  return imported;
}

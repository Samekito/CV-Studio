// Validation for tracker rows sent by the browser. Kept out of the route file so it can be
// unit-tested. The size limits match the applications_size_limits constraint in
// supabase/migrations/0002_hardening.sql; the database is the backstop, these give readable errors.
import { isTrack, STATUSES, type ApplicationDetail } from "./types";
import { isCv } from "./validate";

export const MAX_APPLICATIONS_PER_USER = 500;

const EDITABLE = ["company", "role", "track", "status", "applied_on", "link", "notes", "cv", "cover_letter"] as const;

const MAX_LENGTH: Partial<Record<(typeof EDITABLE)[number], number>> = {
  company: 200,
  role: 200,
  link: 2000,
  notes: 5000,
  cover_letter: 10000,
};

const MAX_CV_CHARS = 100000;

// Keep only known columns, and reject bad values rather than letting Postgres do it.
export function cleanApplication(input: Record<string, unknown>): Partial<ApplicationDetail> | string {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE) if (key in input) out[key] = input[key];

  if ("status" in out && !STATUSES.includes(out.status as ApplicationDetail["status"])) return "Invalid status.";
  if ("track" in out && out.track !== null && !isTrack(out.track)) return "Invalid track.";
  if ("applied_on" in out && out.applied_on && !/^\d{4}-\d{2}-\d{2}$/.test(String(out.applied_on))) return "Invalid date.";
  for (const key of ["company", "role"] as const) {
    if (key in out && (typeof out[key] !== "string" || !(out[key] as string).trim())) return `${key} is required.`;
  }
  for (const [key, max] of Object.entries(MAX_LENGTH)) {
    const value = out[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return `${key} must be text.`;
    if (value.length > max) return `${key} is too long (${max.toLocaleString()} characters at most).`;
  }
  // Only web links: anything else in a link field is either a mistake or an attempt at a script URL.
  if (typeof out.link === "string" && out.link && !/^https?:\/\//i.test(out.link)) return "The job link must start with http:// or https://.";
  if ("cv" in out && out.cv !== null) {
    if (!isCv(out.cv)) return "The saved CV is not in the expected format.";
    if (JSON.stringify(out.cv).length > MAX_CV_CHARS) return "The saved CV is too large.";
  }
  return out as Partial<ApplicationDetail>;
}

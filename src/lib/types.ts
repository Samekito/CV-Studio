// Shared shapes for what the model returns, what the tracker stores and each user's profile.
// The CV shape is deliberately generic (titled sections of items) so one renderer
// and one .docx builder serve every track.

// Each user has up to three tracks; the keys are fixed, the labels are theirs.
export type Track = "A" | "B" | "C";
export const TRACK_KEYS: Track[] = ["A", "B", "C"];
export const isTrack = (t: unknown): t is Track => t === "A" || t === "B" || t === "C";

export type Tracks = Partial<Record<Track, string>>;

export type Profile = {
  full_name: string;
  tracks: Tracks;
  fact_bank: string;
};

// Name and tracks without the Fact Bank text, for the nav and pages that only need labels.
export type ProfileSummary = Pick<Profile, "full_name" | "tracks">;

// What /api/me returns about the logged-in user. Light on purpose: it loads on every page.
export type Me = {
  userId: string;
  email: string;
  isAdmin: boolean;
  dailyLimit: number | null; // null for the admin, who has no limit
  usedToday: number;
  profile: ProfileSummary | null; // null until onboarding is finished
};

// One row of the Admin page. user_id and disabled are set once the invite has been used.
export type InviteRow = {
  email: string;
  invited_on: string;
  has_code: boolean; // a sign-up code is waiting to be used
  joined: boolean;
  user_id: string | null;
  disabled: boolean;
  used_today: number;
};

export type EventTotal = { name: string; total: number; users: number };

export type AdminData = { dailyLimit: number; invites: InviteRow[]; events: EventTotal[] };

// "Olusola Samuel Junior" + "Acme Ltd" -> "Olusola_Samuel_Junior_Acme_Ltd"
export function fileBase(fullName: string, company: string): string {
  return `${fullName} ${company || "CV"}`.trim().replace(/[^A-Za-z0-9]+/g, "_");
}

export type CvItem = {
  heading?: string; // "Veritas Studio - Verifiable AI Content Studio"
  subheading?: string; // "FastAPI, React + Vite" or "February 2026 - Present | Remote"
  meta?: string; // "Live: veritas-studio-customer.vercel.app"
  text?: string; // a plain paragraph, used for education lines and similar
  bullets?: string[];
};

export type CvSection = {
  title: string;
  items: CvItem[];
};

export type Cv = {
  name: string;
  headline: string;
  contact: string[];
  summary: string;
  sections: CvSection[];
};

export type TailorResult = {
  track: Track;
  trackReason: string;
  fit: {
    score: number; // 0 to 10
    verdict: string;
    strengths: string[];
    gaps: string[];
  };
  keywordsUsed: string[];
  keywordsNotTrue: string[];
  cv: Cv;
  coverLetter: string;
  // Added by the server after the CV is written (src/lib/fact-check.ts). Missing on results saved
  // in the browser before the check existed.
  factCheck?: FactCheck;
};

// One claim in the CV or letter that the Fact Bank does not support.
export type FactCheckIssue = { text: string; problem: string };

// "unavailable": the checking model failed; the CV is still returned and the page says so.
export type FactCheck = { status: "done"; issues: FactCheckIssue[] } | { status: "unavailable" };

export type AnswersResult = {
  answers: { question: string; answer: string; note?: string }[];
};

export type BioResult = {
  platform: string;
  headline: string;
  bio: string;
  skillsToTag: string[];
  skillsNotToTag: string[];
};

export type ApplicationStatus =
  | "draft"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export const STATUSES: ApplicationStatus[] = [
  "draft",
  "applied",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
];

// A tracker row as listed. The saved CV and letter are left out of the list, because they are
// the bulk of each row; ApplicationDetail adds them when a row is opened.
export type Application = {
  id: string;
  company: string;
  role: string;
  track: Track | null;
  status: ApplicationStatus;
  applied_on: string | null; // YYYY-MM-DD
  link: string | null;
  notes: string | null;
  created_at: string;
};

export type ApplicationDetail = Application & {
  cv: Cv | null;
  cover_letter: string | null;
};

export const APPLICATION_LIST_COLUMNS = "id, company, role, track, status, applied_on, link, notes, created_at";

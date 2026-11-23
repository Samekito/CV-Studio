// Shape checks for untrusted JSON: what the model returns, what the browser restores from
// localStorage, and CVs sent to the tracker. Pages render these fields directly (cv.sections.map,
// fit.score), so anything that fails a check is rejected before it can crash a page.
// Pure functions with no server imports, so pages can use them too.
import {
  isTrack,
  type AnswersResult,
  type BioResult,
  type Cv,
  type CvItem,
  type FactCheck,
  type FactCheckIssue,
  type TailorResult,
} from "./types";

// Loose on purpose: Supabase does the real address validation; this only catches typos.
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strict RFC 4122 layout, so a malformed id is a 400 rather than a database error.
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const optStr = (v: unknown) => v === undefined || isStr(v);

function isCvItem(v: unknown): v is CvItem {
  return (
    isObj(v) &&
    optStr(v.heading) &&
    optStr(v.subheading) &&
    optStr(v.meta) &&
    optStr(v.text) &&
    (v.bullets === undefined || isStrArray(v.bullets))
  );
}

export function isCv(v: unknown): v is Cv {
  return (
    isObj(v) &&
    isStr(v.name) &&
    isStr(v.headline) &&
    isStrArray(v.contact) &&
    isStr(v.summary) &&
    Array.isArray(v.sections) &&
    v.sections.every((s) => isObj(s) && isStr(s.title) && Array.isArray(s.items) && s.items.every(isCvItem))
  );
}

export function isTailorResult(v: unknown): v is TailorResult {
  return (
    isObj(v) &&
    isTrack(v.track) &&
    isStr(v.trackReason) &&
    isObj(v.fit) &&
    typeof v.fit.score === "number" &&
    isStr(v.fit.verdict) &&
    isStrArray(v.fit.strengths) &&
    isStrArray(v.fit.gaps) &&
    isStrArray(v.keywordsUsed) &&
    isStrArray(v.keywordsNotTrue) &&
    isCv(v.cv) &&
    isStr(v.coverLetter) &&
    (v.factCheck === undefined || isFactCheck(v.factCheck))
  );
}

const isFactCheckIssue = (v: unknown): v is FactCheckIssue => isObj(v) && isStr(v.text) && isStr(v.problem);

// The checking model's own answer: { issues: [...] }, an empty list when nothing is wrong.
export function isFactCheckAnswer(v: unknown): v is { issues: FactCheckIssue[] } {
  return isObj(v) && Array.isArray(v.issues) && v.issues.every(isFactCheckIssue);
}

export function isFactCheck(v: unknown): v is FactCheck {
  if (!isObj(v)) return false;
  const issuesOk = Array.isArray(v.issues) && v.issues.every(isFactCheckIssue);
  if (v.status === "unavailable") return v.issues === undefined || issuesOk;
  return v.status === "done" && issuesOk;
}

export function isAnswersResult(v: unknown): v is AnswersResult {
  return (
    isObj(v) &&
    Array.isArray(v.answers) &&
    v.answers.every((a) => isObj(a) && isStr(a.question) && isStr(a.answer) && optStr(a.note))
  );
}

export function isBioResult(v: unknown): v is BioResult {
  return (
    isObj(v) &&
    isStr(v.platform) &&
    isStr(v.headline) &&
    isStr(v.bio) &&
    isStrArray(v.skillsToTag) &&
    isStrArray(v.skillsNotToTag)
  );
}

// Onboarding drafts are edited by hand before saving, so only the Fact Bank text is essential.
export function isDraftProfile(v: unknown): v is { full_name?: unknown; tracks?: unknown; fact_bank: string } {
  return isObj(v) && isStr(v.fact_bank) && v.fact_bank.trim().length > 0;
}

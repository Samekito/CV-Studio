import { describe, expect, it } from "vitest";
import {
  EMAIL,
  isAnswersResult,
  isBioResult,
  isCv,
  isDraftProfile,
  isFactCheckAnswer,
  isTailorResult,
  UUID,
} from "./validate";

const cv = {
  name: "JANE TESTER",
  headline: "Support | Zendesk",
  contact: ["jane@example.com"],
  summary: "Four years in SaaS support.",
  sections: [{ title: "EXPERIENCE", items: [{ heading: "Senior Support Agent", bullets: ["Handled 60 tickets a day."] }] }],
};

const tailor = {
  track: "A",
  trackReason: "Support role.",
  fit: { score: 8, verdict: "Apply.", strengths: ["Zendesk"], gaps: [] },
  keywordsUsed: ["Zendesk"],
  keywordsNotTrue: [],
  cv,
  coverLetter: "Dear team,\n\nThanks.",
};

describe("isCv", () => {
  it("accepts a complete CV", () => expect(isCv(cv)).toBe(true));
  it("rejects a CV without sections", () => expect(isCv({ ...cv, sections: undefined })).toBe(false));
  it("rejects contact that is not a list of strings", () => expect(isCv({ ...cv, contact: "jane@example.com" })).toBe(false));
  it("rejects a bullet that is not a string", () =>
    expect(isCv({ ...cv, sections: [{ title: "X", items: [{ bullets: [1] }] }] })).toBe(false));
});

describe("isTailorResult", () => {
  it("accepts a complete result", () => expect(isTailorResult(tailor)).toBe(true));
  it("rejects a missing fit check, the case that used to crash the Tailor page", () =>
    expect(isTailorResult({ ...tailor, fit: undefined })).toBe(false));
  it("rejects an unknown track", () => expect(isTailorResult({ ...tailor, track: "D" })).toBe(false));
  it("rejects a score that is not a number", () =>
    expect(isTailorResult({ ...tailor, fit: { ...tailor.fit, score: "8" } })).toBe(false));
  it("rejects non-objects", () => {
    expect(isTailorResult(null)).toBe(false);
    expect(isTailorResult([])).toBe(false);
  });
  it("accepts each fact check outcome, and results saved before the check existed", () => {
    const issue = { text: "Wrote SQL queries", problem: "Section 3 does not mention SQL." };
    expect(isTailorResult({ ...tailor, factCheck: { status: "done", issues: [issue] } })).toBe(true);
    expect(isTailorResult({ ...tailor, factCheck: { status: "done", issues: [] } })).toBe(true);
    expect(isTailorResult({ ...tailor, factCheck: { status: "unavailable" } })).toBe(true);
    expect(isTailorResult({ ...tailor, factCheck: undefined })).toBe(true);
  });
  it("rejects a damaged fact check rather than crash the page on it", () => {
    expect(isTailorResult({ ...tailor, factCheck: { status: "done" } })).toBe(false);
    expect(isTailorResult({ ...tailor, factCheck: { status: "done", issues: [{ text: "x" }] } })).toBe(false);
    expect(isTailorResult({ ...tailor, factCheck: { status: "other" } })).toBe(false);
  });
});

describe("isFactCheckAnswer", () => {
  it("accepts a list of quoted issues, or an empty list", () => {
    expect(isFactCheckAnswer({ issues: [{ text: "a", problem: "b" }] })).toBe(true);
    expect(isFactCheckAnswer({ issues: [] })).toBe(true);
  });
  it("rejects an answer without the list or with an incomplete issue", () => {
    expect(isFactCheckAnswer({})).toBe(false);
    expect(isFactCheckAnswer({ issues: [{ problem: "b" }] })).toBe(false);
    expect(isFactCheckAnswer({ issues: "none" })).toBe(false);
  });
});

describe("other model results", () => {
  it("checks answers", () => {
    expect(isAnswersResult({ answers: [{ question: "Why?", answer: "Because." }] })).toBe(true);
    expect(isAnswersResult({ answers: [{ question: "Why?" }] })).toBe(false);
  });
  it("checks bios", () => {
    const bio = { platform: "Upwork", headline: "H", bio: "B", skillsToTag: [], skillsNotToTag: [] };
    expect(isBioResult(bio)).toBe(true);
    expect(isBioResult({ ...bio, bio: undefined })).toBe(false);
  });
  it("needs Fact Bank text in a draft profile", () => {
    expect(isDraftProfile({ fact_bank: "# FACT BANK" })).toBe(true);
    expect(isDraftProfile({ fact_bank: "   " })).toBe(false);
    expect(isDraftProfile({ full_name: "Jane" })).toBe(false);
  });
});

describe("patterns", () => {
  it("UUID accepts a real id and refuses look-alikes", () => {
    expect(UUID.test("6fd38883-33c1-49b2-a7e3-c59b7ee9fb03")).toBe(true);
    expect(UUID.test("-".repeat(36))).toBe(false);
    expect(UUID.test("6fd38883-33c1-49b2-a7e3-c59b7ee9fb0")).toBe(false);
  });
  it("EMAIL catches obvious typos", () => {
    expect(EMAIL.test("a@b.co")).toBe(true);
    expect(EMAIL.test("nope")).toBe(false);
    expect(EMAIL.test("a b@c.d")).toBe(false);
  });
});

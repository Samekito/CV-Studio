import { describe, expect, it } from "vitest";
import { EMAIL, isAnswersResult, isBioResult, isCv, isDraftProfile, isTailorResult, UUID } from "./validate";

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

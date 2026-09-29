import { describe, expect, it } from "vitest";
import { cleanApplication } from "./applications";

describe("cleanApplication", () => {
  it("keeps only known columns", () => {
    const out = cleanApplication({ company: "Acme", role: "Lead", user_id: "someone-else", id: "x" });
    expect(out).toEqual({ company: "Acme", role: "Lead" });
  });

  it("rejects an unknown status or track", () => {
    expect(cleanApplication({ status: "hired" })).toBe("Invalid status.");
    expect(cleanApplication({ track: "D" })).toBe("Invalid track.");
  });

  it("allows clearing the track", () => {
    expect(cleanApplication({ track: null })).toEqual({ track: null });
  });

  it("rejects blank company or role", () => {
    expect(cleanApplication({ company: "   " })).toBe("company is required.");
  });

  it("only accepts web links", () => {
    expect(cleanApplication({ link: "https://example.com/job" })).toEqual({ link: "https://example.com/job" });
    expect(typeof cleanApplication({ link: "javascript:alert(1)" })).toBe("string");
    expect(cleanApplication({ link: null })).toEqual({ link: null });
  });

  it("enforces field lengths", () => {
    expect(cleanApplication({ notes: "x".repeat(5000) })).toEqual({ notes: "x".repeat(5000) });
    expect(typeof cleanApplication({ notes: "x".repeat(5001) })).toBe("string");
  });

  it("rejects a malformed saved CV", () => {
    expect(cleanApplication({ cv: { name: "Only a name" } })).toBe("The saved CV is not in the expected format.");
  });

  it("rejects a badly formatted date", () => {
    expect(cleanApplication({ applied_on: "27/09/2026" })).toBe("Invalid date.");
    expect(cleanApplication({ applied_on: "2026-09-27" })).toEqual({ applied_on: "2026-09-27" });
  });
});

// The exact half of the fact check, on cases seen in real generated CVs (2026-11): an
// UNCONFIRMED start year, a link with its dots turned into hyphens, an inflated member count.
import { describe, expect, it } from "vitest";
import { exactCheck } from "./exact-check";

const factBank = `# FACT BANK - Jane Tester

## 2. Positioning rules (non-negotiable)
1. Never claim 99 years of experience.

## 3. Fact Bank (confirmed - the only source of truth)
- **Email (for CVs):** Jane.Tester@example.com
- **Phone:** +44 7700 900123
- **LinkedIn:** linkedin.com/in/jane-tester
- **Portfolio:** https://jane-portfolio.vercel.app
- B.Sc Computing, graduated November 2024.
- Grew a community from 0 to 5,000+ members.
- Wrote a 52-test suite. Built on Next.js and Node.js.

## 4. UNCONFIRMED - do not use until the candidate confirms
- University 2019 - 2024.
- "10,000+ members" in total.

## 5. Writing style
- Numbers over adjectives.
`;

const problems = (text: string) => exactCheck(factBank, text).map((i) => i.problem);

describe("exactCheck, numbers and years", () => {
  it("flags a year that is only UNCONFIRMED", () => {
    expect(exactCheck(factBank, "B.Sc Computing | 2019 - 2024")).toEqual([
      { text: "B.Sc Computing | 2019 - 2024", problem: '"2019" appears only in section 4 (UNCONFIRMED) of your Fact Bank.' },
    ]);
  });
  it("flags a number found nowhere in section 3, even if section 2 mentions it", () => {
    expect(problems("Over 99 years of QA.")).toEqual(['"99" is not in section 3 of your Fact Bank.']);
  });
  it("accepts confirmed numbers however the commas are written", () => {
    expect(exactCheck(factBank, "Grew a community to 5000+ members; 52 tests; class of 2024.")).toEqual([]);
  });
  it("flags an inflated count from section 4", () => {
    expect(problems("Led 10,000+ members.")).toEqual(['"10,000" appears only in section 4 (UNCONFIRMED) of your Fact Bank.']);
  });
  it("ignores single digits, which are too common to check", () => {
    expect(exactCheck(factBank, "Ran 3 tracks with 5 people.")).toEqual([]);
  });
  it("does not read a phone number's digits as claims", () => {
    expect(exactCheck(factBank, "+44 7700 900123")).toEqual([]);
  });
  it("lists a repeated finding once", () => {
    expect(exactCheck(factBank, "Since 2019.\nAgain, 2019.")).toHaveLength(1);
  });
});

describe("exactCheck, links and emails", () => {
  it("accepts a confirmed link with or without https, www or a trailing slash", () => {
    expect(exactCheck(factBank, "https://www.jane-portfolio.vercel.app/ | LINKEDIN.com/in/jane-tester")).toEqual([]);
  });
  it("names the real link when the CV's version is mangled", () => {
    expect(problems("Portfolio: jane-portfolio-vercel-app")).toEqual([
      "This link does not match your Fact Bank, which has jane-portfolio.vercel.app.",
    ]);
  });
  it("flags a real link written with look-alike hyphens, which break when copied", () => {
    expect(exactCheck(factBank, "Portfolio: jane‑portfolio.vercel.app")).toEqual([
      {
        text: "Portfolio: jane‑portfolio.vercel.app",
        problem: "This link uses a look-alike hyphen, so it will not work if copied. Retype it as jane-portfolio.vercel.app.",
      },
    ]);
  });
  it("does not flag look-alike hyphens outside links", () => {
    expect(exactCheck(factBank, "Wrote a 52‑test suite – 2024")).toEqual([]);
  });
  it("flags a link that is not in the Fact Bank at all", () => {
    expect(problems("See github.com/someone-else")).toEqual(["The link github.com/someone-else is not in section 3 of your Fact Bank."]);
  });
  it("does not mistake framework names for links", () => {
    expect(exactCheck(factBank, "Built on Next.js and Node.js.")).toEqual([]);
  });
  it("accepts the confirmed email in any case, and flags another", () => {
    expect(exactCheck(factBank, "jane.tester@example.com")).toEqual([]);
    expect(problems("jane@other.com")).toEqual(["The email address jane@other.com is not in section 3 of your Fact Bank."]);
  });
});

describe("exactCheck, Fact Banks without numbered sections", () => {
  it("treats the whole text as confirmed", () => {
    expect(exactCheck("Worked at Acme 2018 to 2022.", "Acme, 2018 to 2022")).toEqual([]);
    expect(exactCheck("Worked at Acme 2018 to 2022.", "Acme, 2017 to 2022")).toHaveLength(1);
  });
});

describe("exactCheck, quoting", () => {
  it("quotes a short window of a long line, so the user can find it", () => {
    const long = `${"word ".repeat(40)}joined in 2019 ${"more ".repeat(40)}`;
    const [issue] = exactCheck(factBank, long);
    expect(issue.text).toContain("joined in 2019");
    expect(issue.text.length).toBeLessThan(160);
    expect(issue.text.startsWith("...")).toBe(true);
  });
});

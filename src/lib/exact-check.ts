// The exact half of the fact check: plain code, no model call, so it is instant, free and never
// "busy". It flags numbers, years, links and email addresses in a tailored CV or cover letter
// that do not appear word for word in section 3 of the user's Fact Bank. The model check
// (src/lib/fact-check.ts) is weakest at exactly these details, for example an UNCONFIRMED start
// year or a link with its dots turned into hyphens.
// Pure functions with no server imports, so the unit tests run them directly.
import type { FactCheckIssue } from "./types";

// Prompts and the template number Fact Bank sections ("## 3. Fact Bank", "## 4. UNCONFIRMED"),
// and architecture rule 2 keeps that numbering stable.
function section(factBank: string, n: number): string | null {
  const start = factBank.search(new RegExp(`^##\\s*${n}\\.`, "m"));
  if (start === -1) return null;
  const rest = factBank.slice(start + 3);
  const end = rest.search(/^##\s*\d+\./m);
  return end === -1 ? rest : rest.slice(0, end);
}

// Only domains ending in one of these count as links, so "Node.js" and "Next.js" do not.
const URL_RE =
  /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|org|net|io|app|dev|co|ai|me|ng|uk|xyz|gg|tech|site|so|to|tv|info|edu|gov)(?:\/[^\s|,;)"']*)?/gi;
const LOOKALIKE_HYPHENS = /[‐-―−]/g;
const EMAIL_RE =/[^\s@|,;:()"']+@[^\s@|,;:()"']+\.[a-z]{2,}/gi;
// "5,000", "52", "2019", "3.5". Single digits are skipped when checking: too common to be useful.
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

const normaliseLink = (link: string) =>
  link.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/.,]+$/, "");
const normaliseNumber = (n: string) => n.replace(/,/g, "").replace(/\.$/, "");
// Letters and digits only: "veritas-studio-customer-vercel-app" and the real
// "veritas-studio-customer.vercel.app" share this key, which is how a mangled link is spotted.
const linkKey = (s: string) => s.toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]/g, "");

function numbersIn(text: string): Set<string> {
  return new Set([...text.matchAll(NUMBER_RE)].map((m) => normaliseNumber(m[0])));
}

// About ten words either side of the finding, so the user can find it in the CV.
function quote(line: string, index: number, length: number): string {
  if (line.length <= 160) return line.trim();
  const from = Math.max(0, line.lastIndexOf(" ", Math.max(0, index - 60)));
  const toSpace = line.indexOf(" ", Math.min(line.length, index + length + 60));
  const to = toSpace === -1 ? line.length : toSpace;
  return `${from > 0 ? "..." : ""}${line.slice(from, to).trim()}${to < line.length ? "..." : ""}`;
}

export function exactCheck(factBank: string, documentText: string): FactCheckIssue[] {
  const unconfirmed = section(factBank, 4) ?? "";
  // A free-form Fact Bank without numbered sections: everything but section 4 counts.
  const confirmed = section(factBank, 3) ?? factBank.replace(unconfirmed, "");

  const factLinks = [...confirmed.matchAll(URL_RE)].map((m) => normaliseLink(m[0]));
  const factLinkSet = new Set(factLinks);
  const factLinkByKey = new Map(factLinks.map((l) => [linkKey(l), l]));
  const factEmails = new Set([...confirmed.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase()));
  const factNumbers = numbersIn(confirmed);
  const unconfirmedNumbers = numbersIn(unconfirmed);

  const issues: FactCheckIssue[] = [];
  const seen = new Set<string>(); // one issue per distinct finding, at its first appearance

  const flag = (key: string, line: string, index: number, length: number, problem: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ text: quote(line, index, length), problem });
  };

  for (const original of documentText.split("\n")) {
    // Models write links with look-alike hyphens (U+2010 to U+2015, U+2212): they look right but
    // break when copied. Each is one character, so swapping them keeps every position the same.
    const line = original.replace(LOOKALIKE_HYPHENS, "-");
    // Links and emails are checked whole, then blanked out so their digits are not read as numbers.
    let rest = line;
    for (const m of line.matchAll(EMAIL_RE)) {
      if (!factEmails.has(m[0].toLowerCase())) {
        flag(`email:${m[0].toLowerCase()}`, line, m.index, m[0].length, `The email address ${m[0]} is not in section 3 of your Fact Bank.`);
      }
      rest = rest.replace(m[0], " ".repeat(m[0].length));
    }
    for (const m of rest.matchAll(URL_RE)) {
      const link = normaliseLink(m[0]);
      const asWritten = original.slice(m.index, m.index + m[0].length);
      if (factLinkSet.has(link) && asWritten !== m[0]) {
        flag(
          `lookalike:${link}`,
          original,
          m.index,
          m[0].length,
          `This link uses a look-alike hyphen, so it will not work if copied. Retype it as ${link}.`,
        );
      } else if (!factLinkSet.has(link)) {
        const real = factLinkByKey.get(linkKey(link));
        flag(
          `link:${link}`,
          line,
          m.index,
          m[0].length,
          real ? `This link does not match your Fact Bank, which has ${real}.` : `The link ${link} is not in section 3 of your Fact Bank.`,
        );
      }
      rest = rest.replace(m[0], " ".repeat(m[0].length));
    }
    // A real link with its dots replaced no longer looks like a link, so look for those by key.
    for (const m of rest.matchAll(/[a-z0-9][a-z0-9-]{8,}[a-z0-9]/gi)) {
      const real = factLinkByKey.get(linkKey(m[0]));
      if (real && m[0].includes("-")) {
        flag(`link:${m[0].toLowerCase()}`, line, m.index, m[0].length, `This link does not match your Fact Bank, which has ${real}.`);
        rest = rest.replace(m[0], " ".repeat(m[0].length));
      }
    }
    for (const m of rest.matchAll(NUMBER_RE)) {
      const n = normaliseNumber(m[0]);
      if (Number(n) < 10 || factNumbers.has(n)) continue;
      flag(
        `number:${n}`,
        line,
        m.index,
        m[0].length,
        unconfirmedNumbers.has(n)
          ? `"${m[0]}" appears only in section 4 (UNCONFIRMED) of your Fact Bank.`
          : `"${m[0]}" is not in section 3 of your Fact Bank.`,
      );
    }
  }
  return issues;
}

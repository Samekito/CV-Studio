// Reads the full name and track labels out of a pasted Fact Bank, so someone who already has one
// does not retype them. Matches the layout of src/data/fact-bank-template.md:
//   - **Name:** Jane Doe
//   | **A. Customer Support** | ... |
// Anything it cannot find is left for the user to fill in.
import type { Profile, Tracks } from "./types";

const NAME_LINE = /^\s*-\s*\*\*Name:\*\*\s*(.+?)\s*$/m;
const TRACK_ROW = /^\|\s*\*\*([ABC])\.\s*(.+?)\*\*\s*\|/gm;

export function profileFromFactBank(factBank: string): Profile {
  const tracks: Tracks = {};
  for (const [, key, label] of factBank.matchAll(TRACK_ROW)) {
    tracks[key as keyof Tracks] ??= label.trim();
  }
  return {
    full_name: factBank.match(NAME_LINE)?.[1] ?? "",
    tracks,
    fact_bank: factBank,
  };
}

// Prompt builders for the generation modes. The user's Fact Bank is always the system
// prompt; each mode appends the task and the exact JSON shape to return. Onboarding is the one
// exception: the user has no Fact Bank yet, so draftProfileSystemPrompt builds one from the template.
import type { Track, Tracks } from "./types";

const TRUTH_RULES = `
HARD RULES FOR THIS TASK
- Use ONLY facts from the Fact Bank (section 3). Never invent employers, dates, numbers, tools, skills or achievements.
- You may rephrase, shorten, reorder and choose which facts to include. You may NOT add detail the Fact Bank does not state: no extra test types, bug types, attack types, outcomes, results ("zero regressions"), scope ("across the entire flow"), collaboration or teamwork claims, or tools. If a job asks for something the Fact Bank does not cover, it goes in "gaps", never into the CV or letter.
- Before answering, check every bullet and every cover-letter sentence against section 3 and delete any detail you cannot point to there.
- Never use anything from section 4 (UNCONFIRMED).
- Obey every positioning rule in section 2 and the writing style in section 5.
- No em dashes or en dashes anywhere. Use " - " (spaced hyphen) instead.
- Return ONLY one JSON object, no prose before or after it, no code fence.
`;

export function systemPrompt(brain: string): string {
  return `${brain}\n\n---\n${TRUTH_RULES}`;
}

const CV_SHAPE = `{
  "name": "the candidate's full name from section 3, in capitals",
  "headline": "string, 3-4 phrases separated by ' | '",
  "contact": ["one string per contact-line segment, e.g. email, phone, location, LinkedIn, GitHub, portfolio for track C"],
  "summary": "3-5 sentences tailored to this job",
  "sections": [
    {
      "title": "UPPERCASE SECTION TITLE",
      "items": [
        {
          "heading": "optional bold line, e.g. project or role name",
          "subheading": "optional, e.g. tech used or dates and location",
          "meta": "optional, e.g. live link and repo",
          "text": "optional plain paragraph",
          "bullets": ["optional bullet strings"]
        }
      ]
    }
  ]
}`;

function trackList(tracks: Tracks): string {
  return Object.entries(tracks)
    .map(([key, label]) => `${key} = ${label}`)
    .join("; ");
}

export function tailorPrompt(jobAd: string, track: Track | "auto", extra: string, tracks: Tracks): string {
  const keys = Object.keys(tracks).join(", ");
  const trackLine =
    track === "auto"
      ? `Pick the best of the candidate's tracks (${trackList(tracks)}) for this job.`
      : `Use track ${track} (${tracks[track]}). If it is clearly a poor fit, still use it but say so in trackReason.`;

  return `JOB AD:
"""
${jobAd}
"""
${extra ? `\nEXTRA INSTRUCTIONS FROM THE CANDIDATE:\n"""\n${extra}\n"""\n` : ""}
TASK: ${trackLine} Write a tailored two-page CV following section 6, mirroring the job ad's keywords only where they are true. Then a cover letter under 250 words, first person, ending with the most relevant live link. Score the fit honestly. If the job is one section 2 says the candidate must not be positioned for, give a score of 3 or lower and say why in the verdict.

Return this JSON:
{
  "track": "one of ${keys}",
  "trackReason": "one sentence",
  "fit": {
    "score": 0-10 integer,
    "verdict": "one or two sentences: apply or not, and why",
    "strengths": ["3 strongest matches, each tied to a Fact Bank item"],
    "gaps": ["requirements the candidate does not meet, stated plainly"]
  },
  "keywordsUsed": ["job-ad keywords used in the CV"],
  "keywordsNotTrue": ["job-ad keywords deliberately left out because they are not true for the candidate"],
  "cv": ${CV_SHAPE},
  "coverLetter": "plain text with \\n\\n between paragraphs"
}`;
}

export function answersPrompt(jobAd: string, questions: string): string {
  return `${jobAd ? `JOB AD (context):\n"""\n${jobAd}\n"""\n\n` : ""}APPLICATION QUESTIONS:
"""
${questions}
"""

TASK: Answer each question honestly from the Fact Bank, in the candidate's first-person voice, specific and short (under 150 words unless the question asks for more). For yes/no or dropdown-style questions, give the direct answer first. Follow the interview guardrails in section 7. If a question asks about experience the candidate does not have, say so plainly and pivot to the closest true thing. Use "note" to flag anything the candidate must check or fill in themselves (for example a date or a choice only they can make).

Return this JSON:
{
  "answers": [
    { "question": "the question as asked", "answer": "the answer", "note": "optional" }
  ]
}`;
}

export function bioPrompt(platform: string, track: Track, limit: number, jobAd: string, tracks: Tracks): string {
  return `PLATFORM: ${platform}
TRACK: ${track} (${tracks[track]})
CHARACTER LIMIT FOR THE BIO: ${limit}
${jobAd ? `\nTARGET ROLE OR CLIENT (optional context):\n"""\n${jobAd}\n"""\n` : ""}
TASK: Write the candidate's profile for this platform following sections 2, 5 and 8. The headline must be under 120 characters. The bio must be under the character limit, first person, specific, with live links where they help. List the skills to tag (only true ones) and the skills they must NOT tag on this platform and why they are excluded.

Return this JSON:
{
  "platform": "${platform}",
  "headline": "string",
  "bio": "plain text with \\n\\n between paragraphs",
  "skillsToTag": ["string"],
  "skillsNotToTag": ["string - short reason"]
}`;
}

// Onboarding: turn a pasted CV into a first-draft profile in the template's 9-section layout.
// The template's section numbers matter, the other prompts refer to them.
// today (YYYY-MM-DD) stops the model treating recent CV dates as future dates or typos.
export function draftProfileSystemPrompt(template: string, today: string): string {
  return `You turn a person's existing CV into their CV Studio Fact Bank. You are careful and literal.

Today's date is ${today}. Any date on or before it is in the past; never flag it as a typo or as unlikely.

HARD RULES
- Use ONLY what the pasted CV states. Never invent employers, dates, numbers, tools, skills, links or achievements.
- Anything the CV implies but does not state plainly goes in section 4 (UNCONFIRMED), never in section 3.
- Keep the template's headings and section numbers exactly. Replace every placeholder in square brackets; delete a line rather than leave a placeholder or guess.
- Section 2: write positioning rules only from what the CV makes clear (for example roles it clearly does not support). Keep them few.
- Tracks: 1 to 3 distinct kinds of role this person can honestly apply for, keyed A, B, C. Short labels, 2 to 4 words.
- No em dashes or en dashes anywhere. Use " - " (spaced hyphen) instead.
- Return ONLY one JSON object, no prose before or after it, no code fence.

TEMPLATE
"""
${template}
"""`;
}

export function draftProfilePrompt(cvText: string): string {
  return `EXISTING CV:
"""
${cvText}
"""

TASK: Fill in the template from this CV.

Return this JSON:
{
  "full_name": "the person's name as written on the CV",
  "tracks": { "A": "short label", "B": "optional", "C": "optional" },
  "fact_bank": "the completed template, as markdown"
}`;
}

// Fact check on a tailored CV, so the Tailor page can show what the user's Fact Bank does not
// back up. Two halves: the exact check (src/lib/exact-check.ts: numbers, years, links, emails,
// plain code) and a model call that judges wording. Called by /api/generate inside the same
// request (and the same daily-limit claim) as the CV itself.
// Best effort: a failed model check never fails the CV. The exact findings are returned either
// way, and the page says the model half did not run.
import { exactCheck } from "./exact-check";
import { generateJson } from "./llm";
import { errorMessage, log } from "./log";
import { cvAsText, factCheckPrompt, systemPrompt } from "./prompts";
import type { FactCheck, TailorResult } from "./types";
import { isFactCheckAnswer } from "./validate";

// More than this is a CV to regenerate, not a list to work through.
const MAX_ISSUES = 20;

export async function factCheck(factBank: string, result: TailorResult): Promise<FactCheck> {
  const exact = exactCheck(factBank, `${cvAsText(result.cv)}\n${result.coverLetter}`).slice(0, MAX_ISSUES);
  try {
    const answer = await generateJson(systemPrompt(factBank), factCheckPrompt(result.cv, result.coverLetter), "check");
    if (!isFactCheckAnswer(answer)) throw new Error("the checking model returned an incomplete answer");
    log.info("factcheck.done", { exact: exact.length, model: answer.issues.length });
    // The exact findings are certain, so a model finding quoting the same words adds nothing.
    const quoted = new Set(exact.map((issue) => issue.text));
    const fromModel = answer.issues.filter((issue) => !quoted.has(issue.text)).slice(0, MAX_ISSUES);
    return { status: "done", issues: [...exact, ...fromModel] };
  } catch (err) {
    log.warn("factcheck.failed", { exact: exact.length, error: errorMessage(err) });
    return { status: "unavailable", issues: exact };
  }
}

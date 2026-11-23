// Second pass over a tailored CV: asks a model to list every claim the user's Fact Bank does not
// support, so the Tailor page can show them next to the CV. Called by /api/generate inside the
// same request (and the same daily-limit claim) as the CV itself.
// Best effort: a failed check never fails the CV. The page says the check did not run instead.
import { generateJson } from "./llm";
import { errorMessage, log } from "./log";
import { factCheckPrompt, systemPrompt } from "./prompts";
import type { FactCheck, TailorResult } from "./types";
import { isFactCheckAnswer } from "./validate";

// More than this is a CV to regenerate, not a list to work through.
const MAX_ISSUES = 20;

export async function factCheck(factBank: string, result: TailorResult): Promise<FactCheck> {
  try {
    const answer = await generateJson(systemPrompt(factBank), factCheckPrompt(result.cv, result.coverLetter), "check");
    if (!isFactCheckAnswer(answer)) throw new Error("the checking model returned an incomplete answer");
    log.info("factcheck.done", { issues: answer.issues.length });
    return { status: "done", issues: answer.issues.slice(0, MAX_ISSUES) };
  } catch (err) {
    log.warn("factcheck.failed", { error: errorMessage(err) });
    return { status: "unavailable" };
  }
}

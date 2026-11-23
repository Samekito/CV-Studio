// POST /api/generate - the one model-calling endpoint.
// mode "tailor"        -> TailorResult (CV + cover letter + fit check + fact check)
// mode "answers"       -> AnswersResult (screening questions)
// mode "bio"           -> BioResult (platform profile copy)
// mode "draft_profile" -> Profile (onboarding: first draft of a Fact Bank from a pasted CV)
// Every mode but draft_profile runs on the caller's own Fact Bank. Every mode counts
// towards the caller's daily limit, and a failed or malformed model answer gives it back.
import { NextResponse } from "next/server";
import { currentUser, notLoggedIn } from "@/lib/auth";
import { recordEvent, type EventName } from "@/lib/events";
import { factCheck } from "@/lib/fact-check";
import { bad, jsonError, route } from "@/lib/http";
import { generateJson, LlmError } from "@/lib/llm";
import { errorMessage, log } from "@/lib/log";
import { factBankTemplate, getProfile } from "@/lib/profile";
import {
  answersPrompt,
  bioPrompt,
  draftProfilePrompt,
  draftProfileSystemPrompt,
  systemPrompt,
  tailorPrompt,
} from "@/lib/prompts";
import { isTrack, type TailorResult } from "@/lib/types";
import { claimGeneration, dailyLimit, releaseGeneration } from "@/lib/usage";
import { isAnswersResult, isBioResult, isDraftProfile, isTailorResult } from "@/lib/validate";

// A thinking model writing a full CV can take a minute or more.
export const maxDuration = 300;

const MAX_INPUT = 20000; // characters; a long job ad is about 6,000

type Mode = "tailor" | "answers" | "bio" | "draft_profile";

// What each mode's answer must look like before any page is allowed to render it.
const SHAPE_CHECK: Record<Mode, (v: unknown) => boolean> = {
  tailor: isTailorResult,
  answers: isAnswersResult,
  bio: isBioResult,
  draft_profile: isDraftProfile,
};

type Body = {
  mode?: string;
  jobAd?: string;
  track?: string;
  extra?: string;
  questions?: string;
  platform?: string;
  limit?: number;
  cvText?: string;
};

export const POST = route("generate", async (request) => {
  const user = await currentUser();
  if (!user) return notLoggedIn();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return bad("Request body must be JSON.");

  const jobAd = (body.jobAd ?? "").trim();
  const extra = (body.extra ?? "").trim();
  const questions = (body.questions ?? "").trim();
  const cvText = (body.cvText ?? "").trim();
  if ([jobAd, extra, questions, cvText].some((s) => s.length > MAX_INPUT)) {
    return bad(`Each text box is limited to ${MAX_INPUT.toLocaleString()} characters.`);
  }

  let mode: Mode;
  let system: string;
  let userPrompt: string;
  let factBank = ""; // the caller's own, for the tailor fact check
  if (body.mode === "draft_profile") {
    if (cvText.length < 200) return bad("Paste your whole CV (at least a few paragraphs).");
    mode = "draft_profile";
    system = draftProfileSystemPrompt(await factBankTemplate(), new Date().toISOString().slice(0, 10));
    userPrompt = draftProfilePrompt(cvText);
  } else {
    const profile = await getProfile();
    if (!profile) return jsonError("Set up your Fact Bank first.", 409);
    const { tracks } = profile;
    const hasTrack = (t: unknown) => isTrack(t) && Boolean(tracks[t]);
    factBank = profile.fact_bank;
    system = systemPrompt(factBank);

    switch (body.mode) {
      case "tailor": {
        if (jobAd.length < 50) return bad("Paste the full job ad (at least a few lines).");
        const track = isTrack(body.track) && hasTrack(body.track) ? body.track : "auto";
        mode = "tailor";
        userPrompt = tailorPrompt(jobAd, track, extra, tracks);
        break;
      }
      case "answers":
        if (!questions) return bad("Paste at least one question.");
        mode = "answers";
        userPrompt = answersPrompt(jobAd, questions);
        break;
      case "bio": {
        const platform = (body.platform ?? "").trim();
        if (!platform) return bad("Choose a platform.");
        if (!isTrack(body.track) || !hasTrack(body.track)) return bad("Choose a track.");
        const limit = Math.min(Math.max(Number(body.limit) || 1200, 200), 5000);
        mode = "bio";
        userPrompt = bioPrompt(platform.slice(0, 80), body.track, limit, jobAd, tracks);
        break;
      }
      default:
        return bad("Unknown mode.");
    }
  }

  if (!(await claimGeneration(user))) {
    const limit = dailyLimit();
    return jsonError(`You have reached today's limit of ${limit} generation${limit === 1 ? "" : "s"}. It resets at midnight UTC.`, 429);
  }

  try {
    const result = await generateJson(system, userPrompt);
    if (!SHAPE_CHECK[mode](result)) throw new LlmError("The AI returned an incomplete answer. Try again.");
    await recordEvent(`generate.${mode}` as EventName, user.id);
    if (mode === "tailor") {
      const tailored = result as TailorResult;
      return NextResponse.json({ ...tailored, factCheck: await factCheck(factBank, tailored) });
    }
    return NextResponse.json(result);
  } catch (err) {
    await releaseGeneration(user);
    await recordEvent("generate.failed", user.id);
    log.error("generate.failed", { mode, error: errorMessage(err) });
    const message = err instanceof LlmError ? err.message : "Generation failed. Try again in a minute.";
    return jsonError(message, 502);
  }
});

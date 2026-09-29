// One entry point for the model call, so the rest of the app never knows which provider runs.
// LLM_PROVIDER picks it: "gemini" (default) or "anthropic". Both bill per use on a paid key.
// Server-only: reads API keys from the environment. Imported by route handlers only.
import Anthropic from "@anthropic-ai/sdk";
import { log } from "./log";

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
// Tried in order when the main model is overloaded. Override with a comma-separated
// GEMINI_FALLBACK_MODELS; set it to an empty string to disable fallbacks.
const DEFAULT_GEMINI_FALLBACKS = "gemini-3.7-flash,gemini-flash-latest";

function fallbackGeminiModels(): string[] {
  return (process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_GEMINI_FALLBACKS)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

export class LlmError extends Error {}

export function activeProvider(): { provider: string; model: string } {
  if ((process.env.LLM_PROVIDER ?? "gemini") === "anthropic") {
    return { provider: "anthropic", model: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL };
  }
  return { provider: "gemini", model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL };
}

// Returns the parsed JSON object the model produced.
export async function generateJson(system: string, user: string): Promise<unknown> {
  const { provider, model } = activeProvider();
  const text =
    provider === "anthropic"
      ? await callAnthropic(system, user, model)
      : await callGemini(system, user, model);
  return parseJsonObject(text);
}

// Gemini's 429 body names the quota that ran out and how long to wait ("retryDelay": "47s").
// A per-day quota does not clear by waiting, so it moves straight on to the next model.
export function isDailyQuota(body: string): boolean {
  return body.includes("PerDay");
}

export function retryDelayMs(body: string): number | null {
  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return match ? Math.round(Number(match[1]) * 1000) : null;
}

// Retrying beyond this only makes the user wait longer for the same failure.
const RETRY_BUDGET_MS = 20000;
const MAX_SINGLE_WAIT_MS = 8000;
const DEFAULT_WAIT_MS = 3000;

async function callGemini(system: string, user: string, model: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new LlmError("GEMINI_API_KEY is not set.");

  const request = (modelName: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        // The model thinks before answering and thinking counts against this cap, so leave headroom.
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 32000 },
      }),
    });

  // 503 (overloaded) and 429 (rate limit) often hit one model while others are fine: try each
  // model up to twice, honouring Google's retry delay, then move to the next, within one budget.
  const models = [model, ...fallbackGeminiModels().filter((m) => m !== model)];
  const isBusy = (status: number) => status === 503 || status === 429 || status === 500;
  const started = Date.now();
  let last = { status: 0, body: "" };

  for (const modelName of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await request(modelName);
      if (res.ok) return geminiText(await res.json());

      last = { status: res.status, body: await res.text() };
      if (!isBusy(res.status)) {
        log.error("gemini.error", { model: modelName, status: res.status, detail: last.body.slice(0, 1000) });
        throw new LlmError(`The AI provider returned an error (${res.status}). Try again in a minute.`);
      }
      log.warn("gemini.busy", { model: modelName, attempt, status: res.status, daily: isDailyQuota(last.body) });
      if (res.status === 429 && isDailyQuota(last.body)) break;

      const wait = (res.status === 429 ? retryDelayMs(last.body) : null) ?? DEFAULT_WAIT_MS;
      if (attempt === 2 || wait > MAX_SINGLE_WAIT_MS || Date.now() - started + wait > RETRY_BUDGET_MS) break;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    if (Date.now() - started > RETRY_BUDGET_MS) break;
  }

  if (last.status === 429) {
    // The body names the quota that ran out (per minute or per day, free or paid tier). It stays in
    // the server log; users get the short message.
    log.warn("gemini.rate_limited", { detail: last.body.slice(0, 1500) });
    if (isDailyQuota(last.body)) {
      throw new LlmError("The AI provider's daily quota is used up. Try again tomorrow, or ask the admin to raise it.");
    }
    throw new LlmError("Gemini's rate limit was hit. Wait a minute and try again.");
  }
  throw new LlmError("Gemini is busy right now. Wait a minute and try again.");
}

function geminiText(data: unknown): string {
  const response = data as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  };
  const candidate = response.candidates?.[0];
  // Skip thought-summary parts; only the answer parts carry the JSON.
  const text = candidate?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new LlmError(`Gemini returned no text (finish reason: ${candidate?.finishReason ?? "unknown"}).`);
  return text;
}

async function callAnthropic(system: string, user: string, model: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new LlmError("ANTHROPIC_API_KEY is not set.");
  const client = new Anthropic();

  // Streaming keeps a long CV generation clear of HTTP timeouts. fallbacks: "default"
  // re-runs a request a safety classifier declined on Anthropic's recommended model.
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system,
    messages: [{ role: "user", content: user }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw new LlmError("The model declined this request.");
  if (message.stop_reason === "max_tokens") throw new LlmError("The response was cut off. Try a shorter job ad.");
  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  if (!text) throw new LlmError("Claude returned no text.");
  return text;
}

// Models sometimes wrap JSON in a code fence or a sentence; take the outermost object.
function parseJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new LlmError("The model did not return JSON.");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new LlmError("The model returned malformed JSON. Try again.");
  }
}

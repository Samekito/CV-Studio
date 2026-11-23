// One entry point for the model call, so the rest of the app never knows which provider runs.
// LLM_PROVIDER picks the main one: "gemini" (default) or "anthropic". Groq (optional, free tier,
// GROQ_API_KEY) is the backup when Gemini is busy and the model that fact-checks each CV.
// Server-only: reads API keys from the environment. Imported by route handlers only.
import Anthropic from "@anthropic-ai/sdk";
import { errorMessage, log } from "./log";

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
// Picked by testing on hand-reviewed CVs (2026-11). gpt-oss-120b is the only free Groq model that
// reliably returned a complete CV, and its flags as a checker were short and all genuine. qwen
// refuses free-tier requests that could produce over 1,000 output tokens (a CV needs about 2,200)
// and wrote its reasoning into the check's answers; gpt-oss-20b returned broken JSON.
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_GROQ_CHECK_MODEL = "openai/gpt-oss-120b";

// Google sometimes accepts a request and then never answers. Without a ceiling the app waited
// until Vercel killed the request at 300 s, and the backups were never tried. Groq answers in
// seconds, so its ceiling is lower.
const GEMINI_TIMEOUT_MS = 90000;
const GROQ_TIMEOUT_MS = 60000;
// Groq's free tier allows about 8,000 tokens a minute per model and one CV request uses about
// 6,500, so when Groq both writes a CV and checks it, the check must wait about 30 s for the
// allowance to refill. Groq's 429 says how long; waits up to this long are taken once.
// Worst case for a CV plus its check: Gemini about 95 s, then Groq 60 s to write, 45 s of
// waiting and 60 s to check, inside the route's 300 s.
const GROQ_MAX_WAIT_MS = 45000;

export class LlmError extends Error {}
// The provider is overloaded, rate-limited, out of quota or did not answer: worth trying another.
export class LlmBusyError extends LlmError {}

export function activeProvider(): { provider: string; model: string } {
  if ((process.env.LLM_PROVIDER ?? "gemini") === "anthropic") {
    return { provider: "anthropic", model: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL };
  }
  return { provider: "gemini", model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL };
}

function groqModel(task: LlmTask): string | null {
  if (!process.env.GROQ_API_KEY) return null;
  return task === "check"
    ? process.env.GROQ_CHECK_MODEL || DEFAULT_GROQ_CHECK_MODEL
    : process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
}

// "write": the main provider, with Groq as the backup when Gemini is busy.
// "check": Groq alone when it is set up, so the fact check stays fast, cannot push a request past
// Vercel's limit, and leaves Gemini's small free quota for writing. Otherwise the main provider.
export type LlmTask = "write" | "check";

// Returns the parsed JSON object the model produced.
export async function generateJson(system: string, user: string, task: LlmTask = "write"): Promise<unknown> {
  const backup = groqModel(task);
  if (task === "check" && backup) return parseJsonObject(await callGroq(system, user, backup));

  const { provider, model } = activeProvider();
  if (provider === "anthropic") return parseJsonObject(await callAnthropic(system, user, model));
  try {
    return parseJsonObject(await callGemini(system, user, model));
  } catch (err) {
    // Only load problems move to the backup; a bad key or a rejected request should stay loud.
    if (!(err instanceof LlmBusyError) || !backup) throw err;
    log.warn("llm.backup_used", { provider: "groq", model: backup });
    return parseJsonObject(await callGroq(system, user, backup));
  }
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
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });

  // 503 (overloaded) and 429 (rate limit) often hit one model while others are fine: try each
  // model up to twice, honouring Google's retry delay, then move to the next, within one budget.
  const models = [model, ...fallbackGeminiModels().filter((m) => m !== model)];
  const isBusy = (status: number) => status === 503 || status === 429 || status === 500;
  const started = Date.now();
  let last = { status: 0, body: "" };

  for (const modelName of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let res: Response;
      let body: string;
      try {
        res = await request(modelName);
        body = await res.text();
      } catch (err) {
        // Timed out or the connection dropped. A model that hung once is not given a second wait.
        log.warn("gemini.busy", { model: modelName, attempt, status: "no_response", detail: errorMessage(err) });
        last = { status: 0, body: "" };
        break;
      }
      if (res.ok) return geminiText(JSON.parse(body));

      last = { status: res.status, body };
      if (!isBusy(res.status)) {
        log.error("gemini.error", { model: modelName, status: res.status, detail: last.body.slice(0, 1000) });
        throw new LlmError(`The AI provider returned an error (${res.status}). Try again in a minute.`);
      }
      log.warn("gemini.busy", {
        model: modelName,
        attempt,
        status: res.status,
        daily: isDailyQuota(last.body),
        // Google's own reason ("overloaded", "not available on the free tier", ...); holds no request content.
        detail: last.body.slice(0, 300),
      });
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
      throw new LlmBusyError("The AI provider's daily quota is used up. Try again tomorrow, or ask the admin to raise it.");
    }
    throw new LlmBusyError("Gemini's rate limit was hit. Wait a minute and try again.");
  }
  throw new LlmBusyError("Gemini is busy right now. Wait a minute and try again.");
}

// Groq's 429 body says "Please try again in 21.87s" (or "1m2.5s"). Half a second of slack on top.
export function groqRetryDelayMs(body: string): number | null {
  const match = body.match(/try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s/);
  if (!match) return null;
  return Math.round((Number(match[1] ?? 0) * 60 + Number(match[2])) * 1000) + 500;
}

// Groq's OpenAI-style chat endpoint. JSON mode guarantees valid JSON, not the shape, so the
// answer still goes through the same checks as Gemini's.
async function callGroq(system: string, user: string, model: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new LlmError("GROQ_API_KEY is not set.");

  const request = () =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });

  let res: Response | null = null;
  let body = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      res = await request();
      body = await res.text();
    } catch (err) {
      log.warn("groq.busy", { model, attempt, status: "no_response", detail: errorMessage(err) });
      throw new LlmBusyError("The AI provider did not answer. Wait a minute and try again.");
    }
    if (res.status !== 429 || attempt === 2) break;
    const wait = groqRetryDelayMs(body);
    // Groq's error body names the limit that was hit; it holds no request content.
    log.warn("groq.busy", { model, attempt, status: 429, waitMs: wait, detail: body.slice(0, 300) });
    if (wait === null || wait > GROQ_MAX_WAIT_MS) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    const busy = status === 429 || status >= 500;
    log[busy ? "warn" : "error"]("groq.error", { model, status, detail: body.slice(0, 300) });
    if (busy) throw new LlmBusyError("The AI provider is busy right now. Wait a minute and try again.");
    throw new LlmError(`The AI provider returned an error (${status}). Try again in a minute.`);
  }
  const data = JSON.parse(body) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new LlmError("Groq returned no text.");
  return text;
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

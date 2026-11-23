// generateJson's provider order, with the network faked: no request leaves the machine.
// Covers the cases behind "Gemini is always busy": a model that never answers, a used-up daily
// quota, and when Groq should and should not step in.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateJson, groqRetryDelayMs, LlmBusyError, LlmError } from "./llm";

const GEMINI = "generativelanguage.googleapis.com";
const GROQ = "api.groq.com";

const geminiOk = (json: object) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }), { status: 200 });
const groqOk = (json: object) =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(json) } }] }), { status: 200 });
const dailyQuota = () => new Response('{"error":{"details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel"}]}}', { status: 429 });
// What fetch throws when AbortSignal.timeout fires.
const timedOut = () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

type Handler = (url: string) => Promise<Response> | Response;

function fakeNetwork(gemini: Handler, groq: Handler) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = String(input);
      calls.push(url.includes(GROQ) ? "groq" : "gemini");
      return url.includes(GEMINI) ? gemini(url) : groq(url);
    }),
  );
  return calls;
}

beforeEach(() => {
  vi.stubEnv("LLM_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("GEMINI_FALLBACK_MODELS", "");
  vi.stubEnv("GROQ_API_KEY", "test-groq-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("generateJson, writing", () => {
  it("uses Gemini when it answers", async () => {
    const calls = fakeNetwork(() => geminiOk({ from: "gemini" }), () => groqOk({ from: "groq" }));
    expect(await generateJson("system", "user")).toEqual({ from: "gemini" });
    expect(calls).toEqual(["gemini"]);
  });

  it("moves to Groq when Gemini never answers, without waiting on it twice", async () => {
    const calls = fakeNetwork(timedOut, () => groqOk({ from: "groq" }));
    expect(await generateJson("system", "user")).toEqual({ from: "groq" });
    expect(calls).toEqual(["gemini", "groq"]);
  });

  it("moves to Groq when Gemini's daily quota is used up", async () => {
    const calls = fakeNetwork(dailyQuota, () => groqOk({ from: "groq" }));
    expect(await generateJson("system", "user")).toEqual({ from: "groq" });
    expect(calls).toEqual(["gemini", "groq"]);
  });

  it("tries the next Gemini model before Groq", async () => {
    vi.stubEnv("GEMINI_FALLBACK_MODELS", "gemini-backup");
    const calls = fakeNetwork(
      (url) => (url.includes("gemini-backup") ? geminiOk({ from: "backup" }) : timedOut()),
      () => groqOk({ from: "groq" }),
    );
    expect(await generateJson("system", "user")).toEqual({ from: "backup" });
    expect(calls).toEqual(["gemini", "gemini"]);
  });

  it("keeps a Gemini error that is not about load, rather than hiding it behind Groq", async () => {
    const calls = fakeNetwork(() => new Response("API key not valid", { status: 400 }), () => groqOk({ from: "groq" }));
    await expect(generateJson("system", "user")).rejects.toThrow("returned an error (400)");
    expect(calls).toEqual(["gemini"]);
  });

  it("without a Groq key, a busy Gemini still fails with the busy message", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    fakeNetwork(timedOut, () => groqOk({ from: "groq" }));
    await expect(generateJson("system", "user")).rejects.toBeInstanceOf(LlmBusyError);
  });

  it("reports a busy Groq as busy when both providers are down", async () => {
    fakeNetwork(dailyQuota, () => new Response('{"error":{"message":"Rate limit reached"}}', { status: 429 }));
    await expect(generateJson("system", "user")).rejects.toThrow("busy");
  });
});

describe("generateJson, checking", () => {
  it("uses Groq alone, leaving Gemini's quota for writing", async () => {
    const calls = fakeNetwork(() => geminiOk({ from: "gemini" }), () => groqOk({ issues: [] }));
    expect(await generateJson("system", "user", "check")).toEqual({ issues: [] });
    expect(calls).toEqual(["groq"]);
  });

  it("uses Gemini when Groq is not set up", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const calls = fakeNetwork(() => geminiOk({ issues: [] }), () => groqOk({ from: "groq" }));
    expect(await generateJson("system", "user", "check")).toEqual({ issues: [] });
    expect(calls).toEqual(["gemini"]);
  });

  it("fails plainly when Groq does not answer", async () => {
    fakeNetwork(() => geminiOk({ issues: [] }), timedOut);
    await expect(generateJson("system", "user", "check")).rejects.toBeInstanceOf(LlmError);
  });

  it("waits once when Groq's per-minute limit says a short wait will do", async () => {
    let groqCalls = 0;
    const calls = fakeNetwork(
      () => geminiOk({ from: "gemini" }),
      () =>
        ++groqCalls === 1
          ? new Response('{"error":{"message":"Rate limit reached. Please try again in 0.01s."}}', { status: 429 })
          : groqOk({ issues: [] }),
    );
    expect(await generateJson("system", "user", "check")).toEqual({ issues: [] });
    expect(calls).toEqual(["groq", "groq"]);
  });

  it("waits again when Groq counts the retry as larger and asks for a second wait", async () => {
    let groqCalls = 0;
    const calls = fakeNetwork(
      () => geminiOk({ from: "gemini" }),
      () =>
        ++groqCalls < 3
          ? new Response('{"error":{"message":"Please try again in 0.01s."}}', { status: 429 })
          : groqOk({ issues: [] }),
    );
    expect(await generateJson("system", "user", "check")).toEqual({ issues: [] });
    expect(calls).toEqual(["groq", "groq", "groq"]);
  });

  it("does not wait when Groq asks for longer than the request can afford", async () => {
    const calls = fakeNetwork(
      () => geminiOk({ from: "gemini" }),
      () => new Response('{"error":{"message":"Please try again in 2m10s."}}', { status: 429 }),
    );
    await expect(generateJson("system", "user", "check")).rejects.toBeInstanceOf(LlmBusyError);
    expect(calls).toEqual(["groq"]);
  });
});

describe("Groq model per job", () => {
  const sentModels = () => {
    const models: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init: RequestInit) => {
        if (String(input).includes(GEMINI)) return timedOut();
        models.push((JSON.parse(String(init.body)) as { model: string }).model);
        return groqOk({ issues: [] });
      }),
    );
    return models;
  };

  it("uses gpt-oss-120b for both jobs by default", async () => {
    const models = sentModels();
    await generateJson("system", "user");
    await generateJson("system", "user", "check");
    expect(models).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-120b"]);
  });

  it("lets GROQ_MODEL and GROQ_CHECK_MODEL be set separately", async () => {
    vi.stubEnv("GROQ_MODEL", "writer-model");
    vi.stubEnv("GROQ_CHECK_MODEL", "checker-model");
    const models = sentModels();
    await generateJson("system", "user");
    await generateJson("system", "user", "check");
    expect(models).toEqual(["writer-model", "checker-model"]);
  });
});

describe("groqRetryDelayMs", () => {
  it("reads seconds and minutes, plus half a second of slack", () => {
    expect(groqRetryDelayMs("Please try again in 21.874285714s. Need more tokens?")).toBe(22374);
    expect(groqRetryDelayMs("Please try again in 1m2.5s.")).toBe(63000);
  });
  it("returns null when no wait is given", () => expect(groqRetryDelayMs("Rate limit reached")).toBeNull());
});

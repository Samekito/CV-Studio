// Small pure helpers: invite codes, Fact Bank parsing, file names, env checks, Gemini 429 parsing.
import { describe, expect, it } from "vitest";
import { missingEnvVars } from "./env";
import { profileFromFactBank } from "./fact-bank";
import { hashInviteCode, newInviteCode, normaliseInviteCode } from "./invites";
import { isDailyQuota, retryDelayMs } from "./llm";
import { cleanTracks } from "./profile";
import { fileBase } from "./types";

describe("invite codes", () => {
  it("are 12 unambiguous characters", () => {
    const code = newInviteCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{12}$/);
  });
  it("differ each time", () => {
    const codes = new Set(Array.from({ length: 200 }, newInviteCode));
    expect(codes.size).toBe(200);
  });
  it("hash the same whatever the case or spacing", () => {
    expect(normaliseInviteCode(" abcd efgh ")).toBe("ABCDEFGH");
    expect(hashInviteCode("abcd efgh jkmn")).toBe(hashInviteCode("ABCDEFGHJKMN"));
    expect(hashInviteCode("ABCDEFGHJKMN")).not.toBe(hashInviteCode("ABCDEFGHJKMP"));
  });
  it("are stored as a SHA-256 hex digest, never the code itself", () => {
    const code = "ABCDEFGHJKMN";
    expect(hashInviteCode(code)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteCode(code)).not.toContain(code);
  });
});

describe("profileFromFactBank", () => {
  it("reads the name and track table", () => {
    const text = "- **Name:** Jane Doe\n\n| **A. Customer Support** | x | y |\n| **B. Ops** | x | y |";
    expect(profileFromFactBank(text)).toEqual({
      full_name: "Jane Doe",
      tracks: { A: "Customer Support", B: "Ops" },
      fact_bank: text,
    });
  });
  it("leaves blanks when nothing matches", () => {
    expect(profileFromFactBank("free text")).toEqual({ full_name: "", tracks: {}, fact_bank: "free text" });
  });
});

describe("cleanTracks", () => {
  it("keeps A to C with labels, trimmed", () => {
    expect(cleanTracks({ A: "  Support ", B: "", D: "Nope" })).toEqual({ A: "Support" });
  });
  it("needs at least one named track", () => {
    expect(cleanTracks({ A: " " })).toBe("Give at least one track a name.");
    expect(cleanTracks(null)).toBe("Tracks are missing.");
  });
});

describe("fileBase", () => {
  it("builds a safe file name from name and company", () => {
    expect(fileBase("Olusola Samuel Junior", "Acme Ltd.")).toBe("Olusola_Samuel_Junior_Acme_Ltd_");
    expect(fileBase("Jane", "")).toBe("Jane_CV");
  });
});

describe("missingEnvVars", () => {
  const complete = {
    SUPABASE_URL: "u",
    SUPABASE_ANON_KEY: "a",
    SUPABASE_SERVICE_KEY: "s",
    ADMIN_USER_ID: "id",
    GEMINI_API_KEY: "g",
  };
  it("passes a complete Gemini setup", () => expect(missingEnvVars(complete)).toEqual([]));
  it("names what is missing", () => expect(missingEnvVars({ ...complete, ADMIN_USER_ID: " " })).toEqual(["ADMIN_USER_ID"]));
  it("asks for the Anthropic key when that provider is chosen", () =>
    expect(missingEnvVars({ ...complete, LLM_PROVIDER: "anthropic" })).toEqual(["ANTHROPIC_API_KEY"]));
});

describe("Gemini 429 parsing", () => {
  const daily = '{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier", "retryDelay": "47s"}';
  const perMinute = '{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel", "retryDelay": "2.5s"}';
  it("tells a daily quota from a per-minute one", () => {
    expect(isDailyQuota(daily)).toBe(true);
    expect(isDailyQuota(perMinute)).toBe(false);
  });
  it("reads the suggested wait", () => {
    expect(retryDelayMs(daily)).toBe(47000);
    expect(retryDelayMs(perMinute)).toBe(2500);
    expect(retryDelayMs("{}")).toBeNull();
  });
});

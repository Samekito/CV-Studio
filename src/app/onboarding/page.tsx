"use client";

// First visit after sign-up: build the user's Fact Bank. Either paste an existing CV and let the
// model draft it, or paste a Fact Bank written elsewhere. Both end in the same editor to review.
// Someone who already has a Fact Bank is sent to /facts, so this page can never overwrite one.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ProfileEditor from "@/components/ProfileEditor";
import { profileFromFactBank } from "@/lib/fact-bank";
import { callGenerate } from "@/lib/generate-client";
import { useMe } from "@/lib/me-client";
import type { Profile } from "@/lib/types";

type Start = "cv" | "factBank";

export default function OnboardingPage() {
  const router = useRouter();
  const { me } = useMe();
  const [start, setStart] = useState<Start>("cv");
  const [cvText, setCvText] = useState("");
  const [factBankText, setFactBankText] = useState("");
  const [draft, setDraft] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Only before an onboarding draft exists: saving one also creates a profile, and that user
  // should land on Tailor (onSaved below), not be bounced to /facts.
  const arrivedWithProfile = Boolean(me?.profile) && !draft;
  useEffect(() => {
    if (arrivedWithProfile) router.replace("/facts");
  }, [arrivedWithProfile, router]);

  async function draftFromCv() {
    setBusy(true);
    setError("");
    try {
      const data = await callGenerate<Partial<Profile>>({ mode: "draft_profile", cvText });
      // The server has checked the Fact Bank text; name and tracks may still be missing or odd.
      setDraft({
        full_name: typeof data.full_name === "string" ? data.full_name : "",
        tracks: data.tracks && typeof data.tracks === "object" ? data.tracks : {},
        fact_bank: data.fact_bank ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft your Fact Bank.");
    } finally {
      setBusy(false);
    }
  }

  if (draft) {
    return (
      <div className="space-y-4">
        <section className="card space-y-2">
          <h1 className="text-lg font-semibold">Check your Fact Bank</h1>
          <p className="text-sm text-muted">
            Read it all before saving. Every CV the app writes will come only from section 3, so delete anything that is not
            true and move anything you are unsure of into section 4.
          </p>
        </section>
        <ProfileEditor initial={draft} isNew saveLabel="Save and start" onSaved={() => router.replace("/")} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Welcome to CV Studio</h1>
          <p className="text-sm text-muted">
            First, your Fact Bank: the facts about you that every CV and cover letter is built from. Nothing is ever added
            beyond it.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={`rounded-md px-3 py-1.5 text-sm ${start === "cv" ? "bg-accent text-white" : "border border-border bg-surface"}`}
            onClick={() => setStart("cv")}
          >
            Start from my CV
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm ${start === "factBank" ? "bg-accent text-white" : "border border-border bg-surface"}`}
            onClick={() => setStart("factBank")}
          >
            I already have a Fact Bank
          </button>
        </div>

        {start === "cv" ? (
          <>
            <div>
              <label htmlFor="cvText" className="label">
                Your current CV
              </label>
              <textarea
                id="cvText"
                className="field min-h-64"
                placeholder="Open your CV, select all, copy, and paste it here"
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn" onClick={draftFromCv} disabled={busy || cvText.trim().length < 200}>
                {busy ? "Drafting... (up to a minute)" : "Draft my Fact Bank"}
              </button>
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="factBankText" className="label">
                Your Fact Bank
              </label>
              <textarea
                id="factBankText"
                className="field min-h-64 font-mono text-xs"
                placeholder="Paste your whole Fact Bank here. Your name and tracks are filled in from it."
                value={factBankText}
                onChange={(e) => setFactBankText(e.target.value)}
              />
            </div>
            <button className="btn" onClick={() => setDraft(profileFromFactBank(factBankText.trim()))} disabled={!factBankText.trim()}>
              Continue
            </button>
          </>
        )}
      </section>
    </div>
  );
}

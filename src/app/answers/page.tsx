"use client";

// Phase 3: screening-question answers and platform profile copy, both from the Fact Bank.
import { useState } from "react";
import CopyButton from "@/components/CopyButton";
import { callGenerate } from "@/lib/generate-client";
import { useMe } from "@/lib/me-client";
import type { AnswersResult, BioResult, Track } from "@/lib/types";

const PLATFORMS = ["Mercor", "LinkedIn About", "LinkedIn Headline", "Upwork", "Alignerr", "Outlier", "DataAnnotation", "Wellfound", "uTest", "Other"];

type Tab = "answers" | "bio";

export default function AnswersPage() {
  const [tab, setTab] = useState<Tab>("answers");

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <TabButton active={tab === "answers"} onClick={() => setTab("answers")}>
          Screening questions
        </TabButton>
        <TabButton active={tab === "bio"} onClick={() => setTab("bio")}>
          Platform profile
        </TabButton>
      </div>
      {tab === "answers" ? <AnswersForm /> : <BioForm />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-accent text-white" : "border border-border bg-surface"}`}
    >
      {children}
    </button>
  );
}

function AnswersForm() {
  const [jobAd, setJobAd] = useState("");
  const [questions, setQuestions] = useState("");
  const [result, setResult] = useState<AnswersResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      setResult(await callGenerate<AnswersResult>({ mode: "answers", jobAd, questions }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card space-y-4">
        <p className="text-sm text-muted">Paste the questions from an application form, one per line. Adding the job ad makes the answers more specific.</p>
        <div>
          <label htmlFor="questions" className="label">
            Questions
          </label>
          <textarea
            id="questions"
            className="field min-h-32"
            placeholder={"Why do you want to work here?\nDescribe a bug you found and how you reported it.\nDo you require visa sponsorship?"}
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="answersJobAd" className="label">
            Job ad (optional)
          </label>
          <textarea id="answersJobAd" className="field min-h-24" value={jobAd} onChange={(e) => setJobAd(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" onClick={run} disabled={busy || !questions.trim()}>
            {busy ? "Writing..." : "Answer"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </section>

      {result?.answers.map((a, i) => (
        <section key={i} className="card space-y-2">
          <div className="flex items-start gap-2">
            <p className="mr-auto text-sm font-semibold">{a.question}</p>
            <CopyButton text={a.answer} />
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.answer}</p>
          {a.note && <p className="rounded bg-accent-soft px-2 py-1 text-xs text-accent">Check: {a.note}</p>}
        </section>
      ))}
    </>
  );
}

function BioForm() {
  const { me } = useMe();
  const tracks = me?.profile?.tracks ?? {};
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [customPlatform, setCustomPlatform] = useState("");
  const [track, setTrack] = useState<Track>("A");
  const [limit, setLimit] = useState(1200);
  const [jobAd, setJobAd] = useState("");
  const [result, setResult] = useState<BioResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const platformName = platform === "Other" ? customPlatform.trim() : platform;

  async function run() {
    setBusy(true);
    setError("");
    try {
      setResult(await callGenerate<BioResult>({ mode: "bio", platform: platformName, track, limit, jobAd }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="platform" className="label">
              Platform
            </label>
            <select id="platform" className="field" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            {platform === "Other" && (
              <input
                aria-label="Platform name"
                className="field mt-2"
                placeholder="Platform name"
                value={customPlatform}
                onChange={(e) => setCustomPlatform(e.target.value)}
              />
            )}
          </div>
          <div>
            <label htmlFor="bioTrack" className="label">
              Track
            </label>
            <select id="bioTrack" className="field" value={track} onChange={(e) => setTrack(e.target.value as Track)}>
              {(Object.keys(tracks) as Track[]).map((t) => (
                <option key={t} value={t}>
                  {t} - {tracks[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="limit" className="label">
              Character limit
            </label>
            <input
              id="limit"
              type="number"
              min={200}
              max={5000}
              step={100}
              className="field"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
        </div>
        <div>
          <label htmlFor="bioJobAd" className="label">
            Target role or client (optional)
          </label>
          <textarea id="bioJobAd" className="field min-h-20" value={jobAd} onChange={(e) => setJobAd(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" onClick={run} disabled={busy || !platformName}>
            {busy ? "Writing..." : "Write profile"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </section>

      {result && (
        <section className="card space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="label mr-auto">Headline ({result.headline.length} chars)</p>
              <CopyButton text={result.headline} />
            </div>
            <p className="text-sm font-medium">{result.headline}</p>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className={`label mr-auto ${result.bio.length > limit ? "text-danger" : ""}`}>
                Bio ({result.bio.length} / {limit} chars)
              </p>
              <CopyButton text={result.bio} />
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.bio}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="label mr-auto">Skills to tag</p>
                <CopyButton text={result.skillsToTag.join(", ")} />
              </div>
              <div className="flex flex-wrap gap-1">
                {result.skillsToTag.map((s) => (
                  <span key={s} className="rounded border border-border px-2 py-0.5 text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="label">Do not tag</p>
              <ul className="ml-4 list-disc text-sm">
                {result.skillsNotToTag.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

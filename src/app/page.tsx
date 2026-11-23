"use client";

// Tailor: job ad in -> fit check, tailored CV, cover letter out.
// The last result is kept in localStorage so a refresh or a phone lock does not lose it.
import { useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";
import CvPreview from "@/components/CvPreview";
import { buildCvDocument, buildLetterDocument, downloadDocx } from "@/lib/docx";
import { callGenerate } from "@/lib/generate-client";
import { useMe } from "@/lib/me-client";
import { createApplication } from "@/lib/tracker-client";
import { fileBase, type FactCheck, type TailorResult, type Track, type Tracks } from "@/lib/types";
import { isTailorResult } from "@/lib/validate";

const DRAFT_KEY = "cv-studio.tailor";

type Draft = {
  jobAd: string;
  company: string;
  role: string;
  link: string;
  track: Track | "auto";
  extra: string;
  result: TailorResult | null;
};

const EMPTY: Draft = { jobAd: "", company: "", role: "", link: "", track: "auto", extra: "", result: null };

export default function TailorPage() {
  const { me } = useMe();
  const tracks: Tracks = me?.profile?.tracks ?? {};
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY);
      if (stored) {
        const restored = { ...EMPTY, ...(JSON.parse(stored) as Draft) };
        // A result saved by an older version, or damaged in storage, would crash the page on every
        // visit; drop it and keep the typed-in form.
        if (restored.result && !isTailorResult(restored.result)) restored.result = null;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage after mount
        setDraft(restored);
      }
    } catch {
      // Blocked or corrupt storage: start with an empty form.
    }
  }, []);

  function update(patch: Partial<Draft>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        // Storage full or blocked: the form still works, it just will not survive a refresh.
      }
      return next;
    });
  }

  async function generate() {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const result = await callGenerate<TailorResult>({
        mode: "tailor",
        jobAd: draft.jobAd,
        track: draft.track,
        extra: draft.extra,
      });
      update({ result });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft.result) return;
    if (!draft.company.trim() || !draft.role.trim()) {
      setSaved("Add the company and role above first.");
      return;
    }
    try {
      await createApplication({
        company: draft.company.trim(),
        role: draft.role.trim(),
        link: draft.link.trim() || null,
        track: draft.result.track,
        status: "draft",
        cv: draft.result.cv,
        cover_letter: draft.result.coverLetter,
        notes: `Fit ${draft.result.fit.score}/10. ${draft.result.fit.verdict}`,
      });
      setSaved("Saved to tracker.");
    } catch (err) {
      setSaved(err instanceof Error ? err.message : "Could not save.");
    }
  }

  const baseName = fileBase(me?.profile?.full_name ?? "", draft.company);
  const result = draft.result;

  return (
    <div className="space-y-6">
      <section className="card no-print space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Tailor a CV</h1>
          <p className="text-sm text-muted">Paste a job ad. You get a fit check, a tailored CV and a cover letter, using only your Fact Bank.</p>
        </div>

        <div>
          <label htmlFor="jobAd" className="label">
            Job ad
          </label>
          <textarea
            id="jobAd"
            className="field min-h-48"
            placeholder="Paste the full job description here"
            value={draft.jobAd}
            onChange={(e) => update({ jobAd: e.target.value })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="company" className="label">
              Company (for tracker and file name)
            </label>
            <input id="company" className="field" value={draft.company} onChange={(e) => update({ company: e.target.value })} />
          </div>
          <div>
            <label htmlFor="role" className="label">
              Role
            </label>
            <input id="role" className="field" value={draft.role} onChange={(e) => update({ role: e.target.value })} />
          </div>
          <div>
            <label htmlFor="link" className="label">
              Job link (optional)
            </label>
            <input id="link" className="field" value={draft.link} onChange={(e) => update({ link: e.target.value })} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="track" className="label">
              Track
            </label>
            <select
              id="track"
              className="field"
              value={draft.track}
              onChange={(e) => update({ track: e.target.value as Track | "auto" })}
            >
              <option value="auto">Let it pick</option>
              {(Object.keys(tracks) as Track[]).map((t) => (
                <option key={t} value={t}>
                  {t} - {tracks[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="extra" className="label">
              Extra instructions (optional)
            </label>
            <input
              id="extra"
              className="field"
              placeholder='e.g. "emphasise my leadership experience" or "keep it to one page"'
              value={draft.extra}
              onChange={(e) => update({ extra: e.target.value })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" onClick={generate} disabled={busy || draft.jobAd.trim().length < 50}>
            {busy ? "Writing and fact-checking... (up to two minutes)" : "Generate"}
          </button>
          {(draft.jobAd || result) && (
            <button className="btn-ghost" onClick={() => update(EMPTY)} disabled={busy}>
              Clear
            </button>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </section>

      {result && (
        <>
          <section className="card no-print space-y-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-semibold text-accent">{result.fit.score}/10</span>
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                Track {result.track}
                {tracks[result.track] ? ` - ${tracks[result.track]}` : ""}
              </span>
            </div>
            <p className="text-sm">{result.fit.verdict}</p>
            <p className="text-xs text-muted">{result.trackReason}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <List title="Strongest matches" items={result.fit.strengths} />
              <List title="Gaps" items={result.fit.gaps} />
              <List title="Keywords used" items={result.keywordsUsed} inline />
              <List title="Left out (not true for you)" items={result.keywordsNotTrue} inline />
            </div>
          </section>

          {result.factCheck && <FactCheckPanel check={result.factCheck} />}

          <section className="space-y-3">
            <div className="no-print flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-base font-semibold">CV</h2>
              <button className="btn-ghost" onClick={() => downloadDocx(buildCvDocument(result.cv), `${baseName}_CV.docx`)}>
                Download .docx
              </button>
              <button className="btn-ghost" onClick={() => window.print()}>
                Print / Save PDF
              </button>
              <button className="btn-ghost" onClick={save}>
                Save to tracker
              </button>
            </div>
            {saved && <p className="no-print text-sm text-muted">{saved}</p>}
            <p className="no-print text-xs text-muted">Check every line against your Fact Bank before sending.</p>
            <CvPreview cv={result.cv} />
          </section>

          <section className="card no-print space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-base font-semibold">Cover letter</h2>
              <CopyButton text={result.coverLetter} />
              <button
                className="btn-ghost"
                onClick={() => downloadDocx(buildLetterDocument(result.cv.name, result.coverLetter), `${baseName}_Cover_Letter.docx`)}
              >
                Download .docx
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.coverLetter}</p>
          </section>
        </>
      )}
    </div>
  );
}

// What the fact check found. It can miss things, so even a clean result keeps the reminder.
// "unavailable" means the model half failed; the exact half's findings are still listed.
function FactCheckPanel({ check }: { check: FactCheck }) {
  const issues = check.issues ?? [];
  const modelSkipped = check.status === "unavailable";
  if (!issues.length) {
    return (
      <section className="card no-print">
        <p className="label">Fact check</p>
        <p className="text-sm">
          {modelSkipped
            ? "The fact check did not run this time. Check every line against your Fact Bank before sending."
            : "No unsupported claims found. The check can miss things, so still read every line before sending."}
        </p>
      </section>
    );
  }
  return (
    <section className="card no-print space-y-3 border-danger">
      <div>
        <p className="label text-danger">Fact check</p>
        <p className="text-sm">
          {issues.length} {issues.length === 1 ? "line is" : "lines are"} not backed by your Fact Bank. Fix or remove{" "}
          {issues.length === 1 ? "it" : "them"} before sending.
          {modelSkipped && " Only numbers, years, links and emails were checked this time, so read the other lines yourself."}
        </p>
      </div>
      <ul className="space-y-2 text-sm">
        {issues.map((issue, i) => (
          <li key={i} className="border-l-2 border-danger pl-3">
            <p className="font-medium">&ldquo;{issue.text}&rdquo;</p>
            <p className="text-muted">{issue.problem}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function List({ title, items, inline }: { title: string; items: string[]; inline?: boolean }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="label">{title}</p>
      {inline ? (
        <div className="flex flex-wrap gap-1">
          {items.map((item, i) => (
            <span key={i} className="rounded border border-border px-2 py-0.5 text-xs">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <ul className="ml-4 list-disc space-y-1 text-sm">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

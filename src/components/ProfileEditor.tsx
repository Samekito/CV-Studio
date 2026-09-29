"use client";

// Edits a profile (name, track labels, Fact Bank) and saves it with PUT /api/profile.
// Shared by the Fact Bank page and the last step of onboarding.
import { useState } from "react";
import { refreshMe } from "@/lib/me-client";
import { TRACK_KEYS, type Profile } from "@/lib/types";

export default function ProfileEditor({
  initial,
  isNew = false,
  saveLabel = "Save",
  onSaved,
}: {
  initial: Profile;
  isNew?: boolean; // not saved yet, so Save is available before any edit
  saveLabel?: string;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState<Profile>(initial);
  const [saved, setSaved] = useState<Profile>(initial);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [savedOnce, setSavedOnce] = useState(!isNew);
  const dirty = !savedOnce || JSON.stringify(draft) !== JSON.stringify(saved);

  function setTrack(key: (typeof TRACK_KEYS)[number], label: string) {
    setDraft((prev) => ({ ...prev, tracks: { ...prev.tracks, [key]: label } }));
  }

  async function save() {
    setBusy(true);
    setStatus("");
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setStatus(data.error ?? "Could not save.");
      return;
    }
    setSaved(draft);
    setSavedOnce(true);
    setStatus("Saved. New generations use this version.");
    await refreshMe();
    onSaved?.();
  }

  return (
    <div className="space-y-4">
      <section className="card grid gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="fullName" className="label">
            Full name
          </label>
          <input
            id="fullName"
            className="field"
            value={draft.full_name}
            onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
          />
        </div>
        {TRACK_KEYS.map((key) => (
          <div key={key}>
            <label htmlFor={`track-${key}`} className="label">
              Track {key} {key === "A" ? "" : "(optional)"}
            </label>
            <input
              id={`track-${key}`}
              className="field"
              placeholder={key === "A" ? "e.g. Customer Support" : ""}
              value={draft.tracks[key] ?? ""}
              onChange={(e) => setTrack(key, e.target.value)}
            />
          </div>
        ))}
        <p className="text-xs text-muted sm:col-span-4">
          Tracks are the kinds of role you apply for. Each one gets a differently angled CV. Describe them in section 2 of the
          Fact Bank.
        </p>
      </section>

      <textarea
        aria-label="Fact Bank"
        className="field min-h-[60vh] font-mono text-xs leading-relaxed"
        value={draft.fact_bank}
        onChange={(e) => setDraft({ ...draft, fact_bank: e.target.value })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving..." : saveLabel}
        </button>
        {savedOnce && dirty && (
          <button className="btn-ghost" onClick={() => setDraft(saved)} disabled={busy}>
            Undo changes
          </button>
        )}
        {status && <p className="text-sm text-muted">{status}</p>}
      </div>
    </div>
  );
}

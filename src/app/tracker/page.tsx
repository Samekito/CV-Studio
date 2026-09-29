"use client";

// Phase 2: every application in one list, with the exact CV and letter that were sent.
import { useCallback, useEffect, useState } from "react";
import CvPreview from "@/components/CvPreview";
import { buildCvDocument, buildLetterDocument, downloadDocx } from "@/lib/docx";
import { useMe } from "@/lib/me-client";
import {
  createApplication,
  deleteApplication,
  getApplication,
  importLocalApplications,
  listApplications,
  localApplications,
  updateApplication,
} from "@/lib/tracker-client";
import { fileBase, STATUSES, type Application, type ApplicationDetail, type ApplicationStatus } from "@/lib/types";

// The user's own calendar date. toISOString() would give the UTC date, which is yesterday for
// anyone east of UTC marking an application between midnight and their UTC offset.
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function TrackerPage() {
  const { me } = useMe();
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<Application[]>([]);
  const [localCount, setLocalCount] = useState(0);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await listApplications());
      setLoaded(true);
      setLocalCount(localApplications().length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function add(event: React.FormEvent) {
    event.preventDefault();
    if (!company.trim() || !role.trim()) return;
    void run(async () => {
      await createApplication({ company: company.trim(), role: role.trim() });
      setCompany("");
      setRole("");
    });
  }

  function setStatus(row: Application, status: ApplicationStatus) {
    // Marking "applied" stamps today's date unless one is already set.
    const patch: Partial<Application> = { status };
    if (status === "applied" && !row.applied_on) patch.applied_on = today();
    void run(() => updateApplication(row.id, patch));
  }

  function remove(row: Application) {
    if (!confirm(`Delete ${row.company} - ${row.role}?`)) return;
    void run(() => deleteApplication(row.id));
  }

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const counts = STATUSES.map((s) => ({ status: s, count: rows.filter((r) => r.status === s).length }));

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="mr-auto text-lg font-semibold">Applications</h1>
          {loaded && <span className="text-xs text-muted">Synced to your account</span>}
        </div>
        {localCount > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded bg-accent-soft px-3 py-2 text-sm text-accent">
            <span className="mr-auto">
              This browser still holds {localCount} application{localCount === 1 ? "" : "s"} from before accounts existed.
            </span>
            <button className="btn" onClick={() => void run(importLocalApplications)}>
              Move them into my account
            </button>
          </div>
        )}
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <input aria-label="Company" className="field max-w-56" placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
          <input aria-label="Role" className="field max-w-72" placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />
          <button className="btn" type="submit" disabled={!loaded || !company.trim() || !role.trim()}>
            Add
          </button>
        </form>
        <div className="flex flex-wrap gap-1">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All {rows.length}
          </FilterChip>
          {counts.map(({ status, count }) => (
            <FilterChip key={status} active={filter === status} onClick={() => setFilter(status)}>
              {status} {count}
            </FilterChip>
          ))}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </section>

      {loaded && visible.length === 0 && (
        <p className="text-center text-sm text-muted">
          {rows.length === 0 ? "No applications yet. Add one above, or use Save to tracker on the Tailor page." : "Nothing with this status."}
        </p>
      )}

      <div className="space-y-2">
        {visible.map((row) => (
          <Row
            key={row.id}
            row={row}
            fullName={me?.profile?.full_name ?? ""}
            open={openId === row.id}
            onToggle={() => setOpenId(openId === row.id ? null : row.id)}
            onStatus={(s) => setStatus(row, s)}
            onSave={(patch) => run(() => updateApplication(row.id, patch))}
            onDelete={() => remove(row)}
          />
        ))}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs capitalize ${active ? "bg-accent text-white" : "border border-border bg-surface text-muted"}`}
    >
      {children}
    </button>
  );
}

function Row({
  row,
  fullName,
  open,
  onToggle,
  onStatus,
  onSave,
  onDelete,
}: {
  row: Application;
  fullName: string;
  open: boolean;
  onToggle: () => void;
  onStatus: (s: ApplicationStatus) => void;
  onSave: (patch: Partial<Application>) => void;
  onDelete: () => void;
}) {
  const baseName = fileBase(fullName, row.company);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onToggle} className="mr-auto text-left">
          <span className="font-medium">{row.company}</span>
          <span className="text-muted"> - {row.role}</span>
          {row.track && <span className="ml-2 text-xs text-muted">Track {row.track}</span>}
          {row.applied_on && <span className="ml-2 text-xs text-muted">{row.applied_on}</span>}
        </button>
        <select
          aria-label={`Status for ${row.company}`}
          className="field w-auto py-1 capitalize"
          value={row.status}
          onChange={(e) => onStatus(e.target.value as ApplicationStatus)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn-ghost" onClick={onToggle}>
          {open ? "Close" : "Open"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Keyed on the saved values so the fields reload whenever the stored row changes,
              e.g. when marking "applied" stamps a date while this panel is open. */}
          <RowFields key={`${row.applied_on}|${row.link}|${row.notes}`} row={row} onSave={onSave} />
          <div className="flex flex-wrap gap-2">
            {row.link && (
              <a className="btn-ghost" href={row.link} target="_blank" rel="noopener noreferrer">
                Open job ad
              </a>
            )}
            <button className="btn-ghost ml-auto text-danger" onClick={onDelete}>
              Delete
            </button>
          </div>
          <SavedDocuments id={row.id} baseName={baseName} />
        </div>
      )}
    </div>
  );
}

// The saved CV and letter are the bulk of a row, so they load only when the row is opened.
function SavedDocuments({ id, baseName }: { id: string; baseName: string }) {
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    getApplication(id).then(
      (loaded) => live && setDetail(loaded),
      (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not load the saved CV."),
    );
    return () => {
      live = false;
    };
  }, [id]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!detail) return <p className="text-xs text-muted">Loading saved documents...</p>;
  const { cv, cover_letter: letter } = detail;
  if (!cv) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={() => downloadDocx(buildCvDocument(cv), `${baseName}_CV.docx`)}>
          CV .docx
        </button>
        {letter && (
          <button
            className="btn-ghost"
            onClick={() => downloadDocx(buildLetterDocument(cv.name, letter), `${baseName}_Cover_Letter.docx`)}
          >
            Letter .docx
          </button>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-sm text-muted">Show the CV that was saved</summary>
        <div className="mt-2">
          <CvPreview cv={cv} />
        </div>
      </details>
    </>
  );
}

function RowFields({ row, onSave }: { row: Application; onSave: (patch: Partial<Application>) => void }) {
  const [notes, setNotes] = useState(row.notes ?? "");
  const [link, setLink] = useState(row.link ?? "");
  const [appliedOn, setAppliedOn] = useState(row.applied_on ?? "");

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`link-${row.id}`}>
            Job link
          </label>
          <input id={`link-${row.id}`} className="field" value={link} onChange={(e) => setLink(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={`date-${row.id}`}>
            Applied on
          </label>
          <input id={`date-${row.id}`} type="date" className="field" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`notes-${row.id}`}>
          Notes
        </label>
        <textarea id={`notes-${row.id}`} className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="btn" onClick={() => onSave({ notes: notes || null, link: link || null, applied_on: appliedOn || null })}>
        Save changes
      </button>
    </>
  );
}

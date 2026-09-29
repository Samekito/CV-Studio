"use client";

// Admin only: invite people (each invite gets a one-time code, shown once), disable accounts,
// and see what people use. The API refuses non-admins; this page just shows a message instead.
import { useCallback, useEffect, useState } from "react";
import CopyButton from "@/components/CopyButton";
import { useMe } from "@/lib/me-client";
import type { AdminData, InviteRow } from "@/lib/types";

// Readable names for the events recorded by lib/events.ts.
const EVENT_LABELS: Record<string, string> = {
  signup: "Sign-ups",
  login: "Logins",
  "generate.tailor": "Tailored CVs",
  "generate.answers": "Screening answers",
  "generate.bio": "Platform bios",
  "generate.draft_profile": "Fact Banks drafted",
  "generate.failed": "Failed generations",
  "profile.saved": "Fact Bank saves",
  "application.saved": "Tracker saves",
};

type Issued = { email: string; code: string };

export default function AdminPage() {
  const { me } = useMe();
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [email, setEmail] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin");
    const data = (await res.json().catch(() => ({}))) as Partial<AdminData> & { error?: string };
    if (!res.ok || !data.invites) {
      setError(data.error ?? `Could not load the admin data (${res.status}).`);
      return;
    }
    setAdmin(data as AdminData);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch once we know this is the admin
    if (me?.isAdmin) void load();
  }, [me, load]);

  async function send(url: string, method: string, body?: unknown): Promise<unknown> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed.");
        return null;
      }
      await load();
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function issueCode(target: string) {
    const data = (await send("/api/admin", "POST", { email: target })) as Issued | null;
    if (data) {
      setIssued({ email: data.email, code: data.code });
      setEmail("");
    }
  }

  function invite(event: React.FormEvent) {
    event.preventDefault();
    void issueCode(email.trim());
  }

  function newCode(row: InviteRow) {
    if (confirm(`Make a new code for ${row.email}? The old one stops working.`)) void issueCode(row.email);
  }

  function withdraw(row: InviteRow) {
    if (confirm(`Withdraw the invite for ${row.email}?`)) void send(`/api/admin?email=${encodeURIComponent(row.email)}`, "DELETE");
  }

  function setDisabled(row: InviteRow, disabled: boolean) {
    const question = disabled
      ? `Disable ${row.email}? They cannot log in again. A session already open can last up to an hour.`
      : `Re-enable ${row.email}?`;
    if (row.user_id && confirm(question)) void send("/api/admin", "PATCH", { userId: row.user_id, disabled });
  }

  if (!me) return <p className="text-sm text-muted">Loading...</p>;
  if (!me.isAdmin) return <p className="text-sm text-muted">This page is for the admin only.</p>;
  const rows = admin?.invites;

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <div>
          <h1 className="text-lg font-semibold">Invites</h1>
          <p className="text-sm text-muted">
            Each invite gets a one-time code. Send the person the app link, their email and the code; they choose &quot;Create
            your account&quot;. The code is shown only once, so copy it now.
          </p>
        </div>
        <form onSubmit={invite} className="flex flex-wrap gap-2">
          <input
            aria-label="Email to invite"
            type="email"
            className="field max-w-80"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn" type="submit" disabled={busy || !email.trim()}>
            Invite
          </button>
        </form>
        {issued && (
          <div className="flex flex-wrap items-center gap-3 rounded bg-accent-soft px-3 py-2 text-sm">
            <span>
              Code for <strong>{issued.email}</strong>: <code className="font-mono text-base">{issued.code}</code>
            </span>
            <CopyButton text={issued.code} label="Copy code" />
            <button className="btn-ghost ml-auto" onClick={() => setIssued(null)}>
              Done
            </button>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </section>

      {rows && rows.length === 0 && <p className="text-center text-sm text-muted">No invites yet.</p>}
      {rows && rows.length > 0 && (
        <section className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Invited</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Used today</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.email} className="border-t border-border">
                  <td className="px-4 py-2">{row.email}</td>
                  <td className="px-4 py-2 text-muted">{row.invited_on}</td>
                  <td className="px-4 py-2">{statusLabel(row)}</td>
                  <td className="px-4 py-2">{usageLabel(row, me.userId, admin?.dailyLimit)}</td>
                  <td className="space-x-1 whitespace-nowrap px-4 py-2 text-right">
                    {row.joined ? (
                      row.user_id !== me.userId && (
                        <button className="btn-ghost text-danger" onClick={() => setDisabled(row, !row.disabled)} disabled={busy}>
                          {row.disabled ? "Enable" : "Disable"}
                        </button>
                      )
                    ) : (
                      <>
                        <button className="btn-ghost" onClick={() => newCode(row)} disabled={busy}>
                          New code
                        </button>
                        <button className="btn-ghost text-danger" onClick={() => withdraw(row)} disabled={busy}>
                          Withdraw
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {admin && (
        <section className="card space-y-3">
          <h2 className="text-base font-semibold">Last 7 days</h2>
          {admin.events.length === 0 ? (
            <p className="text-sm text-muted">Nothing recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 font-medium">What</th>
                  <th className="py-1 text-right font-medium">Times</th>
                  <th className="py-1 text-right font-medium">People</th>
                </tr>
              </thead>
              <tbody>
                {admin.events.map((e) => (
                  <tr key={e.name} className="border-t border-border">
                    <td className="py-1">{EVENT_LABELS[e.name] ?? e.name}</td>
                    <td className="py-1 text-right">{e.total}</td>
                    <td className="py-1 text-right">{e.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

// The admin's own generations are not limited, so their row shows a count without a cap.
function usageLabel(row: InviteRow, adminId: string, limit: number | undefined): string {
  if (!row.joined) return "-";
  if (row.user_id === adminId) return `${row.used_today} (no limit)`;
  return `${row.used_today}/${limit}`;
}

function statusLabel(row: InviteRow): string {
  if (row.disabled) return "Disabled";
  if (row.joined) return "Joined";
  return row.has_code ? "Code sent, not joined" : "No code yet";
}

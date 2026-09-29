"use client";

// Email + password form for the login and sign-up pages. Sign-up also needs the one-time
// invite code the admin sent; /api/signup checks the email and code together.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearMe } from "@/lib/me-client";

// justCreated: arrived from a sign-up whose automatic first login did not go through.
export default function AuthForm({ mode, justCreated = false }: { mode: "login" | "signup"; justCreated?: boolean }) {
  const router = useRouter();
  const signup = mode === "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(signup ? "/api/signup" : "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signup ? { email, password, code } : { email, password }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; loginNeeded?: boolean; message?: string };
    if (res.ok && data.loginNeeded) {
      // The account exists but the automatic first login failed; the login page takes it from here.
      router.replace(`/login?created=1`);
      return;
    }
    if (res.ok) {
      // The response already set the session cookies, so the proxy lets the next request through.
      clearMe();
      router.replace("/");
      router.refresh();
      return;
    }
    setError(data.error ?? (signup ? "Sign-up failed." : "Login failed."));
    setBusy(false);
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <h1 className="text-lg font-semibold">CV Studio</h1>
          {signup && (
            <p className="text-sm text-muted">
              CV Studio is invite-only. Use the email address you were invited with and the invite code you were sent.
            </p>
          )}
          {!signup && justCreated && <p className="text-sm text-muted">Your account was created. Log in to continue.</p>}
        </div>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoFocus
            autoComplete="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {signup && (
          <div>
            <label htmlFor="code" className="label">
              Invite code
            </label>
            <input
              id="code"
              autoComplete="one-time-code"
              className="field font-mono uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        )}
        <div>
          <label htmlFor="password" className="label">
            {signup ? "Choose a password (8+ characters)" : "Password"}
          </label>
          <input
            id="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" className="btn w-full" disabled={busy || !email || !password || (signup && !code.trim())}>
          {busy ? "Checking..." : signup ? "Create account" : "Log in"}
        </button>
        <p className="text-center text-sm text-muted">
          {signup ? (
            <>
              Already have an account? <Link href="/login" className="text-accent">Log in</Link>
            </>
          ) : (
            <>
              Invited? <Link href="/signup" className="text-accent">Create your account</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}

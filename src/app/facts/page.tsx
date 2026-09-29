"use client";

// Edit your Fact Bank from any device. Add a project once and every future CV can use it.
// Loads the full text from /api/profile; the nav's account summary leaves it out.
import { useEffect, useState } from "react";
import ProfileEditor from "@/components/ProfileEditor";
import type { Profile } from "@/lib/types";

export default function FactsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/profile")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { profile?: Profile | null; error?: string };
        if (!res.ok || !data.profile) throw new Error(data.error ?? "Could not load your Fact Bank.");
        if (live) setProfile(data.profile);
      })
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : "Could not load your Fact Bank."));
    return () => {
      live = false;
    };
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!profile) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <h1 className="text-lg font-semibold">Fact Bank</h1>
        <p className="text-sm text-muted">
          Everything the app is allowed to say about you, plus the rules it follows. Edit section 3 when something new happens (a
          project, a job, a certificate). Move a claim out of section 4 once you have confirmed it.
        </p>
      </section>
      <ProfileEditor initial={profile} />
    </div>
  );
}

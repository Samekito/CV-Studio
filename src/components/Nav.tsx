"use client";

// Top bar on every signed-in page. Also the onboarding gate: a user without a profile yet is
// sent to /onboarding, because every other page needs their Fact Bank.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { clearMe, useMe } from "@/lib/me-client";

const LINKS = [
  { href: "/", label: "Tailor" },
  { href: "/answers", label: "Answers & Bios" },
  { href: "/tracker", label: "Tracker" },
  { href: "/facts", label: "Fact Bank" },
];

const SIGNED_OUT_PATHS = ["/login", "/signup"];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const signedOutPage = SIGNED_OUT_PATHS.includes(pathname);
  const { me } = useMe(!signedOutPage);
  const onboarding = pathname === "/onboarding";

  useEffect(() => {
    if (me && !me.profile && !onboarding) router.replace("/onboarding");
  }, [me, onboarding, router]);

  if (signedOutPage) return null;

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    try {
      // The Tailor page keeps the last job ad and result here; the next person on this browser must not see it.
      localStorage.removeItem("cv-studio.tailor");
    } catch {
      // Blocked storage holds nothing to clear.
    }
    clearMe();
    router.replace("/login");
    router.refresh();
  }

  const links = me?.isAdmin ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;

  return (
    <header className="no-print border-b border-border bg-surface">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-3">
        <span className="mr-3 font-semibold text-accent">CV Studio</span>
        {me?.profile &&
          links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-sm ${
                pathname === link.href ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        <span className="ml-auto flex items-center gap-3 text-sm text-muted">
          {me?.dailyLimit && (
            <span title="Generations used today (resets at midnight UTC)">
              {me.usedToday}/{me.dailyLimit} today
            </span>
          )}
          <button onClick={logout} className="hover:text-foreground">
            Log out
          </button>
        </span>
      </nav>
    </header>
  );
}

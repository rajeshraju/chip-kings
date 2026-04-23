"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/types";
import { ThemeToggle } from "./ThemeToggle";
import { toast } from "./Toaster";

type SessionView = { userId: string; username: string; role: Role } | null;

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionView>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => setUser(null));
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    toast("Signed out", "success");
    router.push("/");
    router.refresh();
  }

  const onLoginPage = pathname === "/login";
  const canWrite = user?.role === "admin" || user?.role === "editor";
  const tabs: { href: string; label: string; emoji: string; hidden?: boolean }[] = [
    { href: "/", label: "Calculator", emoji: "🧮" },
    { href: "/reports", label: "Games", emoji: "📁", hidden: !user },
    { href: "/ytd", label: "Report", emoji: "📈", hidden: !canWrite },
    { href: "/admin", label: "Admin", emoji: "⚙", hidden: user?.role !== "admin" },
  ];

  return (
    <header className="mb-6">
      <div className="flex justify-between items-center gap-3 mb-5">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Chip Kings"
            width={40}
            height={40}
            priority
            className="w-10 h-10 rounded-xl shadow-lg"
            style={{ boxShadow: "0 6px 20px rgb(var(--accent) / 0.4)" }}
          />
          <div>
            <h1 className="font-display text-xl font-bold tracking-tight leading-none">
              Chip Kings
            </h1>
            <p className="text-xs text-fg-muted mt-0.5">Poker settlement &amp; reporting</p>
          </div>
        </Link>
        <div className="flex gap-2 items-center">
          {user ? (
            <>
              <div className="hidden sm:flex flex-col items-end mr-1">
                <span className="text-xs text-fg-muted font-mono leading-none">
                  {user.username}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-fg-dim mt-0.5">
                  {user.role}
                </span>
              </div>
              <button onClick={logout} className="btn btn-ghost btn-small">
                Sign out
              </button>
            </>
          ) : !onLoginPage ? (
            <Link href="/login" className="btn btn-ghost btn-small">
              Sign in
            </Link>
          ) : null}
          <ThemeToggle />
        </div>
      </div>

      {!onLoginPage && (
        <nav
          className="flex gap-1 bg-bg-elevated p-1 rounded-xl border border-border"
          role="tablist"
        >
          {tabs
            .filter((t) => !t.hidden)
            .map((tab) => {
              const active =
                pathname === tab.href ||
                (tab.href !== "/" && pathname.startsWith(tab.href));
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex-1 py-2.5 px-3 rounded-lg font-medium text-sm transition-all text-center flex items-center justify-center gap-2 ${
                    active
                      ? "bg-bg-card text-fg shadow-sm"
                      : "text-fg-muted hover:text-fg"
                  }`}
                >
                  <span>{tab.emoji}</span>
                  <span>{tab.label}</span>
                </Link>
              );
            })}
        </nav>
      )}
    </header>
  );
}

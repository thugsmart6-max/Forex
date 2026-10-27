"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNow } from "@/lib/hooks";
import { marketOpen } from "@/lib/sessions";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Markets", icon: "M3 17l5-6 4 4 8-10M14 5h6v6" },
  { href: "/backtest", label: "Backtest", icon: "M4 19V5M4 19h16M8 15l3-4 3 2 5-6" },
  { href: "/paper", label: "Paper Trade", icon: "M12 3v18M5 8h9.5a3.5 3.5 0 010 7H6" },
  { href: "/guide", label: "Guide", icon: "M5 4h10a4 4 0 014 4v12H9a4 4 0 01-4-4V4zM9 8h6M9 12h6" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the pre-hydration script
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };
  return (
    <button onClick={flip} className="rounded-lg p-2 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title="Toggle theme">
      {theme === "dark" ? <Icon d="M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5L19 5M12 8a4 4 0 100 8 4 4 0 000-8z" /> : <Icon d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />}
    </button>
  );
}

function Clock() {
  const now = useNow(1000);
  if (now == null) return <span className="w-36" />;
  const open = marketOpen(now);
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium", open ? "bg-up/15 text-up" : "bg-surface-2 text-ink-2")}>
        <span className={cx("h-1.5 w-1.5 rounded-full", open ? "bg-up animate-pulse" : "bg-ink-3")} />
        {open ? "FX market open" : "FX market closed"}
      </span>
      <span className="num hidden text-ink-2 sm:inline">{new Date(now).toISOString().slice(11, 19)} UTC</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">FX</span>
          <span>
            <span className="block text-sm font-semibold leading-tight">FX Algo Desk</span>
            <span className="block text-[11px] text-ink-3">Backtest · Paper trade</span>
          </span>
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active(n.href) ? "bg-accent/15 text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon d={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
        <p className="mt-auto px-2 text-[11px] leading-relaxed text-ink-3">
          Simulated account only — no real orders are ever sent. Educational tool, not financial advice.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-6">
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-xs font-bold text-white">FX</span>
            <span className="text-sm font-semibold">FX Algo Desk</span>
          </Link>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            <Clock />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 pt-5 pb-24 md:px-6 md:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active(n.href) ? "text-accent" : "text-ink-3")}>
            <Icon d={n.icon} />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

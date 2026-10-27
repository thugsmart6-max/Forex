"use client";

import type { ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ title, subtitle, actions, children, className }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md", label }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === o.value ? "bg-surface-3 text-ink shadow-sm" : "text-ink-3 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Button({ children, onClick, variant = "secondary", disabled, className, type = "button", title }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-white hover:brightness-110",
        variant === "secondary" && "border border-line bg-surface-2 text-ink hover:bg-surface-3",
        variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
        variant === "danger" && "border border-down/40 text-down hover:bg-down/10",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, help, children }: { label: ReactNode; help?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2" title={help}>
        {label}
        {help && <span className="ml-1 cursor-help text-ink-3" aria-hidden>ⓘ</span>}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent num";

export function Stat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: "up" | "down" | "warn"; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5" title={hint}>
      <div className="text-xs text-ink-3">{label}</div>
      <div className={cx("num mt-0.5 text-lg font-semibold", tone === "up" && "text-up", tone === "down" && "text-down", tone === "warn" && "text-warn", !tone && "text-ink")}>
        {value}
      </div>
    </div>
  );
}

/** Direction badge: never colour alone - always an arrow and a word. */
export function SignalBadge({ dir }: { dir: number }) {
  if (dir > 0) return <span className="inline-flex items-center gap-1 rounded-full bg-up/15 px-2 py-0.5 text-xs font-semibold text-up">▲ LONG</span>;
  if (dir < 0) return <span className="inline-flex items-center gap-1 rounded-full bg-down/15 px-2 py-0.5 text-xs font-semibold text-down">▼ SHORT</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-ink-2">● FLAT</span>;
}

export function Change({ pct, abs }: { pct: number | null | undefined; abs?: string }) {
  if (pct == null || !Number.isFinite(pct)) return <span className="text-ink-3">—</span>;
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <span className={cx("num font-medium whitespace-nowrap", flat ? "text-ink-2" : up ? "text-up" : "text-down")}>
      {flat ? "•" : up ? "▲" : "▼"} {abs ? `${abs} ` : ""}
      {up ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-3" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-3 border-t-accent" />
      {label}…
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-ink-3">{children}</div>;
}

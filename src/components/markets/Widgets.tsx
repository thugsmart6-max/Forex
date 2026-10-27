"use client";

import { BY_ID, fmtPrice, STRENGTH_SOURCES } from "@/lib/instruments";
import { useNow } from "@/lib/hooks";
import { SESSIONS, marketOpen, sessionOpen, utcWindow } from "@/lib/sessions";
import type { Quote } from "@/lib/types";
import { Card, Change, cx } from "../ui";
import { Sparkline } from "../charts";

export function PulseTile({ id, q, onClick, active }: { id: string; q?: Quote; onClick: () => void; active: boolean }) {
  const inst = BY_ID[id];
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex min-w-0 flex-col rounded-xl border bg-surface p-3 text-left transition-colors hover:border-accent/60",
        active ? "border-accent" : "border-line",
      )}
    >
      <span className="truncate text-xs font-medium text-ink-3">{inst.name}</span>
      <span className="num mt-1 text-lg font-semibold">{fmtPrice(id, q?.price)}</span>
      <span className="mt-0.5 flex items-end justify-between gap-2 text-xs">
        <Change pct={q?.changePct} />
        <Sparkline values={q?.spark ?? []} width={64} height={22} />
      </span>
    </button>
  );
}

export function RatioTile({ gold, silver }: { gold?: Quote; silver?: Quote }) {
  const ratio = gold?.price && silver?.price ? gold.price / silver.price : null;
  const prev = gold?.prevClose && silver?.prevClose ? gold.prevClose / silver.prevClose : null;
  const chg = ratio && prev ? ((ratio - prev) / prev) * 100 : null;
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-3" title="Ounces of silver needed to buy one ounce of gold — the input of the pair-ratio strategy">
      <span className="truncate text-xs font-medium text-ink-3">Gold / Silver ratio</span>
      <span className="num mt-1 text-lg font-semibold">{ratio ? ratio.toFixed(2) : "—"}</span>
      <span className="mt-0.5 text-xs">
        <Change pct={chg} />
      </span>
    </div>
  );
}

export function SessionsCard() {
  const now = useNow(30_000);
  const hourNow = now == null ? 0 : new Date(now).getUTCHours() + new Date(now).getUTCMinutes() / 60;
  const open = now != null && marketOpen(now);
  const inBreakout = open && hourNow >= 7 && hourNow < 17;
  return (
    <Card title="Trading sessions" subtitle="24h timeline in UTC · daylight saving handled automatically">
      <div className="space-y-2.5">
        {SESSIONS.map((s) => {
          const w = now == null ? { start: 0, end: 0 } : utcWindow(s, now);
          const isOpen = now != null && sessionOpen(s, now);
          const segs = w.end > 24 ? [[w.start, 24], [0, w.end - 24]] : [[w.start, w.end]];
          return (
            <div key={s.name} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs font-medium text-ink-2">{s.name}</span>
              <div className="relative h-5 flex-1 rounded bg-surface-2">
                {segs.map(([a, b], i) => (
                  <div
                    key={i}
                    className={cx("absolute inset-y-0 rounded", isOpen ? "bg-accent/70" : "bg-surface-3")}
                    style={{ left: `${(a / 24) * 100}%`, width: `${((b - a) / 24) * 100}%` }}
                  />
                ))}
                {now != null && <div className="absolute inset-y-[-3px] w-0.5 rounded bg-ink" style={{ left: `${(hourNow / 24) * 100}%` }} aria-hidden />}
              </div>
              <span className={cx("w-14 shrink-0 text-right text-xs font-medium", isOpen ? "text-up" : "text-ink-3")}>{isOpen ? "● Open" : "Closed"}</span>
            </div>
          );
        })}
        <div className="num flex justify-between pl-[92px] pr-[68px] text-[10px] text-ink-3">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
        </div>
        <p className={cx("rounded-lg px-3 py-2 text-xs", inBreakout ? "bg-up/10 text-up" : "bg-surface-2 text-ink-2")}>
          {inBreakout ? "✓ Inside" : "○ Outside"} the Breakout strategy&apos;s London/NY entry window (07–17 UTC)
        </p>
      </div>
    </Card>
  );
}

export function StrengthCard({ quotes }: { quotes: Record<string, Quote> }) {
  const rows = STRENGTH_SOURCES.map((s) => ({ ...s, pct: quotes[s.id]?.changePct ?? null }))
    .filter((r): r is typeof r & { pct: number } => r.pct != null)
    .sort((a, b) => b.pct - a.pct);
  const max = Math.max(0.1, ...rows.map((r) => Math.abs(r.pct)));
  return (
    <Card title="Currency strength" subtitle="Today's change of each currency index (DXY + PHLX indices)">
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">Waiting for index data…</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.ccy} className="grid grid-cols-[2.5rem_1fr_4.5rem] items-center gap-2 text-xs" title={BY_ID[r.id].desc}>
              <span className="font-semibold text-ink">{r.ccy}</span>
              <div className="relative h-4">
                <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
                <div
                  className={cx("absolute inset-y-0.5 rounded-sm", r.pct >= 0 ? "bg-up/70" : "bg-down/70")}
                  style={r.pct >= 0
                    ? { left: "50%", width: `${(r.pct / max) * 50}%` }
                    : { right: "50%", width: `${(-r.pct / max) * 50}%` }}
                />
              </div>
              <span className="text-right"><Change pct={r.pct} /></span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

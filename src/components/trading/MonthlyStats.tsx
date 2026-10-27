"use client";

import { useMemo, useState } from "react";
import type { MonthStat } from "@/lib/backtest";
import { download, toCsv } from "@/lib/csv";
import { usd } from "@/lib/format";
import { Card, cx } from "../ui";
import "./stat-card.css";

type Metric = "winRate" | "ret" | "pnl";

const METRICS: { key: Metric; label: string }[] = [
  { key: "winRate", label: "Win rate" },
  { key: "ret", label: "Return %" },
  { key: "pnl", label: "P&L" },
];

const monthLabel = (m: string, withYear = false) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleString("en-US", { month: "short", ...(withYear ? { year: "2-digit" } : {}), timeZone: "UTC" });

const fmtMetric = (metric: Metric, v: number) =>
  Number.isNaN(v) ? "no trades" : metric === "pnl" ? usd(v, 0) : `${metric === "ret" && v >= 0 ? "+" : ""}${(v * 100).toFixed(metric === "ret" ? 1 : 0)}%`;

/** Donut arc: a slice of the ring starting at `from` (0-1), `size` long. */
function Arc({ from, size, cls }: { from: number; size: number; cls: string }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  // leave a small gap so the rounded caps of neighbouring slices don't overlap
  const len = Math.max(0, size * c - (size < 1 ? 16 : 0));
  if (len <= 0) return null;
  return (
    <circle
      className={`donut-segment ${cls}`}
      cx="85" cy="85" r={r}
      strokeDasharray={`${len} ${c}`}
      strokeDashoffset={-from * c - (size < 1 ? 8 : 0)}
      transform="rotate(-90 85 85)"
    />
  );
}

const fmtDay = (t: number) => new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function MonthlyStatCard({ months, initial, finalEquity, start, end }: {
  months: MonthStat[];
  initial: number;
  finalEquity: number;
  start: number; // first bar, unix seconds
  end: number; // last bar, unix seconds
}) {
  const days = Math.round((end - start) / 86400);
  const [metric, setMetric] = useState<Metric>("winRate");
  const [menuOpen, setMenuOpen] = useState(false);

  const won = months.filter((m) => m.ret > 0).length;
  const lost = months.filter((m) => m.ret < 0).length;
  const flat = months.length - won - lost;
  const share = months.length ? won / months.length : 0;
  const totalReturn = finalEquity - initial;
  const totalPct = totalReturn / initial;

  // line chart: last 12 months
  const recent = months.slice(-12);
  const W = 360, H = 120, PX = 18, TOP = 34, BOT = 92;
  const vals = recent.map((m) => (metric === "winRate" ? m.winRate : m[metric]));
  const finite = vals.filter((v) => !Number.isNaN(v));
  const lo = metric === "winRate" ? 0 : Math.min(0, ...finite);
  const hi = metric === "winRate" ? 1 : Math.max(0, ...finite);
  const span = hi - lo || 1;
  const x = (i: number) => (recent.length < 2 ? W / 2 : PX + (i / (recent.length - 1)) * (W - 2 * PX));
  const y = (v: number) => BOT - ((v - lo) / span) * (BOT - TOP);
  const pts = recent.map((_, i) => (Number.isNaN(vals[i]) ? null : [x(i), y(vals[i])] as const));
  const path = pts.filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p![0].toFixed(1)},${p![1].toFixed(1)}`).join(" ");
  const lineColor = metric === "winRate" ? "#3d8bff" : metric === "ret" ? "#ff6a3d" : "#1ecb6b";

  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <h2 className="stat-card-title">Monthly performance</h2>
        <div className="menu-wrapper">
          <input id="monthly-menu" type="checkbox" className="menu-toggle" checked={menuOpen} onChange={(e) => setMenuOpen(e.target.checked)} />
          <label htmlFor="monthly-menu" className="menu-dots" aria-label="Choose the line-chart metric">
            <span /><span /><span />
          </label>
          <div className="menu-select" role="menu">
            {METRICS.map((m) => (
              <div key={m.key} role="menuitem" onClick={() => { setMetric(m.key); setMenuOpen(false); }}>
                {metric === m.key ? "✓ " : ""}{m.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stat-card-chart">
        <svg className="donut" viewBox="0 0 170 170" role="img" aria-label={`${won} of ${months.length} months profitable`}>
          <circle className="donut-bg" cx="85" cy="85" r="70" />
          <Arc from={0} size={won / (months.length || 1)} cls="income" />
          <Arc from={won / (months.length || 1)} size={lost / (months.length || 1)} cls="product" />
          <Arc from={(won + lost) / (months.length || 1)} size={flat / (months.length || 1)} cls="sales" />
          <text className="donut-text-main" x="85" y="88" textAnchor="middle">{Math.round(share * 100)}%</text>
          <text className="donut-text-sub" x="85" y="112" textAnchor="middle">winning months</text>
        </svg>
      </div>

      <div className="stat-card-legend">
        <div className="legend-item">
          <span><span className="legend-dot sales" />Investment</span>
          <span className="num">{usd(initial, 0)}</span>
        </div>
        <div className="legend-item">
          <span><span className="legend-dot income" />Returns</span>
          <span className="num">
            {totalReturn >= 0 ? "+" : ""}{usd(totalReturn, 0)}
            <span className="legend-change" style={totalReturn < 0 ? { color: "#ff6a3d" } : undefined}>
              {totalPct >= 0 ? "▲ +" : "▼ "}{(totalPct * 100).toFixed(1)}%
            </span>
          </span>
        </div>
        <div className="legend-item">
          <span><span className="legend-dot income" />Winning months</span>
          <span className="num">{won}</span>
        </div>
        <div className="legend-item">
          <span><span className="legend-dot product" />Losing months</span>
          <span className="num">{lost}</span>
        </div>
        <div className="legend-item">
          <span>
            Final equity
            <span style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: totalReturn >= 0 ? "#1ecb6b" : "#ff6a3d" }}>
              {totalReturn >= 0 ? "▲ PROFIT" : "▼ LOSS"}
            </span>
          </span>
          <span className="legend-value num" style={{ color: totalReturn >= 0 ? "#1ecb6b" : "#ff6a3d" }}>{usd(finalEquity, 0)}</span>
        </div>
        <p style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.5, color: "#b0b6c3", background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "0.6rem 0.75rem" }}>
          {totalReturn >= 0 ? "Profit" : "Loss"} of{" "}
          <b style={{ color: totalReturn >= 0 ? "#1ecb6b" : "#ff6a3d" }}>{usd(Math.abs(totalReturn), 0)} ({(totalPct * 100).toFixed(1)}%)</b>{" "}
          on <b style={{ color: "#f3f6fa" }}>{usd(initial, 0)}</b> invested over{" "}
          <b style={{ color: "#f3f6fa" }}>{days} days</b> (≈{(days / 30.44).toFixed(1)} months)
          <br />
          {fmtDay(start)} → {fmtDay(end)}
        </p>
      </div>

      <div>
        <div className="legend-item" style={{ fontSize: "0.85rem", marginBottom: 4 }}>
          <span>{METRICS.find((m) => m.key === metric)!.label} · last {recent.length} months</span>
          <span style={{ color: "#6c7383" }}>hover a dot</span>
        </div>
        <svg className="linechart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly chart">
          {metric !== "winRate" && lo < 0 && <line x1={PX} x2={W - PX} y1={y(0)} y2={y(0)} stroke="#3a3f4d" strokeDasharray="3 4" />}
          <path d={path} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => {
            if (!p) return null;
            const tipW = 128;
            const tx = Math.min(W - tipW - 2, Math.max(2, p[0] - tipW / 2));
            const ty = p[1] - 34 < 0 ? p[1] + 10 : p[1] - 34;
            return (
              <g key={recent[i].month} className="dot-group">
                <circle cx={p[0]} cy={p[1]} r="12" fill="transparent" />
                <circle cx={p[0]} cy={p[1]} r="4" fill={lineColor} stroke="#232733" strokeWidth="2" />
                <g className="tooltip">
                  <rect x={tx} y={ty} width={tipW} height="26" rx="8" />
                  <text x={tx + tipW / 2} y={ty + 18} textAnchor="middle">
                    {monthLabel(recent[i].month, true)}: {fmtMetric(metric, vals[i])}
                  </text>
                </g>
              </g>
            );
          })}
          <g className="x-labels">
            {recent.map((m, i) => (recent.length <= 6 || i % 2 === (recent.length - 1) % 2) && (
              <text key={m.month} x={x(i)} y={H - 6} textAnchor="middle">{monthLabel(m.month)}</text>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

export function MonthlyTable({ months }: { months: MonthStat[] }) {
  const rows = useMemo(() => [...months].reverse(), [months]);
  const totals = months.reduce((a, m) => ({ trades: a.trades + m.trades, wins: a.wins + m.wins }), { trades: 0, wins: 0 });
  return (
    <Card
      className="min-w-0 flex-1 basis-[420px]"
      title="Month by month"
      subtitle={`${months.length} months · ${totals.wins} of ${totals.trades} trades won (${totals.trades ? ((totals.wins / totals.trades) * 100).toFixed(0) : 0}%) · return is on the equity at the start of each month`}
    >
      <div className="-mx-4 max-h-[640px] overflow-auto">
        <table className="num w-full min-w-[560px] text-xs">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-left text-ink-3">
              <th className="py-2 pl-4 font-medium">Month</th>
              <th className="py-2 text-right font-medium">Trades</th>
              <th className="py-2 text-right font-medium">Won / Lost</th>
              <th className="py-2 pl-4 font-medium">Win rate</th>
              <th className="py-2 text-right font-medium">Invested (start)</th>
              <th className="py-2 text-right font-medium">P&amp;L</th>
              <th className="py-2 pr-4 text-right font-medium">Return</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.month} className="border-b border-line/60 last:border-0">
                <td className="py-1.5 pl-4 font-medium text-ink">{monthLabel(m.month, true)}</td>
                <td className="py-1.5 text-right">{m.trades}</td>
                <td className="py-1.5 text-right text-ink-2">
                  <span className="text-up">{m.wins}</span> / <span className="text-down">{m.trades - m.wins}</span>
                </td>
                <td className="py-1.5 pl-4">
                  {Number.isNaN(m.winRate) ? (
                    <span className="text-ink-3">—</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${m.winRate * 100}%` }} />
                      </span>
                      {(m.winRate * 100).toFixed(0)}%
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right text-ink-2">{usd(m.startEquity, 0)}</td>
                <td className={cx("py-1.5 text-right font-semibold", m.pnl > 0 ? "text-up" : m.pnl < 0 ? "text-down" : "")}>{usd(m.pnl)}</td>
                <td className={cx("py-1.5 pr-4 text-right font-semibold", m.ret > 0 ? "text-up" : m.ret < 0 ? "text-down" : "")}>
                  {m.ret > 0 ? "▲ +" : m.ret < 0 ? "▼ " : ""}{(m.ret * 100).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface YearStat {
  year: string;
  startEquity: number;
  endEquity: number;
  pnl: number;
  ret: number;
  trades: number;
  wins: number;
  best: MonthStat | null;
  worst: MonthStat | null;
  months: number;
  winningMonths: number;
}

/** Roll the monthly results up into calendar years (returns compound month to month). */
export function yearlyStats(months: MonthStat[]): YearStat[] {
  const by = new Map<string, MonthStat[]>();
  for (const m of months) {
    const y = m.month.slice(0, 4);
    by.set(y, [...(by.get(y) ?? []), m]);
  }
  return [...by].map(([year, ms]) => {
    const start = ms[0].startEquity;
    const end = ms.at(-1)!.endEquity;
    const sorted = [...ms].sort((a, b) => a.ret - b.ret);
    return {
      year, startEquity: start, endEquity: end, pnl: end - start, ret: end / start - 1,
      trades: ms.reduce((s, m) => s + m.trades, 0), wins: ms.reduce((s, m) => s + m.wins, 0),
      best: sorted.at(-1) ?? null, worst: sorted[0] ?? null,
      months: ms.length, winningMonths: ms.filter((m) => m.ret > 0).length,
    };
  });
}

/** Green/red cell tint, stronger for bigger moves; the number itself stays in normal text colour. */
function tint(ret: number, scale: number) {
  if (!ret) return "var(--surface-2)";
  const strength = Math.round(12 + Math.min(1, Math.abs(ret) / scale) * 48);
  return `color-mix(in srgb, var(${ret > 0 ? "--up" : "--down"}) ${strength}%, var(--surface))`;
}

const signed = (v: number, d = 1) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

export function ReturnsCalendar({ months, fileName = "returns" }: { months: MonthStat[]; fileName?: string }) {
  const years = useMemo(() => yearlyStats(months), [months]);
  const byMonth = useMemo(() => new Map(months.map((m) => [m.month, m])), [months]);
  const scale = Math.max(0.01, ...months.map((m) => Math.abs(m.ret)));
  if (!months.length) return null;

  const exportCsv = () => {
    const monthly = months.map((m) => ({
      month: m.month, trades: m.trades, wins: m.wins, win_rate_pct: m.trades ? ((m.wins / m.trades) * 100).toFixed(1) : "",
      start_equity: m.startEquity.toFixed(2), end_equity: m.endEquity.toFixed(2), pnl: m.pnl.toFixed(2), return_pct: (m.ret * 100).toFixed(2),
    }));
    const yearly = years.map((y) => ({
      year: y.year, months: y.months, winning_months: y.winningMonths, trades: y.trades, wins: y.wins,
      start_equity: y.startEquity.toFixed(2), end_equity: y.endEquity.toFixed(2), pnl: y.pnl.toFixed(2), return_pct: (y.ret * 100).toFixed(2),
    }));
    download(`${fileName}_monthly.csv`, toCsv(monthly));
    setTimeout(() => download(`${fileName}_yearly.csv`, toCsv(yearly)), 300);
  };

  return (
    <Card
      title="Returns calendar"
      subtitle="Profit % for every month and year · each month is measured on the equity at its start · years compound their months"
      actions={<button onClick={exportCsv} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">⤓ Monthly + yearly CSV</button>}
    >
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="num w-full min-w-[720px] border-separate border-spacing-[3px] text-xs">
          <thead>
            <tr className="text-ink-3">
              <th className="px-2 py-1 text-left font-medium">Year</th>
              {MONTHS.map((m) => <th key={m} className="px-1 py-1 font-medium">{m}</th>)}
              <th className="px-2 py-1 font-semibold text-ink-2">Year</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.year}>
                <td className="px-2 py-1 font-semibold text-ink">{y.year}</td>
                {MONTHS.map((_, i) => {
                  const m = byMonth.get(`${y.year}-${String(i + 1).padStart(2, "0")}`);
                  if (!m) return <td key={i} className="rounded-md bg-surface-2/40 px-1 py-2 text-center text-ink-3">·</td>;
                  return (
                    <td
                      key={i}
                      className="rounded-md px-1 py-2 text-center font-medium text-ink"
                      style={{ background: tint(m.ret, scale) }}
                      title={`${m.month}: ${signed(m.ret, 2)} · P&L ${usd(m.pnl)} · ${m.trades} trades, ${m.wins} won`}
                    >
                      {signed(m.ret)}
                    </td>
                  );
                })}
                <td className="rounded-md px-2 py-2 text-center font-bold text-ink" style={{ background: tint(y.ret, scale * 3), outline: "1px solid var(--border)" }}>
                  {y.ret > 0 ? "▲ " : y.ret < 0 ? "▼ " : ""}{signed(y.ret)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Yearly summary</h3>
      <div className="-mx-4 overflow-x-auto">
        <table className="num w-full min-w-[680px] text-xs">
          <thead>
            <tr className="border-b border-line text-left text-ink-3">
              <th className="py-2 pl-4 font-medium">Year</th>
              <th className="py-2 text-right font-medium">Start equity</th>
              <th className="py-2 text-right font-medium">End equity</th>
              <th className="py-2 text-right font-medium">Profit / loss</th>
              <th className="py-2 text-right font-medium">Return</th>
              <th className="py-2 text-right font-medium">Winning months</th>
              <th className="py-2 text-right font-medium">Trades (win rate)</th>
              <th className="py-2 pr-4 text-right font-medium">Best / worst month</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.year} className="border-b border-line/60 last:border-0">
                <td className="py-1.5 pl-4 font-semibold text-ink">{y.year}{y.months < 12 && <span className="ml-1 text-[10px] font-normal text-ink-3">({y.months} mo)</span>}</td>
                <td className="py-1.5 text-right text-ink-2">{usd(y.startEquity, 0)}</td>
                <td className="py-1.5 text-right text-ink-2">{usd(y.endEquity, 0)}</td>
                <td className={cx("py-1.5 text-right font-semibold", y.pnl > 0 ? "text-up" : y.pnl < 0 ? "text-down" : "")}>{y.pnl > 0 ? "+" : ""}{usd(y.pnl, 0)}</td>
                <td className={cx("py-1.5 text-right font-semibold", y.ret > 0 ? "text-up" : y.ret < 0 ? "text-down" : "")}>{y.ret > 0 ? "▲ " : y.ret < 0 ? "▼ " : ""}{signed(y.ret, 2)}</td>
                <td className="py-1.5 text-right">{y.winningMonths} / {y.months}</td>
                <td className="py-1.5 text-right">{y.trades} ({y.trades ? `${((y.wins / y.trades) * 100).toFixed(0)}%` : "—"})</td>
                <td className="py-1.5 pr-4 text-right text-ink-2">
                  {y.best && <span className="text-up">{monthLabel(y.best.month)} {signed(y.best.ret)}</span>} / {y.worst && <span className="text-down">{monthLabel(y.worst.month)} {signed(y.worst.ret)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

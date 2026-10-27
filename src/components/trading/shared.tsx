"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { EngineConfig, Trade } from "@/lib/engine";
import { BY_ID, TRADABLE, fmtPrice } from "@/lib/instruments";
import type { Stats } from "@/lib/backtest";
import { CLASSIC, HIGH_WIN_LIST, type Params, type StrategyDef, type StrategyKey } from "@/lib/strategies";
import { dateTime, num, pct, usd } from "@/lib/format";
import { Field, Stat, cx, inputCls } from "../ui";

/** A single strategy, or one of the two compare-everything modes. */
export type StrategyPick = StrategyKey | "all" | "allhw";

/** Strategies run by a pick: the compare modes expand to their whole group. */
export function pickKeys(pick: StrategyPick): StrategyKey[] {
  if (pick === "all") return CLASSIC.map((s) => s.key);
  if (pick === "allhw") return HIGH_WIN_LIST.map((s) => s.key);
  return [pick];
}

export function StrategyPicker({ value, onChange, allowAll, custom = [] }: {
  value: StrategyPick;
  onChange: (v: StrategyPick) => void;
  allowAll?: boolean;
  /** the user's Strategy Builder strategies */
  custom?: StrategyDef[];
}) {
  type Opt = { key: StrategyPick; name: string; short: string; tag?: string };
  const groups: { title: string; note: string; opts: Opt[]; mine?: boolean }[] = [
    {
      title: "My strategies",
      note: "Built by you in the Strategy Builder.",
      mine: true,
      opts: custom.map((s) => ({ key: s.key, name: s.name, short: s.short, tag: "MINE" })),
    },
    {
      title: "High win-rate (new)",
      note: "Small take-profit, wider stop: wins often, but each loss costs about 3 wins.",
      opts: [
        ...HIGH_WIN_LIST.map((s) => ({ key: s.key, name: s.name, short: s.short, tag: "60–75% wins" })),
        ...(allowAll ? [{ key: "allhw" as const, name: "Compare high-win 5", short: "Run all five new strategies and rank them side by side." }] : []),
      ],
    },
    {
      title: "Classic (from the strategy guide)",
      note: "Let winners run with trailing stops: fewer, bigger wins.",
      opts: [
        ...CLASSIC.map((s) => ({ key: s.key, name: s.name, short: s.short })),
        ...(allowAll ? [{ key: "all" as const, name: "Compare classic 4", short: "Run the four classic strategies and rank them side by side." }] : []),
      ],
    },
  ];
  return (
    <div className="space-y-4" role="radiogroup" aria-label="Strategy">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-2">{g.title}</div>
            <div className="text-[11px] text-ink-3">{g.note}</div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
      {g.mine && (
        <Link href="/builder" className="grid place-items-center rounded-lg border border-dashed border-accent/60 p-3 text-center text-sm font-semibold text-accent hover:bg-accent/10">
          <span>＋ {custom.length ? "Create another" : "Create your own strategy"}<span className="mt-1 block text-xs font-normal text-ink-3">No coding — pick indicators and rules</span></span>
        </Link>
      )}
      {g.opts.map((o) => (
        <button
          key={o.key}
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={cx(
            "rounded-lg border p-3 text-left transition-colors",
            value === o.key ? "border-accent bg-accent/10" : "border-line bg-surface-2 hover:border-ink-3",
          )}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={cx("grid h-4 w-4 shrink-0 place-items-center rounded-full border", value === o.key ? "border-accent" : "border-ink-3")}>
              {value === o.key && <span className="h-2 w-2 rounded-full bg-accent" />}
            </span>
            {o.name}
          </div>
          {o.tag && <span className={cx("mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold", o.tag === "MINE" ? "bg-accent/15 text-accent" : "bg-up/15 text-up")}>{o.tag}</span>}
          <p className="mt-1 text-xs leading-snug text-ink-3">{o.short}</p>
        </button>
      ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const GROUPS = [
  { label: "Majors", cat: "majors" },
  { label: "Metals", cat: "metals" },
  { label: "INR & Exotics", cat: "asia" },
] as const;

export function InstrumentChips({ value, onChange, max = 4 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : value.length >= max ? [...value.slice(1), id] : [...value, id]);
  return (
    <div className="space-y-2">
      {GROUPS.map((g) => (
        <div key={g.cat}>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-3">{g.label}</div>
          <div className="flex flex-wrap gap-1.5">
            {TRADABLE.filter((i) => i.category === g.cat).map((i) => {
              const on = value.includes(i.id);
              return (
                <button
                  key={i.id}
                  onClick={() => toggle(i.id)}
                  aria-pressed={on}
                  title={i.desc}
                  className={cx("rounded-full border px-2.5 py-1 text-xs font-medium", on ? "border-accent bg-accent/15 text-accent" : "border-line text-ink-2 hover:text-ink")}
                >
                  {on ? "✓ " : ""}{i.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-ink-3">Pick 1–{max}. Crosses &amp; indices are watch-only (USD account P&amp;L).</p>
    </div>
  );
}

export function InstrumentSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {GROUPS.map((g) => (
          <optgroup key={g.cat} label={g.label}>
            {TRADABLE.filter((i) => i.category === g.cat).map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

export function ParamsEditor({ def, params, onChange }: { def: StrategyDef; params: Params; onChange: (p: Params) => void }) {
  if (def.group === "custom") {
    return (
      <p className="text-xs text-ink-3">
        Rules, take-profit and stop for <b className="text-ink-2">{def.name}</b> are edited in the{" "}
        <Link href={`/builder?id=${def.key.slice(7)}`} className="font-medium text-accent hover:underline">Strategy Builder →</Link>
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {def.params.map((p) =>
        p.type === "bool" ? (
          <label key={p.key} className="col-span-2 flex items-center gap-2 text-sm text-ink-2" title={p.help}>
            <input type="checkbox" checked={Boolean(params[p.key])} onChange={(e) => onChange({ ...params, [p.key]: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
            {p.label} <span className="text-xs text-ink-3">— {p.help}</span>
          </label>
        ) : (
          <Field key={p.key} label={p.label} help={p.help}>
            <input
              type="number"
              className={inputCls}
              value={String(params[p.key])}
              min={p.min}
              max={p.max}
              step={p.step ?? 1}
              onChange={(e) => onChange({ ...params, [p.key]: p.type === "int" ? Math.round(Number(e.target.value)) : Number(e.target.value) })}
            />
          </Field>
        ),
      )}
      <button onClick={() => onChange({ ...def.defaults })} className="col-span-2 justify-self-start text-xs text-accent hover:underline">
        Reset to defaults
      </button>
    </div>
  );
}

export function RiskEditor({ cfg, onChange, showPair }: { cfg: EngineConfig; onChange: (c: EngineConfig) => void; showPair: boolean }) {
  const pctField = (key: "riskPerTrade" | "maxDailyLoss" | "pairNotionalFrac", label: string, help: string) => (
    <Field label={label} help={help}>
      <div className="relative">
        <input type="number" className={inputCls} step={0.1} min={0} value={+(cfg[key] * 100).toFixed(3)} onChange={(e) => onChange({ ...cfg, [key]: Number(e.target.value) / 100 })} />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-3">%</span>
      </div>
    </Field>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Starting balance (USD)" help="Simulated account size">
        <input type="number" className={inputCls} min={100} step={1000} value={cfg.initialEquity} onChange={(e) => onChange({ ...cfg, initialEquity: Number(e.target.value) })} />
      </Field>
      {pctField("riskPerTrade", "Risk per trade", "Equity risked per ATR-sized trade (distance to the initial stop)")}
      <Field label="Stop distance (× ATR)" help="Initial stop = this many ATRs from entry">
        <input type="number" className={inputCls} min={0.5} step={0.25} value={cfg.stopAtrMult} onChange={(e) => onChange({ ...cfg, stopAtrMult: Number(e.target.value) })} />
      </Field>
      <Field label="Max leverage (×)" help="Cap on position notional / equity">
        <input type="number" className={inputCls} min={1} step={1} value={cfg.maxLeverage} onChange={(e) => onChange({ ...cfg, maxLeverage: Number(e.target.value) })} />
      </Field>
      {pctField("maxDailyLoss", "Daily loss limit", "Flatten and stop for the day after losing this much from the day's starting equity (0 = off)")}
      {showPair && pctField("pairNotionalFrac", "Pair leg size", "Notional per leg for the pair strategy, as % of equity")}
      <label className="col-span-2 flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={cfg.trailing} onChange={(e) => onChange({ ...cfg, trailing: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
        Trail the stop with the close (ATR trailing stop)
      </label>
    </div>
  );
}

export function KpiGrid({ s, initial }: { s: Stats; initial: number }) {
  const tone = (v: number) => (v > 0 ? "up" : v < 0 ? "down" : undefined);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      <Stat label="Final equity" value={usd(s.finalEquity, 0)} tone={tone(s.finalEquity - initial)} />
      <Stat label="Total return" value={pct(s.totalReturn)} tone={tone(s.totalReturn)} />
      <Stat label="CAGR" value={pct(s.cagr)} tone={tone(s.cagr)} hint="Compound annual growth rate" />
      <Stat label="Max drawdown" value={pct(s.maxDrawdown)} tone={s.maxDrawdown < -0.2 ? "down" : undefined} hint="Largest peak-to-trough fall" />
      <Stat label="Sharpe" value={num(s.sharpe)} hint="Annualised return / volatility" />
      <Stat label="Win rate" value={Number.isNaN(s.winRate) ? "—" : `${(s.winRate * 100).toFixed(0)}%`} />
      <Stat label="Profit factor" value={num(s.profitFactor)} tone={s.profitFactor > 1 ? "up" : s.profitFactor < 1 ? "down" : undefined} hint="Gross profit / gross loss" />
      <Stat label="Trades" value={s.trades} hint={`${s.stops} stopped out · max ${s.maxConsecLosses} losses in a row`} />
    </div>
  );
}

export function TradesTable({ trades, pageSize = 20 }: { trades: Trade[]; pageSize?: number }) {
  const [page, setPage] = useState(0);
  const [newestFirst, setNewestFirst] = useState(true);
  const sorted = useMemo(() => (newestFirst ? [...trades].reverse() : trades), [trades, newestFirst]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const p = Math.min(page, pages - 1);
  const rows = sorted.slice(p * pageSize, (p + 1) * pageSize);
  if (!trades.length) return <p className="py-6 text-center text-sm text-ink-3">No closed trades yet.</p>;
  return (
    <div>
      <div className="-mx-4 overflow-x-auto">
        <table className="num w-full min-w-[820px] text-xs">
          <thead>
            <tr className="border-b border-line text-left text-ink-3">
              <th className="py-2 pl-4 font-medium">Instrument</th>
              <th className="py-2 font-medium">Side</th>
              <th className="py-2 text-right font-medium">Lots</th>
              <th className="py-2 pl-4 font-medium">
                <button onClick={() => setNewestFirst(!newestFirst)} className="hover:text-ink">Entry time {newestFirst ? "↓" : "↑"}</button>
              </th>
              <th className="py-2 text-right font-medium">Entry</th>
              <th className="py-2 pl-4 font-medium">Exit time</th>
              <th className="py-2 text-right font-medium">Exit</th>
              <th className="py-2 text-right font-medium">P&amp;L</th>
              <th className="py-2 text-right font-medium">R</th>
              <th className="py-2 pr-4 pl-4 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={`${t.entryTime}-${t.symbol}-${i}`} className="border-b border-line/60 last:border-0">
                <td className="py-1.5 pl-4 font-medium text-ink">{BY_ID[t.symbol]?.name ?? t.symbol}</td>
                <td className={cx("py-1.5 font-semibold", t.side === "LONG" ? "text-up" : "text-down")}>{t.side === "LONG" ? "▲ Long" : "▼ Short"}</td>
                <td className="py-1.5 text-right">{t.lots}</td>
                <td className="py-1.5 pl-4 text-ink-2">{dateTime(t.entryTime)}</td>
                <td className="py-1.5 text-right">{fmtPrice(t.symbol, t.entry)}</td>
                <td className="py-1.5 pl-4 text-ink-2">{dateTime(t.exitTime)}</td>
                <td className="py-1.5 text-right">{fmtPrice(t.symbol, t.exit)}</td>
                <td className={cx("py-1.5 text-right font-semibold", t.pnl > 0 ? "text-up" : t.pnl < 0 ? "text-down" : "")}>{usd(t.pnl)}</td>
                <td className="py-1.5 text-right text-ink-2">{t.rMultiple == null ? "—" : t.rMultiple.toFixed(2)}</td>
                <td className="py-1.5 pr-4 pl-4 text-ink-2">{t.reason.replace(/_/g, " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
          <span>{sorted.length} trades · page {p + 1} of {pages}</span>
          <div className="flex gap-1">
            <button disabled={p === 0} onClick={() => setPage(p - 1)} className="rounded-md border border-line px-2.5 py-1 hover:bg-surface-2 disabled:opacity-40">← Prev</button>
            <button disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="rounded-md border border-line px-2.5 py-1 hover:bg-surface-2 disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Read a query-string value once (avoids useSearchParams + Suspense for one-off presets). */
export function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/** Read ?symbol=XXX once on mount (avoids useSearchParams + Suspense for a one-off preset). */
export function readSymbolParam(): string | null {
  if (typeof window === "undefined") return null;
  const s = new URLSearchParams(window.location.search).get("symbol");
  return s && BY_ID[s]?.spec ? s : null;
}

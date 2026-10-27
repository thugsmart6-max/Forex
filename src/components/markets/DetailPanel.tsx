"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import * as ind from "@/lib/indicators";
import { BY_ID, fmtPrice } from "@/lib/instruments";
import { useHistory } from "@/lib/hooks";
import { STRATEGIES, type StrategyKey } from "@/lib/strategies";
import type { Quote } from "@/lib/types";
import { CandleChart, type Overlay } from "../charts";
import { Card, Change, Segmented, SignalBadge, Spinner, cx } from "../ui";

const INTERVALS = [
  { value: "5m", label: "5m", range: "5d" },
  { value: "15m", label: "15m", range: "1mo" },
  { value: "1h", label: "1H", range: "3mo" },
  { value: "1d", label: "1D", range: "2y" },
] as const;
type Iv = (typeof INTERVALS)[number]["value"];

const SINGLE: StrategyKey[] = ["trend", "breakout", "meanrev"];

export function DetailPanel({ id, quote }: { id: string; quote?: Quote }) {
  const inst = BY_ID[id];
  const [iv, setIv] = useState<Iv>("1h");
  const [showEma, setShowEma] = useState(true);
  const [showBb, setShowBb] = useState(false);
  const range = INTERVALS.find((i) => i.value === iv)!.range;
  const { data, error, loading } = useHistory(id, iv, range, iv === "1d" ? 300_000 : 30_000);

  const analysis = useMemo(() => {
    if (!data || data.c.length < 30) return null;
    const last = data.c.length - 1;
    const signals = SINGLE.map((k) => {
      const def = STRATEGIES[k];
      const sig = def.generate({ [id]: data }, [id], def.defaults)[id];
      return { key: k, name: def.name, dir: sig[last], enough: data.c.length >= def.warmup(def.defaults) };
    });
    const e20 = ind.ema(data.c, 20);
    const e50 = ind.ema(data.c, 50);
    const bb = ind.bollinger(data.c, 20, 2);
    return {
      signals,
      rsi: ind.rsi(data.c, 14)[last],
      adx: ind.adx(data, 14)[last],
      atr: ind.atr(data, 14)[last],
      e20, e50, bb,
    };
  }, [data, id]);

  const overlays = useMemo<Overlay[]>(() => {
    if (!analysis) return [];
    const o: Overlay[] = [];
    if (showEma) o.push({ name: "EMA 20", values: analysis.e20, color: "--series-1" }, { name: "EMA 50", values: analysis.e50, color: "--series-2" });
    if (showBb) o.push(
      { name: "BB upper", values: analysis.bb.up, color: "--series-3", dashed: true },
      { name: "BB mid", values: analysis.bb.mid, color: "--series-4", dashed: true },
      { name: "BB lower", values: analysis.bb.lo, color: "--series-3", dashed: true },
    );
    return o;
  }, [analysis, showEma, showBb]);

  const tradable = Boolean(inst.spec);

  return (
    <Card
      className="min-w-0"
      title={
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-base">{inst.name}</span>
          <span className="num text-xl font-semibold">{fmtPrice(id, quote?.price)}</span>
          <span className="text-sm"><Change pct={quote?.changePct} /></span>
        </span>
      }
      subtitle={inst.desc}
      actions={<Segmented size="sm" value={iv} onChange={setIv} options={INTERVALS.map((i) => ({ value: i.value, label: i.label }))} label="Timeframe" />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-3">Overlays:</span>
        {[
          { on: showEma, set: setShowEma, label: "EMA 20 / 50" },
          { on: showBb, set: setShowBb, label: "Bollinger (20, 2)" },
        ].map((t) => (
          <button
            key={t.label}
            onClick={() => t.set(!t.on)}
            aria-pressed={t.on}
            className={cx("rounded-full border px-2.5 py-1 font-medium", t.on ? "border-accent bg-accent/15 text-accent" : "border-line text-ink-3 hover:text-ink")}
          >
            {t.on ? "✓ " : ""}{t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg bg-down/10 px-3 py-6 text-center text-sm text-down">Couldn&apos;t load chart data: {error}</p>
      ) : !data || loading ? (
        <div className="grid h-[380px] place-items-center"><Spinner label="Loading chart" /></div>
      ) : (
        <CandleChart data={data} overlays={overlays} digits={inst.digits} />
      )}

      {analysis && (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">Strategy signals now</span>
              <span className="text-ink-3">on {iv} bars · default parameters</span>
            </div>
            <ul className="space-y-1.5">
              {analysis.signals.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink-2">
                    {s.name}
                    {!s.enough && <span className="ml-1 text-xs text-warn" title="Fewer bars than the strategy's warm-up period">(short history)</span>}
                  </span>
                  <SignalBadge dir={s.dir} />
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
            <Reading label="RSI (14)" value={analysis.rsi.toFixed(1)} note={analysis.rsi > 70 ? "overbought" : analysis.rsi < 30 ? "oversold" : "neutral"} />
            <Reading label="ADX (14)" value={Number.isFinite(analysis.adx) ? analysis.adx.toFixed(1) : "—"} note={analysis.adx > 25 ? "trending" : analysis.adx < 20 ? "ranging" : "weak trend"} />
            <Reading label="ATR (14)" value={fmtPrice(id, analysis.atr)} note="avg bar range" />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {tradable ? (
          <>
            <Link href={`/backtest?symbol=${id}`} className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:brightness-110">Backtest {inst.name} →</Link>
            <Link href={`/paper?symbol=${id}`} className="rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-sm font-medium hover:bg-surface-3">Paper trade {inst.name}</Link>
          </>
        ) : (
          <p className="text-xs text-ink-3">
            Watch-only: {inst.category === "indices" ? "currency indices are not directly tradable." : "crosses need a second conversion rate for USD P&L, so backtesting supports USD pairs and metals."}
          </p>
        )}
      </div>
    </Card>
  );
}

function Reading({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 lg:min-w-36">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className="num text-sm font-semibold">{value}</div>
      <div className="text-[11px] text-ink-3">{note}</div>
    </div>
  );
}

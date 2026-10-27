/**
 * Strategy Builder: user-defined, rule-based strategies.
 *
 * A strategy is plain data (so it can be saved, shared as JSON and restored with a paper session):
 *   Buy  side: enter when ALL entry conditions are true, exit when ANY exit condition is true
 *   Sell side: same, mirrored
 * plus its own exits (take profit / stop / trailing / time limit) handled by the shared Engine.
 * Signals follow the same rules as every other strategy: decided on bar t, filled at the open of t+1.
 */
import * as ind from "./indicators";
import type { CustomKey, Signals, StrategyDef } from "./strategies";
import type { OHLC } from "./types";

export type Source =
  | "number" | "close" | "open" | "high" | "low"
  | "ema" | "sma" | "rsi" | "adx" | "atr"
  | "bb_upper" | "bb_middle" | "bb_lower"
  | "stoch_k" | "stoch_d" | "zscore"
  | "highest" | "lowest" | "macd" | "macd_signal" | "change" | "hour";

export interface Operand {
  src: Source;
  n?: number; // period
  k?: number; // band width (Bollinger)
  value?: number; // for src = "number"
}

export type Op = "gt" | "lt" | "cross_up" | "cross_down";

export interface Condition {
  a: Operand;
  op: Op;
  b: Operand;
}

export interface Side {
  enabled: boolean;
  entry: Condition[]; // ALL must be true
  exit: Condition[]; // ANY closes the trade
}

export interface CustomStrategy {
  id: string;
  name: string;
  notes: string;
  long: Side;
  short: Side;
  exits: {
    targetAtr: number; // 0 = no take profit
    stopAtr: number; // initial stop distance, also used for position sizing
    trailing: boolean;
    maxBars: number; // 0 = no time limit
  };
  updatedAt: number;
}

export const SOURCES: Record<Source, { label: string; group: string; n?: number; k?: number; help: string }> = {
  number: { label: "Number", group: "Value", help: "A fixed number, e.g. 30 for RSI levels" },
  close: { label: "Close", group: "Price", help: "Closing price of the bar" },
  open: { label: "Open", group: "Price", help: "Opening price of the bar" },
  high: { label: "High", group: "Price", help: "Highest price of the bar" },
  low: { label: "Low", group: "Price", help: "Lowest price of the bar" },
  ema: { label: "EMA", group: "Trend", n: 20, help: "Exponential moving average" },
  sma: { label: "SMA", group: "Trend", n: 50, help: "Simple moving average" },
  macd: { label: "MACD line (12,26)", group: "Trend", help: "EMA(12) − EMA(26)" },
  macd_signal: { label: "MACD signal (9)", group: "Trend", help: "9-bar EMA of the MACD line" },
  adx: { label: "ADX", group: "Trend", n: 14, help: "Trend strength, 0–100 (above 20–25 = trending)" },
  rsi: { label: "RSI", group: "Momentum", n: 14, help: "Relative Strength Index, 0–100" },
  stoch_k: { label: "Stochastic %K", group: "Momentum", n: 14, help: "Where the close sits in the recent range, 0–100" },
  stoch_d: { label: "Stochastic %D", group: "Momentum", n: 14, help: "3-bar average of %K" },
  change: { label: "% change", group: "Momentum", n: 10, help: "Percent change of the close over N bars" },
  bb_upper: { label: "Bollinger upper", group: "Volatility", n: 20, k: 2, help: "Moving average + k standard deviations" },
  bb_middle: { label: "Bollinger middle", group: "Volatility", n: 20, k: 2, help: "The band's moving average" },
  bb_lower: { label: "Bollinger lower", group: "Volatility", n: 20, k: 2, help: "Moving average − k standard deviations" },
  atr: { label: "ATR", group: "Volatility", n: 14, help: "Average true range (typical bar size)" },
  zscore: { label: "Z-score", group: "Volatility", n: 50, help: "How many standard deviations the close is from its N-bar mean" },
  highest: { label: "Highest high", group: "Channel", n: 20, help: "Highest high of the previous N bars (excludes this bar)" },
  lowest: { label: "Lowest low", group: "Channel", n: 20, help: "Lowest low of the previous N bars (excludes this bar)" },
  hour: { label: "Hour (UTC)", group: "Time", help: "Hour of the bar in UTC, 0–23 (e.g. London open = 7–8)" },
};

export const OPS: Record<Op, string> = {
  gt: "is above",
  lt: "is below",
  cross_up: "crosses above",
  cross_down: "crosses below",
};

export function operandLabel(o: Operand): string {
  const s = SOURCES[o.src];
  if (o.src === "number") return String(o.value ?? 0);
  if (s.k != null) return `${s.label}(${o.n ?? s.n}, ${o.k ?? s.k})`;
  if (s.n != null) return `${s.label}(${o.n ?? s.n})`;
  return s.label;
}

export const conditionText = (c: Condition) => `${operandLabel(c.a)} ${OPS[c.op]} ${operandLabel(c.b)}`;

/** Plain-English description of a strategy. */
export function describeCustom(c: CustomStrategy): string[] {
  const lines: string[] = [];
  const side = (name: string, s: Side) => {
    if (!s.enabled) return;
    lines.push(`${name} when ${s.entry.length ? s.entry.map(conditionText).join(" AND ") : "(no entry rule yet)"}.`);
    if (s.exit.length) lines.push(`Close the ${name === "BUY" ? "buy" : "sell"} when ${s.exit.map(conditionText).join(" OR ")}.`);
  };
  side("BUY", c.long);
  side("SELL", c.short);
  const e = c.exits;
  lines.push(
    `Stop ${e.stopAtr}× ATR${e.trailing ? " (trailing)" : ""}` +
      (e.targetAtr ? `, take profit ${e.targetAtr}× ATR` : "") +
      (e.maxBars ? `, close after ${e.maxBars} bars` : "") + ".",
  );
  return lines;
}

// ---------- evaluation ----------

function series(d: OHLC, o: Operand): number[] {
  const s = SOURCES[o.src];
  const n = Math.max(1, Math.round(o.n ?? s.n ?? 14));
  const k = o.k ?? s.k ?? 2;
  switch (o.src) {
    case "number": return d.c.map(() => o.value ?? 0);
    case "close": return d.c;
    case "open": return d.o;
    case "high": return d.h;
    case "low": return d.l;
    case "ema": return ind.ema(d.c, n);
    case "sma": return ind.sma(d.c, n);
    case "rsi": return ind.rsi(d.c, n);
    case "adx": return ind.adx(d, n);
    case "atr": return ind.atr(d, n);
    case "bb_upper": return ind.bollinger(d.c, n, k).up;
    case "bb_middle": return ind.bollinger(d.c, n, k).mid;
    case "bb_lower": return ind.bollinger(d.c, n, k).lo;
    case "stoch_k": return ind.stochastic(d, n).k;
    case "stoch_d": return ind.stochastic(d, n).d;
    case "zscore": {
      const m = ind.sma(d.c, n);
      const sd = ind.rollingStd(d.c, n);
      return d.c.map((c, i) => (c - m[i]) / sd[i]);
    }
    case "highest": return ind.shift1(ind.rollingMax(d.h, n));
    case "lowest": return ind.shift1(ind.rollingMin(d.l, n));
    case "macd": {
      const f = ind.ema(d.c, 12);
      const sl = ind.ema(d.c, 26);
      return f.map((v, i) => v - sl[i]);
    }
    case "macd_signal": {
      const f = ind.ema(d.c, 12);
      const sl = ind.ema(d.c, 26);
      return ind.ema(f.map((v, i) => v - sl[i]), 9);
    }
    case "change": return d.c.map((c, i) => (i >= n ? (c / d.c[i - n] - 1) * 100 : NaN));
    case "hour": return d.t.map((t) => new Date(t * 1000).getUTCHours());
  }
}

/** Evaluate a list of conditions into per-bar booleans (combined with AND or OR). */
function evaluate(d: OHLC, conds: Condition[], mode: "all" | "any", cache: Map<string, number[]>): boolean[] {
  const get = (o: Operand) => {
    const key = JSON.stringify(o);
    if (!cache.has(key)) cache.set(key, series(d, o));
    return cache.get(key)!;
  };
  const len = d.c.length;
  if (!conds.length) return new Array(len).fill(false);
  const parts = conds.map((c) => {
    const a = get(c.a);
    const b = get(c.b);
    return (i: number) => {
      const ai = a[i], bi = b[i];
      if (Number.isNaN(ai) || Number.isNaN(bi)) return false;
      if (c.op === "gt") return ai > bi;
      if (c.op === "lt") return ai < bi;
      if (i === 0 || Number.isNaN(a[i - 1]) || Number.isNaN(b[i - 1])) return false;
      return c.op === "cross_up" ? a[i - 1] <= b[i - 1] && ai > bi : a[i - 1] >= b[i - 1] && ai < bi;
    };
  });
  const out: boolean[] = [];
  for (let i = 0; i < len; i++) out.push(mode === "all" ? parts.every((p) => p(i)) : parts.some((p) => p(i)));
  return out;
}

function longestPeriod(c: CustomStrategy): number {
  const all = [...c.long.entry, ...c.long.exit, ...c.short.entry, ...c.short.exit].flatMap((x) => [x.a, x.b]);
  return Math.max(30, ...all.map((o) => (o.src === "number" || o.src === "hour" ? 0 : o.src.startsWith("macd") ? 35 : o.n ?? SOURCES[o.src].n ?? 14)));
}

export function customKey(id: string): CustomKey {
  return `custom:${id}`;
}

/** Turn saved rules into a strategy the backtester and paper trader can run. */
export function compileCustom(c: CustomStrategy): StrategyDef {
  return {
    key: customKey(c.id),
    group: "custom",
    name: c.name || "Untitled strategy",
    short: c.notes || describeCustom(c)[0] || "Custom rule-based strategy",
    entry: [c.long.enabled && `BUY: ${c.long.entry.map(conditionText).join(" AND ")}`, c.short.enabled && `SELL: ${c.short.entry.map(conditionText).join(" AND ")}`].filter(Boolean).join(" · "),
    exit: describeCustom(c).filter((l) => l.startsWith("Close") || l.startsWith("Stop")).join(" "),
    sizing: "atr",
    legs: "any",
    defaults: {},
    params: [],
    warmup: () => longestPeriod(c) * 3,
    exits: () => ({
      stopAtrMult: Math.max(0.1, c.exits.stopAtr),
      trailing: c.exits.trailing,
      targetAtrMult: c.exits.targetAtr || undefined,
      maxBars: c.exits.maxBars || undefined,
    }),
    generate: (data, keys): Signals => {
      const out: Signals = {};
      for (const key of keys) {
        const d = data[key];
        const cache = new Map<string, number[]>();
        const le = c.long.enabled ? evaluate(d, c.long.entry, "all", cache) : null;
        const lx = c.long.enabled ? evaluate(d, c.long.exit, "any", cache) : null;
        const se = c.short.enabled ? evaluate(d, c.short.entry, "all", cache) : null;
        const sx = c.short.enabled ? evaluate(d, c.short.exit, "any", cache) : null;
        const sig: number[] = [];
        let pos = 0;
        for (let i = 0; i < d.c.length; i++) {
          if (pos === 1 && lx?.[i]) pos = 0;
          else if (pos === -1 && sx?.[i]) pos = 0;
          if (pos === 0) {
            if (le?.[i]) pos = 1;
            else if (se?.[i]) pos = -1;
          }
          sig.push(pos);
        }
        out[key] = sig;
      }
      return out;
    },
  };
}

// ---------- templates ----------

const op = (src: Source, n?: number, k?: number): Operand => ({ src, ...(n != null ? { n } : {}), ...(k != null ? { k } : {}) });
const val = (value: number): Operand => ({ src: "number", value });
const cond = (a: Operand, o: Op, b: Operand): Condition => ({ a, op: o, b });

export const newId = () => Math.random().toString(36).slice(2, 10);

export const TEMPLATES: { name: string; about: string; make: () => Omit<CustomStrategy, "id" | "updatedAt"> }[] = [
  {
    name: "Blank strategy",
    about: "Start from scratch",
    make: () => ({
      name: "My strategy", notes: "",
      long: { enabled: true, entry: [cond(op("close"), "gt", op("ema", 50))], exit: [] },
      short: { enabled: false, entry: [], exit: [] },
      exits: { targetAtr: 0, stopAtr: 2, trailing: true, maxBars: 0 },
    }),
  },
  {
    name: "EMA Crossover",
    about: "Buy when the fast EMA crosses above the slow one; sell on the opposite cross",
    make: () => ({
      name: "EMA Crossover 20/50", notes: "Classic trend-following crossover.",
      long: { enabled: true, entry: [cond(op("ema", 20), "cross_up", op("ema", 50))], exit: [cond(op("ema", 20), "cross_down", op("ema", 50))] },
      short: { enabled: true, entry: [cond(op("ema", 20), "cross_down", op("ema", 50))], exit: [cond(op("ema", 20), "cross_up", op("ema", 50))] },
      exits: { targetAtr: 0, stopAtr: 2, trailing: true, maxBars: 0 },
    }),
  },
  {
    name: "RSI Dip Buyer",
    about: "Buy oversold dips while price is above the 200 EMA",
    make: () => ({
      name: "RSI Dip Buyer", notes: "Buys pullbacks in an uptrend, takes a modest profit.",
      long: { enabled: true, entry: [cond(op("rsi", 14), "lt", val(30)), cond(op("close"), "gt", op("ema", 200))], exit: [cond(op("rsi", 14), "gt", val(55))] },
      short: { enabled: false, entry: [], exit: [] },
      exits: { targetAtr: 1.5, stopAtr: 3, trailing: false, maxBars: 48 },
    }),
  },
  {
    name: "Channel Breakout",
    about: "Buy a break of the 20-bar high, sell a break of the 20-bar low",
    make: () => ({
      name: "20-bar Breakout", notes: "Momentum breakout with a 10-bar opposite-channel exit.",
      long: { enabled: true, entry: [cond(op("close"), "cross_up", op("highest", 20))], exit: [cond(op("close"), "cross_down", op("lowest", 10))] },
      short: { enabled: true, entry: [cond(op("close"), "cross_down", op("lowest", 20))], exit: [cond(op("close"), "cross_up", op("highest", 10))] },
      exits: { targetAtr: 0, stopAtr: 2, trailing: true, maxBars: 0 },
    }),
  },
  {
    name: "MACD + ADX Momentum",
    about: "MACD crossover, only when ADX shows a real trend",
    make: () => ({
      name: "MACD Momentum", notes: "MACD signal-line cross filtered by trend strength.",
      long: { enabled: true, entry: [cond(op("macd"), "cross_up", op("macd_signal")), cond(op("adx", 14), "gt", val(20))], exit: [cond(op("macd"), "cross_down", op("macd_signal"))] },
      short: { enabled: true, entry: [cond(op("macd"), "cross_down", op("macd_signal")), cond(op("adx", 14), "gt", val(20))], exit: [cond(op("macd"), "cross_up", op("macd_signal"))] },
      exits: { targetAtr: 0, stopAtr: 2, trailing: true, maxBars: 0 },
    }),
  },
  {
    name: "London Session Bollinger Fade",
    about: "Fade Bollinger extremes only during 07–16 UTC",
    make: () => ({
      name: "London Bollinger Fade", notes: "Mean reversion during London hours.",
      long: { enabled: true, entry: [cond(op("close"), "lt", op("bb_lower", 20, 2)), cond(op("hour"), "gt", val(6)), cond(op("hour"), "lt", val(16))], exit: [cond(op("close"), "gt", op("bb_middle", 20, 2))] },
      short: { enabled: true, entry: [cond(op("close"), "gt", op("bb_upper", 20, 2)), cond(op("hour"), "gt", val(6)), cond(op("hour"), "lt", val(16))], exit: [cond(op("close"), "lt", op("bb_middle", 20, 2))] },
      exits: { targetAtr: 1, stopAtr: 2.5, trailing: false, maxBars: 24 },
    }),
  },
];

/** Basic shape check for imported JSON. */
export function validateCustom(x: unknown): CustomStrategy {
  const c = x as CustomStrategy;
  const okSide = (s: Side) => s && typeof s.enabled === "boolean" && Array.isArray(s.entry) && Array.isArray(s.exit) &&
    [...s.entry, ...s.exit].every((q) => q && q.a && q.b && q.a.src in SOURCES && q.b.src in SOURCES && q.op in OPS);
  if (!c || typeof c.name !== "string" || !okSide(c.long) || !okSide(c.short) || !c.exits || typeof c.exits.stopAtr !== "number") {
    throw new Error("This file is not a valid strategy (expected the JSON exported from the Strategy Builder).");
  }
  return { ...c, id: c.id || newId(), notes: c.notes ?? "", updatedAt: Date.now() };
}

/** A new, unsaved strategy from template `i`. */
export function fromTemplate(i: number): CustomStrategy {
  return { ...TEMPLATES[i].make(), id: newId(), updatedAt: Date.now() };
}

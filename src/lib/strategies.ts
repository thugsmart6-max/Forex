/**
 * Four strategies - a port of strategies.py.
 *
 * Every strategy turns price data into a *target direction* per instrument for each bar:
 *   +1 = long, -1 = short, 0 = flat
 * The signal on bar t is acted on at the OPEN of bar t+1 by the engine (no look-ahead).
 */
import * as ind from "./indicators";
import type { DataSet, OHLC } from "./types";

export type StrategyKey = "trend" | "breakout" | "meanrev" | "ratio";
export type Params = Record<string, number | boolean>;
export type Signals = Record<string, number[]>;

export interface ParamDef {
  key: string;
  label: string;
  help: string;
  type: "int" | "float" | "bool";
  min?: number;
  max?: number;
  step?: number;
}

export interface StrategyDef {
  key: StrategyKey;
  name: string;
  short: string;
  entry: string;
  exit: string;
  sizing: "atr" | "notional";
  /** number of instruments it needs: "any" (1+), or exactly 2 for the pair strategy */
  legs: "any" | 2;
  defaults: Params;
  params: ParamDef[];
  warmup: (p: Params) => number;
  generate: (data: DataSet, keys: string[], p: Params) => Signals;
}

const num = (p: Params, k: string) => Number(p[k]);

function trend(data: DataSet, keys: string[], p: Params): Signals {
  const out: Signals = {};
  for (const k of keys) {
    const d = data[k];
    const f = ind.ema(d.c, num(p, "fast"));
    const s = ind.ema(d.c, num(p, "slow"));
    const a = ind.adx(d, num(p, "adx_n"));
    const sig: number[] = [];
    let pos = 0;
    for (let i = 0; i < d.c.length; i++) {
      const raw = Math.sign(f[i] - s[i]);
      if (Number.isNaN(a[i])) pos = 0;
      // enter / flip only with trend strength, otherwise stand aside
      else if (raw !== pos) pos = a[i] > num(p, "adx_th") ? raw : 0;
      sig.push(pos);
    }
    out[k] = sig;
  }
  return out;
}

function isIntraday(d: OHLC): boolean {
  const diffs = d.t.slice(1).map((t, i) => t - d.t[i]).sort((a, b) => a - b);
  if (!diffs.length) return false;
  const mid = Math.floor(diffs.length / 2);
  const median = diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
  return median < 86400;
}

function breakout(data: DataSet, keys: string[], p: Params): Signals {
  const out: Signals = {};
  for (const k of keys) {
    const d = data[k];
    const hh = ind.shift1(ind.rollingMax(d.h, num(p, "entry_n")));
    const ll = ind.shift1(ind.rollingMin(d.l, num(p, "entry_n")));
    const xh = ind.shift1(ind.rollingMax(d.h, num(p, "exit_n")));
    const xl = ind.shift1(ind.rollingMin(d.l, num(p, "exit_n")));
    const useSess = Boolean(p.use_session) && isIntraday(d);
    const sig: number[] = [];
    let pos = 0;
    for (let i = 0; i < d.c.length; i++) {
      if (Number.isNaN(hh[i])) {
        sig.push(0);
        continue;
      }
      const hour = new Date(d.t[i] * 1000).getUTCHours();
      const inSess = !useSess || (hour >= num(p, "session_start") && hour < num(p, "session_end"));
      const c = d.c[i];
      if (pos === 1 && c < xl[i]) pos = 0;
      else if (pos === -1 && c > xh[i]) pos = 0;
      if (pos === 0 && inSess) {
        if (c > hh[i]) pos = 1;
        else if (c < ll[i]) pos = -1;
      }
      sig.push(pos);
    }
    out[k] = sig;
  }
  return out;
}

function meanrev(data: DataSet, keys: string[], p: Params): Signals {
  const out: Signals = {};
  for (const k of keys) {
    const d = data[k];
    const bb = ind.bollinger(d.c, num(p, "bb_n"), num(p, "bb_k"));
    const r = ind.rsi(d.c, num(p, "rsi_n"));
    const a = ind.adx(d, num(p, "adx_n"));
    const sig: number[] = [];
    let pos = 0;
    for (let i = 0; i < d.c.length; i++) {
      if (Number.isNaN(bb.mid[i]) || Number.isNaN(a[i])) {
        sig.push(0);
        continue;
      }
      const c = d.c[i];
      if (pos === 1 && c >= bb.mid[i]) pos = 0;
      else if (pos === -1 && c <= bb.mid[i]) pos = 0;
      if (pos === 0 && a[i] < num(p, "adx_max")) {
        if (c < bb.lo[i] && r[i] < num(p, "rsi_lo")) pos = 1;
        else if (c > bb.up[i] && r[i] > num(p, "rsi_hi")) pos = -1;
      }
      sig.push(pos);
    }
    out[k] = sig;
  }
  return out;
}

/** z-score of log(A/B) over `lookback` bars. */
export function ratioZ(a: OHLC, b: OHLC, lookback: number): number[] {
  const lr = a.c.map((c, i) => Math.log(c / b.c[i]));
  const m = ind.sma(lr, lookback);
  const sd = ind.rollingStd(lr, lookback);
  return lr.map((v, i) => (v - m[i]) / sd[i]);
}

function ratio(data: DataSet, keys: string[], p: Params): Signals {
  const [ka, kb] = keys;
  const z = ratioZ(data[ka], data[kb], num(p, "lookback"));
  const state: number[] = [];
  let s = 0;
  let cooldown = false;
  for (let i = 0; i < z.length; i++) {
    if (Number.isNaN(z[i])) {
      state.push(0);
      continue;
    }
    const az = Math.abs(z[i]);
    if (cooldown && az < num(p, "exit_z")) cooldown = false;
    if (s !== 0) {
      if (az < num(p, "exit_z")) s = 0;
      else if (az > num(p, "stop_z")) {
        s = 0;
        cooldown = true;
      }
    }
    if (s === 0 && !cooldown) {
      if (z[i] > num(p, "entry_z")) s = 1;
      else if (z[i] < -num(p, "entry_z")) s = -1;
    }
    state.push(s);
  }
  // z > +entry -> ratio rich -> SHORT leg A, LONG leg B (and vice versa)
  return { [ka]: state.map((v) => (v === 0 ? 0 : -v)), [kb]: state };
}

export const STRATEGIES: Record<StrategyKey, StrategyDef> = {
  trend: {
    key: "trend",
    name: "Trend-following",
    short: "Ride established trends with an EMA crossover, confirmed by ADX.",
    entry: "EMA 20/50 cross, only if ADX(14) > 20",
    exit: "Opposite cross, ATR trailing stop",
    sizing: "atr",
    legs: "any",
    defaults: { fast: 20, slow: 50, adx_n: 14, adx_th: 20 },
    params: [
      { key: "fast", label: "Fast EMA", help: "Bars in the fast moving average", type: "int", min: 2, max: 200 },
      { key: "slow", label: "Slow EMA", help: "Bars in the slow moving average", type: "int", min: 5, max: 400 },
      { key: "adx_n", label: "ADX period", help: "Bars used to measure trend strength", type: "int", min: 2, max: 100 },
      { key: "adx_th", label: "ADX threshold", help: "Minimum trend strength to enter", type: "float", min: 0, max: 60, step: 0.5 },
    ],
    warmup: (p) => num(p, "slow") * 3,
    generate: trend,
  },
  breakout: {
    key: "breakout",
    name: "Breakout",
    short: "Turtle-style channel breakout, entered only during London/NY hours.",
    entry: "Close beyond 55-bar high/low, during 07–17 UTC (London/NY)",
    exit: "20-bar opposite channel, ATR trailing stop",
    sizing: "atr",
    legs: "any",
    defaults: { entry_n: 55, exit_n: 20, session_start: 7, session_end: 17, use_session: true },
    params: [
      { key: "entry_n", label: "Entry channel", help: "Breakout of the N-bar high/low", type: "int", min: 5, max: 400 },
      { key: "exit_n", label: "Exit channel", help: "Exit on the M-bar opposite extreme", type: "int", min: 2, max: 200 },
      { key: "session_start", label: "Session start (UTC h)", help: "Entries allowed from this hour", type: "int", min: 0, max: 23 },
      { key: "session_end", label: "Session end (UTC h)", help: "Entries allowed until this hour", type: "int", min: 1, max: 24 },
      { key: "use_session", label: "Session filter", help: "Only enter during the session (intraday data)", type: "bool" },
    ],
    warmup: (p) => num(p, "entry_n") * 2,
    generate: breakout,
  },
  meanrev: {
    key: "meanrev",
    name: "Mean reversion",
    short: "Fade Bollinger Band extremes confirmed by RSI, only in ranging markets.",
    entry: "Close outside Bollinger(20,2) + RSI <30 / >70, only if ADX < 25",
    exit: "Middle band, ATR stop",
    sizing: "atr",
    legs: "any",
    defaults: { bb_n: 20, bb_k: 2, rsi_n: 14, rsi_lo: 30, rsi_hi: 70, adx_n: 14, adx_max: 25 },
    params: [
      { key: "bb_n", label: "Bollinger period", help: "Bars in the band average", type: "int", min: 5, max: 200 },
      { key: "bb_k", label: "Band width (σ)", help: "Standard deviations for the bands", type: "float", min: 0.5, max: 5, step: 0.1 },
      { key: "rsi_n", label: "RSI period", help: "Bars in the RSI", type: "int", min: 2, max: 100 },
      { key: "rsi_lo", label: "RSI oversold", help: "Buy only below this RSI", type: "float", min: 1, max: 50 },
      { key: "rsi_hi", label: "RSI overbought", help: "Sell only above this RSI", type: "float", min: 50, max: 99 },
      { key: "adx_n", label: "ADX period", help: "Bars used to measure trend strength", type: "int", min: 2, max: 100 },
      { key: "adx_max", label: "Max ADX", help: "Only trade when the market is ranging", type: "float", min: 5, max: 60, step: 0.5 },
    ],
    warmup: () => 100,
    generate: meanrev,
  },
  ratio: {
    key: "ratio",
    name: "Pair ratio (Gold–Silver)",
    short: "Statistical pair trade on the ratio of two instruments — Gold/Silver by default.",
    entry: "z-score of log(A/B) over 200 bars beyond ±2: short the rich leg, long the cheap one",
    exit: "|z| < 0.5, or |z| > 4 (stop)",
    sizing: "notional",
    legs: 2,
    defaults: { lookback: 200, entry_z: 2, exit_z: 0.5, stop_z: 4 },
    params: [
      { key: "lookback", label: "Lookback", help: "Bars used for the ratio's mean and std", type: "int", min: 20, max: 2000 },
      { key: "entry_z", label: "Entry z", help: "Enter when |z| exceeds this", type: "float", min: 0.5, max: 5, step: 0.1 },
      { key: "exit_z", label: "Exit z", help: "Exit when |z| falls below this", type: "float", min: 0, max: 3, step: 0.1 },
      { key: "stop_z", label: "Stop z", help: "Bail out when |z| exceeds this", type: "float", min: 1, max: 10, step: 0.1 },
    ],
    warmup: (p) => num(p, "lookback") * 2,
    generate: ratio,
  },
};

export const STRATEGY_LIST = Object.values(STRATEGIES);

export function describe(def: StrategyDef, p: Params): string {
  return `${def.name} (${Object.entries(p)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")})`;
}

/**
 * High win-rate strategies.
 *
 * They share one idea: enter on a short-term stretch, take a SMALL profit (target ~1 ATR) and give
 * the trade room with a WIDER fixed stop (~3 ATR) plus a time limit. That makes most trades winners,
 * but each loser costs ~3 winners - a high win rate does NOT by itself mean the strategy makes money.
 */
import * as ind from "./indicators";
import type { ExitRules } from "./engine";
import type { HighWinKey, ParamDef, Params, Signals, StrategyDef } from "./strategies";
import type { DataSet } from "./types";

const num = (p: Params, k: string) => Number(p[k]);

const EXIT_PARAMS: ParamDef[] = [
  { key: "target_atr", label: "Take profit (× ATR)", help: "Close the trade in profit this many ATRs from entry", type: "float", min: 0.2, max: 10, step: 0.1 },
  { key: "stop_atr", label: "Stop loss (× ATR)", help: "Fixed (not trailing) stop this many ATRs from entry", type: "float", min: 0.5, max: 10, step: 0.25 },
  { key: "max_bars", label: "Time limit (bars)", help: "Close at the bar's close after holding this many bars (0 = no limit)", type: "int", min: 0, max: 500 },
];

const exits = (p: Params): ExitRules => ({
  targetAtrMult: num(p, "target_atr"),
  stopAtrMult: num(p, "stop_atr"),
  trailing: false,
  maxBars: num(p, "max_bars") || undefined,
});

/** Run a position state machine bar by bar: `step` gets the current position and returns the new one. */
function stateLoop(data: DataSet, keys: string[], step: (k: string, i: number, pos: number) => number): Signals {
  const out: Signals = {};
  for (const k of keys) {
    const sig: number[] = [];
    let pos = 0;
    for (let i = 0; i < data[k].c.length; i++) {
      pos = step(k, i, pos);
      sig.push(pos);
    }
    out[k] = sig;
  }
  return out;
}

const bad = (...v: number[]) => v.some((x) => Number.isNaN(x));

function rubber(data: DataSet, keys: string[], p: Params): Signals {
  const pre = Object.fromEntries(keys.map((k) => {
    const c = data[k].c;
    return [k, { r: ind.rsi(c, num(p, "rsi_n")), tr: ind.ema(c, num(p, "trend_n")), ex: ind.ema(c, num(p, "exit_n")) }];
  }));
  return stateLoop(data, keys, (k, i, pos) => {
    const { r, tr, ex } = pre[k];
    const c = data[k].c[i];
    if (i < num(p, "trend_n") || bad(tr[i], ex[i])) return 0;
    if (pos === 1 && c > ex[i]) pos = 0;
    else if (pos === -1 && c < ex[i]) pos = 0;
    if (pos === 0) {
      if (r[i] < num(p, "rsi_lo") && c > tr[i]) return 1;
      if (r[i] > num(p, "rsi_hi") && c < tr[i]) return -1;
    }
    return pos;
  });
}

function pullback(data: DataSet, keys: string[], p: Params): Signals {
  const pre = Object.fromEntries(keys.map((k) => {
    const d = data[k];
    return [k, { f: ind.ema(d.c, num(p, "fast")), s: ind.ema(d.c, num(p, "slow")), a: ind.adx(d, 14), r: ind.rsi(d.c, 14) }];
  }));
  return stateLoop(data, keys, (k, i, pos) => {
    const { f, s, a, r } = pre[k];
    if (i < num(p, "slow") || bad(a[i])) return 0;
    const up = f[i] > s[i] && a[i] > num(p, "adx_min");
    const down = f[i] < s[i] && a[i] > num(p, "adx_min");
    if (pos === 1 && (r[i] > 100 - num(p, "rsi_pull") + 10 || !up)) pos = 0;
    else if (pos === -1 && (r[i] < num(p, "rsi_pull") - 10 || !down)) pos = 0;
    if (pos === 0) {
      if (up && r[i] < num(p, "rsi_pull")) return 1;
      if (down && r[i] > 100 - num(p, "rsi_pull")) return -1;
    }
    return pos;
  });
}

function stoch(data: DataSet, keys: string[], p: Params): Signals {
  const pre = Object.fromEntries(keys.map((k) => {
    const d = data[k];
    return [k, { st: ind.stochastic(d, num(p, "k_n"), 3, 3), tr: ind.ema(d.c, num(p, "trend_n")) }];
  }));
  return stateLoop(data, keys, (k, i, pos) => {
    const { st: { k: K, d: D }, tr } = pre[k];
    const c = data[k].c[i];
    if (i < num(p, "trend_n") || bad(K[i], D[i], K[i - 1], D[i - 1])) return 0;
    if (pos === 1 && K[i] > num(p, "overbought")) pos = 0;
    else if (pos === -1 && K[i] < num(p, "oversold")) pos = 0;
    if (pos === 0) {
      const crossUp = K[i - 1] <= D[i - 1] && K[i] > D[i];
      const crossDn = K[i - 1] >= D[i - 1] && K[i] < D[i];
      if (crossUp && K[i] < num(p, "oversold") + 5 && c > tr[i]) return 1;
      if (crossDn && K[i] > num(p, "overbought") - 5 && c < tr[i]) return -1;
    }
    return pos;
  });
}

function zfade(data: DataSet, keys: string[], p: Params): Signals {
  const pre = Object.fromEntries(keys.map((k) => {
    const d = data[k];
    const m = ind.sma(d.c, num(p, "z_n"));
    const sd = ind.rollingStd(d.c, num(p, "z_n"));
    return [k, { z: d.c.map((c, i) => (c - m[i]) / sd[i]), a: ind.adx(d, 14) }];
  }));
  return stateLoop(data, keys, (k, i, pos) => {
    const { z, a } = pre[k];
    if (bad(z[i], a[i])) return 0;
    if (pos === 1 && z[i] > -num(p, "exit_z")) pos = 0;
    else if (pos === -1 && z[i] < num(p, "exit_z")) pos = 0;
    if (pos === 0 && a[i] < num(p, "adx_max")) {
      if (z[i] < -num(p, "entry_z")) return 1;
      if (z[i] > num(p, "entry_z")) return -1;
    }
    return pos;
  });
}

function bounce(data: DataSet, keys: string[], p: Params): Signals {
  const pre = Object.fromEntries(keys.map((k) => {
    const d = data[k];
    return [k, { bb: ind.bollinger(d.c, num(p, "bb_n"), num(p, "bb_k")), a: ind.adx(d, 14) }];
  }));
  return stateLoop(data, keys, (k, i, pos) => {
    const { bb: { mid, up, lo }, a } = pre[k];
    const c = data[k].c;
    if (i === 0 || bad(mid[i], lo[i - 1], a[i])) return 0;
    if (pos === 1 && c[i] >= mid[i]) pos = 0;
    else if (pos === -1 && c[i] <= mid[i]) pos = 0;
    if (pos === 0 && a[i] < num(p, "adx_max")) {
      // price closed outside the band, then snapped back inside it
      if (c[i - 1] < lo[i - 1] && c[i] > lo[i]) return 1;
      if (c[i - 1] > up[i - 1] && c[i] < up[i]) return -1;
    }
    return pos;
  });
}

const EXIT_DEFAULTS = { target_atr: 1, stop_atr: 3, max_bars: 24 };

export const HIGH_WIN: Record<HighWinKey, StrategyDef> = {
  rubber: {
    key: "rubber", group: "highwin",
    name: "Rubber Band Snap",
    short: "Buys sharp 2-bar dips in an uptrend (and sells spikes in a downtrend), expecting a quick snap back.",
    entry: "RSI(2) < 10 while price is above the 200 EMA → BUY; RSI(2) > 90 below the 200 EMA → SELL",
    exit: "Close back across the 5 EMA, +1 ATR target, 3 ATR stop, 24-bar limit",
    sizing: "atr", legs: "any",
    defaults: { rsi_n: 2, rsi_lo: 10, rsi_hi: 90, trend_n: 200, exit_n: 5, ...EXIT_DEFAULTS },
    params: [
      { key: "rsi_n", label: "RSI period", help: "Very short RSI to catch 1-3 bar dips", type: "int", min: 2, max: 14 },
      { key: "rsi_lo", label: "Buy below RSI", help: "Oversold level", type: "float", min: 1, max: 40 },
      { key: "rsi_hi", label: "Sell above RSI", help: "Overbought level", type: "float", min: 60, max: 99 },
      { key: "trend_n", label: "Trend EMA", help: "Only buy above / sell below this EMA", type: "int", min: 20, max: 400 },
      { key: "exit_n", label: "Exit EMA", help: "Exit when price crosses back over this short EMA", type: "int", min: 2, max: 50 },
      ...EXIT_PARAMS,
    ],
    warmup: (p) => num(p, "trend_n") + 10,
    generate: rubber, exits,
  },
  pullback: {
    key: "pullback", group: "highwin",
    name: "Trend Pullback Sniper",
    short: "Waits for a strong trend, then enters on a temporary pullback in the trend's direction.",
    entry: "EMA 50 > EMA 200 and ADX > 20, then RSI(14) dips below 40 → BUY (mirror for SELL)",
    exit: "RSI recovers past 50 or trend breaks, +1 ATR target, 3 ATR stop, 36-bar limit",
    sizing: "atr", legs: "any",
    defaults: { fast: 50, slow: 200, adx_min: 20, rsi_pull: 40, ...EXIT_DEFAULTS, max_bars: 36 },
    params: [
      { key: "fast", label: "Fast EMA", help: "Trend direction: fast vs slow EMA", type: "int", min: 5, max: 200 },
      { key: "slow", label: "Slow EMA", help: "Trend direction: fast vs slow EMA", type: "int", min: 20, max: 400 },
      { key: "adx_min", label: "Min ADX", help: "Only trade strong trends", type: "float", min: 5, max: 60, step: 0.5 },
      { key: "rsi_pull", label: "Pullback RSI", help: "Buy when RSI(14) dips below this in an uptrend (100 − this for shorts)", type: "float", min: 10, max: 50 },
      ...EXIT_PARAMS,
    ],
    warmup: (p) => num(p, "slow") + 30,
    generate: pullback, exits,
  },
  stoch: {
    key: "stoch", group: "highwin",
    name: "Stochastic Hook",
    short: "Catches the turn when the Stochastic hooks up from oversold in an uptrend (or down from overbought).",
    entry: "%K crosses above %D near/below 20 with price above the 200 EMA → BUY (mirror for SELL)",
    exit: "%K reaches 80, +1 ATR target, 3 ATR stop, 24-bar limit",
    sizing: "atr", legs: "any",
    defaults: { k_n: 14, oversold: 20, overbought: 80, trend_n: 200, ...EXIT_DEFAULTS },
    params: [
      { key: "k_n", label: "Stochastic period", help: "Look-back for the high/low range", type: "int", min: 3, max: 100 },
      { key: "oversold", label: "Oversold", help: "Buy hooks must start near/below this", type: "float", min: 5, max: 45 },
      { key: "overbought", label: "Overbought", help: "Sell hooks must start near/above this", type: "float", min: 55, max: 95 },
      { key: "trend_n", label: "Trend EMA", help: "Only buy above / sell below this EMA", type: "int", min: 20, max: 400 },
      ...EXIT_PARAMS,
    ],
    warmup: (p) => num(p, "trend_n") + 20,
    generate: stoch, exits,
  },
  zfade: {
    key: "zfade", group: "highwin",
    name: "Z-Score Fade",
    short: "Fades statistically stretched moves away from the 50-bar average in calm (non-trending) markets.",
    entry: "Price more than 2.2 σ below its 50-bar mean and ADX < 30 → BUY (mirror for SELL)",
    exit: "Back within 0.3 σ of the mean, +1 ATR target, 3 ATR stop, 24-bar limit",
    sizing: "atr", legs: "any",
    defaults: { z_n: 50, entry_z: 2.2, exit_z: 0.3, adx_max: 30, ...EXIT_DEFAULTS },
    params: [
      { key: "z_n", label: "Look-back", help: "Bars for the mean and standard deviation", type: "int", min: 10, max: 500 },
      { key: "entry_z", label: "Entry z", help: "How stretched price must be (in σ)", type: "float", min: 0.5, max: 5, step: 0.1 },
      { key: "exit_z", label: "Exit z", help: "Exit once back within this many σ", type: "float", min: 0, max: 3, step: 0.1 },
      { key: "adx_max", label: "Max ADX", help: "Skip strong trends", type: "float", min: 5, max: 80, step: 0.5 },
      ...EXIT_PARAMS,
    ],
    warmup: (p) => num(p, "z_n") + 30,
    generate: zfade, exits,
  },
  bounce: {
    key: "bounce", group: "highwin",
    name: "Band Snapback",
    short: "Waits for price to close outside the Bollinger Band and then snap back inside before fading it.",
    entry: "Close below the lower Bollinger(20, 2.5) then back inside, ADX < 30 → BUY (mirror for SELL)",
    exit: "Middle band, +1 ATR target, 3 ATR stop, 24-bar limit",
    sizing: "atr", legs: "any",
    defaults: { bb_n: 20, bb_k: 2.5, adx_max: 30, ...EXIT_DEFAULTS },
    params: [
      { key: "bb_n", label: "Bollinger period", help: "Bars in the band average", type: "int", min: 5, max: 200 },
      { key: "bb_k", label: "Band width (σ)", help: "Standard deviations for the bands", type: "float", min: 1, max: 5, step: 0.1 },
      { key: "adx_max", label: "Max ADX", help: "Skip strong trends", type: "float", min: 5, max: 80, step: 0.5 },
      ...EXIT_PARAMS,
    ],
    warmup: (p) => num(p, "bb_n") + 30,
    generate: bounce, exits,
  },
};

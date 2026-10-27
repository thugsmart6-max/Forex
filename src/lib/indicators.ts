/**
 * Technical indicators - a line-by-line port of indicators.py.
 * Arrays use NaN for "not enough data yet", matching pandas semantics
 * (ewm adjust=False with min_periods, rolling windows, sample std).
 */
import type { OHLC } from "./types";

/** pandas `ewm(alpha, adjust=False, min_periods)` - NaNs are skipped, value carries forward. */
export function ewm(x: number[], alpha: number, minPeriods = 0): number[] {
  const out = new Array<number>(x.length);
  let s = NaN;
  let count = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (!Number.isNaN(v)) {
      s = Number.isNaN(s) ? v : alpha * v + (1 - alpha) * s;
      count++;
    }
    out[i] = count >= Math.max(minPeriods, 1) ? s : NaN;
  }
  return out;
}

export const ema = (s: number[], n: number) => ewm(s, 2 / (n + 1));

export function sma(s: number[], n: number): number[] {
  const out = new Array<number>(s.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    sum += s[i];
    if (i >= n) sum -= s[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** Rolling sample standard deviation (ddof = 1), like pandas. */
export function rollingStd(s: number[], n: number): number[] {
  const out = new Array<number>(s.length).fill(NaN);
  for (let i = n - 1; i < s.length; i++) {
    let m = 0;
    for (let j = i - n + 1; j <= i; j++) m += s[j];
    m /= n;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (s[j] - m) ** 2;
    out[i] = Math.sqrt(v / (n - 1));
  }
  return out;
}

export function rollingMax(s: number[], n: number): number[] {
  const out = new Array<number>(s.length).fill(NaN);
  for (let i = n - 1; i < s.length; i++) {
    let m = -Infinity;
    for (let j = i - n + 1; j <= i; j++) if (s[j] > m) m = s[j];
    out[i] = m;
  }
  return out;
}

export function rollingMin(s: number[], n: number): number[] {
  const out = new Array<number>(s.length).fill(NaN);
  for (let i = n - 1; i < s.length; i++) {
    let m = Infinity;
    for (let j = i - n + 1; j <= i; j++) if (s[j] < m) m = s[j];
    out[i] = m;
  }
  return out;
}

/** shift(1): value of the previous bar. */
export const shift1 = (s: number[]) => [NaN, ...s.slice(0, -1)];

export function trueRange(d: OHLC): number[] {
  return d.c.map((_, i) => {
    const hl = d.h[i] - d.l[i];
    if (i === 0) return hl;
    const pc = d.c[i - 1];
    return Math.max(hl, Math.abs(d.h[i] - pc), Math.abs(d.l[i] - pc));
  });
}

/** Wilder's Average True Range. */
export const atr = (d: OHLC, n = 14) => ewm(trueRange(d), 1 / n, n);

export function rsi(s: number[], n = 14): number[] {
  const up: number[] = [];
  const dn: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const diff = i === 0 ? NaN : s[i] - s[i - 1];
    up.push(Number.isNaN(diff) ? NaN : Math.max(diff, 0));
    dn.push(Number.isNaN(diff) ? NaN : Math.max(-diff, 0));
  }
  const u = ewm(up, 1 / n, n);
  const d = ewm(dn, 1 / n, n);
  return u.map((uv, i) => {
    const dv = d[i] === 0 ? NaN : d[i];
    const r = 100 - 100 / (1 + uv / dv);
    return Number.isNaN(r) ? 50 : r;
  });
}

export function adx(d: OHLC, n = 14): number[] {
  const len = d.c.length;
  const plus = new Array<number>(len).fill(0);
  const minus = new Array<number>(len).fill(0);
  for (let i = 1; i < len; i++) {
    const up = d.h[i] - d.h[i - 1];
    const dn = -(d.l[i] - d.l[i - 1]);
    plus[i] = up > dn && up > 0 ? up : 0;
    minus[i] = dn > up && dn > 0 ? dn : 0;
  }
  const a = atr(d, n);
  const p = ewm(plus, 1 / n, n);
  const m = ewm(minus, 1 / n, n);
  const dx = a.map((av, i) => {
    const pdi = (100 * p[i]) / av;
    const mdi = (100 * m[i]) / av;
    const sum = pdi + mdi;
    return sum === 0 ? NaN : (100 * Math.abs(pdi - mdi)) / sum;
  });
  return ewm(dx, 1 / n, n);
}

export function bollinger(s: number[], n = 20, k = 2) {
  const mid = sma(s, n);
  const sd = rollingStd(s, n);
  return {
    mid,
    up: mid.map((m, i) => m + k * sd[i]),
    lo: mid.map((m, i) => m - k * sd[i]),
  };
}

/**
 * Synthetic data for testing the code ONLY (port of data.synthetic_pair).
 * The first instrument follows a regime-switching random walk (trending and ranging spells);
 * every other instrument = first / mean-reverting ratio (Ornstein-Uhlenbeck), rescaled to its own
 * typical price, so pair strategies have something to trade.
 * This is NOT market data - results on it mean nothing.
 */
import { emptyOHLC, type DataSet, type OHLC } from "./types";

const TYPICAL: Record<string, number> = {
  XAUUSD: 2500, XAGUSD: 30, XPTUSD: 1000, XPDUSD: 1000,
  EURUSD: 1.1, GBPUSD: 1.3, USDJPY: 150, USDCHF: 0.85, AUDUSD: 0.66, USDCAD: 1.37, NZDUSD: 0.6,
  USDINR: 85, USDSGD: 1.3, USDCNH: 7.1, USDHKD: 7.8, USDZAR: 18, USDMXN: 19, USDTRY: 35,
};

function rng(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(uniform(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
  return { uniform, normal };
}

export function synthetic(keys: string[], interval: "1h" | "1d", years = 2, seed = 7): DataSet {
  const r = rng(seed);
  const t: number[] = [];
  const start = Date.UTC(2024, 0, 1) / 1000;
  const step = interval === "1h" ? 3600 : 86400;
  const total = interval === "1h" ? Math.floor(years * 365 * 24) : Math.floor(years * 365);
  for (let i = 0; i < total; i++) {
    const ts = start + i * step;
    const dow = new Date(ts * 1000).getUTCDay();
    if (dow !== 0 && dow !== 6) t.push(ts);
  }
  const n = t.length;
  const bpy = n / years;
  const vol = 0.16 / Math.sqrt(bpy);

  // regimes: drift switches every few weeks
  const drift = new Array<number>(n).fill(0);
  for (let i = 0; i < n; ) {
    const lo = Math.max(1, Math.floor(bpy / 26));
    const len = lo + Math.floor(r.uniform() * (Math.floor(bpy / 6) - lo));
    const mu = [-0.35, 0, 0, 0.4][Math.floor(r.uniform() * 4)] / bpy;
    for (let j = i; j < Math.min(n, i + len); j++) drift[j] = mu;
    i += len;
  }
  const base: number[] = [];
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const v = vol * Math.exp(0.35 * Math.sin(i / (bpy / 8)));
    lp += drift[i] + v * r.normal();
    base.push(Math.exp(lp));
  }

  const ohlc = (close: number[], scale: number): OHLC => {
    const d = emptyOHLC();
    for (let i = 0; i < n; i++) {
      const o = (i ? close[i - 1] : close[0]) * (1 + 0.1 * scale * r.normal());
      const c = close[i];
      d.t.push(t[i]);
      d.o.push(o);
      d.c.push(c);
      d.h.push(Math.max(o, c) * (1 + Math.abs(r.normal()) * scale * 0.6));
      d.l.push(Math.min(o, c) * (1 - Math.abs(r.normal()) * scale * 0.6));
    }
    return d;
  };

  const out: DataSet = {};
  keys.forEach((k, idx) => {
    const px0 = TYPICAL[k] ?? 100;
    if (idx === 0) {
      out[k] = ohlc(base.map((b) => b * px0), vol);
      return;
    }
    // OU log-ratio against the first instrument
    const theta = 4 / bpy;
    const sig = 0.11 / Math.sqrt(bpy);
    let lr = 0;
    const close = base.map((b) => {
      lr = lr + theta * (0 - lr) + sig * r.normal();
      return (b / Math.exp(lr)) * px0;
    });
    out[k] = ohlc(close, vol * 1.4);
  });
  return out;
}

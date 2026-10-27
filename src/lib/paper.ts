/**
 * Paper trading: runs a strategy bar-by-bar on a live or replayed feed with a SIMULATED account.
 * No real orders are ever sent. Uses the exact same Engine as the backtester (port of paper.py).
 *
 * Signals are recomputed on a sliding window (default 600 bars) every bar, which can differ
 * slightly from a full-history backtest.
 */
import { atr } from "./indicators";
import { Engine, type Bar, type EngineConfig, type EngineState } from "./engine";
import { STRATEGIES, type Params, type StrategyKey } from "./strategies";
import { align, emptyOHLC, sliceOHLC, type DataSet } from "./types";

export interface PaperSetup {
  strategy: StrategyKey;
  params: Params;
  keys: string[];
  cfg: EngineConfig;
  feed: "replay" | "live";
  source: "yahoo" | "synthetic"; // replay source (live is always yahoo)
  interval: "5m" | "15m" | "1h" | "1d";
  range: string;
}

export interface PaperSnapshot {
  setup: PaperSetup;
  engine: EngineState;
  hist: DataSet;
  lastTs: number | null;
  lastSignals: Record<string, number>;
  startedAt: number;
}

const MAX_CURVE = 5000;

export class PaperTrader {
  setup: PaperSetup;
  engine: Engine;
  hist: DataSet;
  lookback: number;
  lastTs: number | null = null;
  lastSignals: Record<string, number> = {};
  startedAt: number;

  constructor(setup: PaperSetup, history: DataSet, lookback = 600) {
    this.setup = setup;
    const def = STRATEGIES[setup.strategy];
    this.lookback = Math.max(lookback, def.warmup(setup.params) + 50);
    const a = align(history);
    this.hist = Object.fromEntries(setup.keys.map((k) => [k, sliceOHLC(a[k], Math.max(0, a[k].t.length - this.lookback))]));
    this.lastTs = this.hist[setup.keys[0]].t.at(-1) ?? null;
    this.engine = new Engine(setup.keys, setup.cfg, def.sizing);
    this.engine.maxLog = 500;
    this.startedAt = Date.now();
  }

  static restore(s: PaperSnapshot): PaperTrader {
    const p = new PaperTrader(s.setup, s.hist);
    p.engine.loadState(s.engine);
    p.engine.maxLog = 500;
    p.lastTs = s.lastTs;
    p.lastSignals = s.lastSignals;
    p.startedAt = s.startedAt;
    return p;
  }

  snapshot(): PaperSnapshot {
    return { setup: this.setup, engine: this.engine.state(), hist: this.hist, lastTs: this.lastTs, lastSignals: this.lastSignals, startedAt: this.startedAt };
  }

  onBar(t: number, bars: Record<string, Bar>) {
    const { keys, strategy, params } = this.setup;
    for (const k of keys) {
      const h = this.hist[k] ?? emptyOHLC();
      const b = bars[k];
      h.t.push(t);
      h.o.push(b.Open);
      h.h.push(b.High);
      h.l.push(b.Low);
      h.c.push(b.Close);
      this.hist[k] = h.t.length > this.lookback ? sliceOHLC(h, h.t.length - this.lookback) : h;
    }
    const win = align(this.hist);
    const sig = STRATEGIES[strategy].generate(win, keys, params);
    const signals = Object.fromEntries(keys.map((k) => [k, sig[k].at(-1) ?? 0]));
    const atrs = Object.fromEntries(keys.map((k) => {
      const v = atr(win[k]).at(-1);
      return [k, v == null || Number.isNaN(v) ? null : v];
    }));
    this.engine.onBar(t, bars, signals, atrs);
    if (this.engine.equityCurve.length > MAX_CURVE) this.engine.equityCurve.splice(0, this.engine.equityCurve.length - MAX_CURVE);
    this.lastSignals = signals;
    this.lastTs = t;
  }

  /** Feed every bar in `data` newer than the last processed one (and complete before `now`, if given). */
  ingest(data: DataSet, stepSec: number, nowSec?: number, maxBars = Infinity): number {
    const a = align(data);
    const k0 = this.setup.keys[0];
    let n = 0;
    for (let i = 0; i < a[k0].t.length && n < maxBars; i++) {
      const t = a[k0].t[i];
      if (this.lastTs != null && t <= this.lastTs) continue;
      if (nowSec != null && t + stepSec > nowSec) break; // bar still forming
      this.onBar(t, Object.fromEntries(this.setup.keys.map((k) => [k, { Open: a[k].o[i], High: a[k].h[i], Low: a[k].l[i], Close: a[k].c[i] }])));
      n++;
    }
    return n;
  }

  /** How many bars in `data` are still waiting to be replayed. */
  remaining(data: DataSet): number {
    const t = align(data)[this.setup.keys[0]].t;
    return this.lastTs == null ? t.length : t.filter((x) => x > this.lastTs!).length;
  }
}

export const STEP_SEC: Record<PaperSetup["interval"], number> = { "5m": 300, "15m": 900, "1h": 3600, "1d": 86400 };
/** Yahoo range to fetch for the live feed (enough for the 600-bar window). */
export const LIVE_RANGE: Record<PaperSetup["interval"], string> = { "5m": "5d", "15m": "1mo", "1h": "3mo", "1d": "5y" };

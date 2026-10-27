/** Bar-by-bar backtester - a port of backtest.py. Uses the same Engine as the paper trader. */
import { atr } from "./indicators";
import { Engine, type EngineConfig, type LogEntry, type Trade } from "./engine";
import { describe, type Params, type StrategyDef } from "./strategies";
import { align, type DataSet } from "./types";

export interface Stats {
  start: number;
  end: number;
  finalEquity: number;
  totalReturn: number;
  cagr: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number;
  trades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  expectancy: number;
  maxConsecLosses: number;
  avgR: number;
  stops: number;
}

export interface BacktestResult {
  strategy: string;
  name: string;
  description: string;
  keys: string[];
  equity: [number, number][];
  trades: Trade[];
  stats: Stats;
  log: LogEntry[];
  data: DataSet;
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a: number[]) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

export function computeStats(equity: [number, number][], trades: Trade[]): Stats {
  const t0 = equity[0][0];
  const t1 = equity.at(-1)![0];
  const eq = equity.map((e) => e[1]);
  const years = Math.max(Math.floor((t1 - t0) / 86400) / 365.25, 1e-9);
  const barsPerYear = eq.length / years;
  const rets = eq.slice(1).map((v, i) => v / eq[i] - 1);
  const sd = std(rets);
  const sharpe = sd > 0 ? (mean(rets) / sd) * Math.sqrt(barsPerYear) : 0;
  const downside = std(rets.filter((r) => r < 0));
  const sortino = downside > 0 ? (mean(rets) / downside) * Math.sqrt(barsPerYear) : 0;
  const last = eq.at(-1)!;
  const total = last / eq[0] - 1;
  const cagr = last > 0 ? (last / eq[0]) ** (1 / years) - 1 : -1;
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of eq) {
    peak = Math.max(peak, v);
    maxDd = Math.min(maxDd, v / peak - 1);
  }
  const s: Stats = {
    start: t0, end: t1, finalEquity: last, totalReturn: total, cagr, sharpe, sortino,
    maxDrawdown: maxDd, calmar: maxDd < 0 ? cagr / Math.abs(maxDd) : NaN,
    trades: 0, winRate: NaN, avgWin: 0, avgLoss: 0, profitFactor: NaN, expectancy: 0,
    maxConsecLosses: 0, avgR: NaN, stops: 0,
  };
  const n = trades.length;
  if (n) {
    const pnl = trades.map((t) => t.pnl);
    const wins = pnl.filter((v) => v > 0);
    const losses = pnl.filter((v) => v <= 0);
    const lossSum = losses.reduce((a, b) => a + b, 0);
    let streak = 0;
    let mx = 0;
    for (const v of pnl) {
      streak = v <= 0 ? streak + 1 : 0;
      mx = Math.max(mx, streak);
    }
    const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r != null);
    Object.assign(s, {
      trades: n,
      winRate: wins.length / n,
      avgWin: wins.length ? mean(wins) : 0,
      avgLoss: losses.length ? mean(losses) : 0,
      profitFactor: lossSum < 0 ? wins.reduce((a, b) => a + b, 0) / -lossSum : Infinity,
      expectancy: mean(pnl),
      maxConsecLosses: mx,
      avgR: rs.length ? mean(rs) : NaN,
      stops: trades.filter((t) => t.reason === "stop").length,
    });
  }
  return s;
}

export interface MonthStat {
  month: string; // "2025-06" (UTC)
  trades: number;
  wins: number;
  winRate: number; // NaN when no trades closed that month
  startEquity: number;
  endEquity: number;
  pnl: number;
  ret: number; // return on the equity at the start of the month
}

/** Month-by-month results: trades are counted in the month they closed, returns come from the equity curve. */
export function monthlyStats(equity: [number, number][], trades: Trade[], initial: number): MonthStat[] {
  const key = (t: number) => new Date(t * 1000).toISOString().slice(0, 7);
  const months = new Map<string, MonthStat>();
  let prevEnd = initial;
  for (const [t, v] of equity) {
    const k = key(t);
    let m = months.get(k);
    if (!m) {
      m = { month: k, trades: 0, wins: 0, winRate: NaN, startEquity: prevEnd, endEquity: v, pnl: 0, ret: 0 };
      months.set(k, m);
    }
    m.endEquity = v;
    prevEnd = v;
  }
  for (const tr of trades) {
    const m = months.get(key(tr.exitTime));
    if (!m) continue;
    m.trades++;
    if (tr.pnl > 0) m.wins++;
  }
  for (const m of months.values()) {
    m.pnl = m.endEquity - m.startEquity;
    m.ret = m.endEquity / m.startEquity - 1;
    m.winRate = m.trades ? m.wins / m.trades : NaN;
  }
  return [...months.values()];
}

/** Fall from the running peak after every bar (0 = at a new high, -0.1 = 10% below it). */
export function drawdownCurve(equity: [number, number][]): [number, number][] {
  let peak = -Infinity;
  return equity.map(([t, v]) => {
    peak = Math.max(peak, v);
    return [t, v / peak - 1];
  });
}

export function runBacktest(
  def: StrategyDef,
  params: Params,
  raw: DataSet,
  keys: string[],
  cfg: EngineConfig,
  atrN = 14,
): BacktestResult {
  const data = align(Object.fromEntries(keys.map((k) => [k, raw[k]])));
  const n = data[keys[0]].t.length;
  if (n < 50) throw new Error(`Only ${n} overlapping bars - need more data (try a longer period).`);
  const signals = def.generate(data, keys, params);
  const atrs = Object.fromEntries(keys.map((k) => [k, atr(data[k], atrN)]));
  const eng = new Engine(keys, cfg, def.sizing, def.exits?.(params));

  const idx = data[keys[0]].t;
  for (let i = 0; i < n; i++) {
    const bars = Object.fromEntries(
      keys.map((k) => [k, { Open: data[k].o[i], High: data[k].h[i], Low: data[k].l[i], Close: data[k].c[i] }]),
    );
    eng.onBar(
      idx[i],
      bars,
      Object.fromEntries(keys.map((k) => [k, signals[k][i]])),
      Object.fromEntries(keys.map((k) => [k, Number.isNaN(atrs[k][i]) ? null : atrs[k][i]])),
    );
  }
  eng.closeAll(idx[n - 1], Object.fromEntries(keys.map((k) => [k, data[k].c[n - 1]])));

  return {
    strategy: def.key,
    name: def.name,
    description: describe(def, params),
    keys,
    equity: eng.equityCurve,
    trades: eng.trades,
    stats: computeStats(eng.equityCurve, eng.trades),
    log: eng.log,
    data,
  };
}

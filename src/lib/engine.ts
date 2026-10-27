/**
 * Execution + risk engine, shared by the backtester AND the paper trader so both behave identically.
 * A port of engine.py; account currency is USD.
 *
 * Bar processing order (onBar):
 *   1. New trading day (UTC) -> reset daily-loss guard
 *   2. Fill orders queued on the previous bar at THIS bar's open (spread + commission applied)
 *   3. Check protective stops against this bar's high/low (gap-through fills at the open)
 *   4. Trail stops using this bar's close and ATR
 *   5. Mark equity at the close
 *   6. Daily loss kill-switch: flatten everything and stop trading for the rest of the day
 *   7. Queue the strategy's new target for the next bar
 */
import { BY_ID, toUsd, type Spec } from "./instruments";

export interface EngineConfig {
  initialEquity: number;
  riskPerTrade: number; // 1% of equity risked per ATR-sized trade
  stopAtrMult: number; // initial stop = 2 x ATR from entry
  trailing: boolean; // trail the stop with the close
  maxLeverage: number; // cap on notional / equity per position
  pairNotionalFrac: number; // notional per leg for pair trades, as a fraction of equity
  maxDailyLoss: number; // kill-switch: 3% loss from the day's starting equity (0 = off)
}

export const DEFAULT_CONFIG: EngineConfig = {
  initialEquity: 10_000,
  riskPerTrade: 0.01,
  stopAtrMult: 2,
  trailing: true,
  maxLeverage: 10,
  pairNotionalFrac: 0.5,
  maxDailyLoss: 0.03,
};

export interface Position {
  direction: number;
  lots: number;
  entry: number;
  entryTime: number;
  stop: number | null;
  riskAmount: number | null;
  entryCommission: number;
}

export interface Trade {
  symbol: string;
  side: "LONG" | "SHORT";
  lots: number;
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  pnl: number;
  rMultiple: number | null;
  reason: string;
}

export interface Bar {
  Open: number;
  High: number;
  Low: number;
  Close: number;
}

export interface LogEntry {
  t: number;
  kind: "open" | "close" | "info" | "warn";
  msg: string;
}

export interface EngineState {
  cash: number;
  positions: Record<string, Position>;
  pending: Record<string, number>;
  pendingAtr: Record<string, number | null>;
  blocked: Record<string, number>;
  day: number | null;
  dayStartEquity: number;
  halted: boolean;
  lastClose: Record<string, number>;
  trades: Trade[];
  equityCurve: [number, number][];
  log: LogEntry[];
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export class Engine {
  specs: Record<string, Spec>;
  cfg: EngineConfig;
  sizing: "atr" | "notional";
  cash: number;
  positions: Record<string, Position> = {};
  pending: Record<string, number> = {};
  pendingAtr: Record<string, number | null> = {};
  blocked: Record<string, number> = {}; // direction stopped out; no re-entry until signal changes
  day: number | null = null;
  dayStartEquity: number;
  halted = false;
  lastClose: Record<string, number> = {};
  trades: Trade[] = [];
  equityCurve: [number, number][] = [];
  log: LogEntry[] = [];
  /** cap on stored log lines (paper trading can run for a long time) */
  maxLog = Infinity;

  constructor(keys: string[], cfg: EngineConfig, sizing: "atr" | "notional", specOverrides?: Record<string, Partial<Spec>>) {
    this.specs = {};
    for (const k of keys) {
      const base = BY_ID[k]?.spec;
      if (!base) throw new Error(`${k} has no contract spec - it cannot be traded`);
      this.specs[k] = { ...base, ...(specOverrides?.[k] ?? {}) };
    }
    this.cfg = cfg;
    this.sizing = sizing;
    this.cash = cfg.initialEquity;
    this.dayStartEquity = cfg.initialEquity;
  }

  // ---------- helpers ----------
  private emit(t: number, kind: LogEntry["kind"], msg: string) {
    this.log.push({ t, kind, msg });
    if (this.log.length > this.maxLog) this.log.splice(0, this.log.length - this.maxLog);
  }

  private fill(k: string, side: number, px: number) {
    return px + (side * this.specs[k].spread) / 2;
  }

  private cost(k: string, lots: number) {
    return lots * this.specs[k].commission;
  }

  private roundLots(k: string, lots: number) {
    const step = this.specs[k].lotStep;
    return round(Math.floor(lots / step + 1e-9) * step, 8);
  }

  /** P&L in USD of `lots` moving from `entry` to `px` */
  private pnl(k: string, dir: number, lots: number, entry: number, px: number) {
    const s = this.specs[k];
    return dir * lots * s.contractSize * (px - entry) * toUsd(s, px);
  }

  equity(prices: Record<string, number>): number {
    let eq = this.cash;
    for (const [k, p] of Object.entries(this.positions)) {
      const px = prices[k] ?? this.lastClose[k] ?? p.entry;
      eq += this.pnl(k, p.direction, p.lots, p.entry, px);
    }
    return eq;
  }

  private open(k: string, direction: number, px: number, t: number, atrVal: number | null | undefined, equity: number) {
    const s = this.specs[k];
    const usdPerUnitLot = s.contractSize * toUsd(s, px); // USD P&L per 1.0 price move per lot
    let stopDist: number | null = null;
    let lots: number;
    if (this.sizing === "atr") {
      if (atrVal == null || !(atrVal > 0)) return;
      stopDist = this.cfg.stopAtrMult * atrVal;
      lots = (equity * this.cfg.riskPerTrade) / (stopDist * usdPerUnitLot);
      const cap = (equity * this.cfg.maxLeverage) / (px * usdPerUnitLot);
      lots = Math.min(lots, cap);
    } else {
      lots = (equity * this.cfg.pairNotionalFrac) / (px * usdPerUnitLot);
    }
    lots = this.roundLots(k, lots);
    const name = BY_ID[k].name;
    if (lots < s.minLot) {
      this.emit(t, "warn", `skip ${name}: size ${lots.toFixed(4)} below minimum lot (increase capital or reduce risk)`);
      return;
    }
    const fill = this.fill(k, direction, px);
    const comm = this.cost(k, lots);
    this.cash -= comm;
    const stop = stopDist ? fill - direction * stopDist : null;
    const riskAmt = stopDist ? lots * stopDist * usdPerUnitLot : null;
    this.positions[k] = { direction, lots, entry: fill, entryTime: t, stop, riskAmount: riskAmt, entryCommission: comm };
    this.emit(t, "open", `OPEN ${direction > 0 ? "LONG" : "SHORT"} ${lots} ${name} @ ${fill.toPrecision(6)}` +
      (stop != null ? `  stop ${stop.toPrecision(6)}` : ""));
  }

  private close(k: string, px: number, t: number, reason: string) {
    const p = this.positions[k];
    delete this.positions[k];
    const fill = this.fill(k, -p.direction, px);
    const gross = this.pnl(k, p.direction, p.lots, p.entry, fill);
    const comm = this.cost(k, p.lots);
    this.cash += gross - comm;
    const net = gross - comm - p.entryCommission;
    this.trades.push({
      symbol: k,
      side: p.direction > 0 ? "LONG" : "SHORT",
      lots: p.lots,
      entryTime: p.entryTime,
      exitTime: t,
      entry: round(p.entry, 6),
      exit: round(fill, 6),
      pnl: round(net, 2),
      rMultiple: p.riskAmount ? round(net / p.riskAmount, 2) : null,
      reason,
    });
    this.emit(t, "close", `CLOSE ${BY_ID[k].name} @ ${fill.toPrecision(6)} (${reason})  P&L ${net.toFixed(2)}`);
  }

  // ---------- main step ----------
  onBar(t: number, bars: Record<string, Bar>, signals: Record<string, number>, atrs: Record<string, number | null>) {
    const opens: Record<string, number> = {};
    const closes: Record<string, number> = {};
    for (const [k, b] of Object.entries(bars)) {
      opens[k] = b.Open;
      closes[k] = b.Close;
    }

    // 1. daily reset (UTC day)
    const d = Math.floor(t / 86400);
    if (d !== this.day) {
      this.day = d;
      this.dayStartEquity = this.equity(Object.keys(this.lastClose).length ? this.lastClose : opens);
      this.halted = false;
    }

    // 2. fill queued orders at the open
    const eqOpen = this.equity(opens);
    for (const [k, tgt] of Object.entries(this.pending)) {
      if (!(k in bars)) continue;
      const target = this.halted ? 0 : tgt;
      const cur = this.positions[k]?.direction ?? 0;
      if (target !== cur) {
        if (cur !== 0) this.close(k, opens[k], t, "signal");
        if (target !== 0) this.open(k, target, opens[k], t, this.pendingAtr[k], eqOpen);
      }
    }
    this.pending = {};

    // 3. stops
    for (const [k, p] of Object.entries(this.positions)) {
      if (p.stop == null || !(k in bars)) continue;
      const b = bars[k];
      if (p.direction === 1 && b.Low <= p.stop) {
        this.close(k, Math.min(b.Open, p.stop), t, "stop");
        this.blocked[k] = 1;
      } else if (p.direction === -1 && b.High >= p.stop) {
        this.close(k, Math.max(b.Open, p.stop), t, "stop");
        this.blocked[k] = -1;
      }
    }

    // 4. trail stops
    if (this.cfg.trailing) {
      for (const [k, p] of Object.entries(this.positions)) {
        const a = atrs[k];
        if (p.stop == null || a == null || !(a > 0)) continue;
        const nw = closes[k] - p.direction * this.cfg.stopAtrMult * a;
        p.stop = p.direction === 1 ? Math.max(p.stop, nw) : Math.min(p.stop, nw);
      }
    }

    // 5. mark to market
    Object.assign(this.lastClose, closes);
    let eq = this.equity(closes);

    // 6. daily loss kill-switch
    if (!this.halted && this.cfg.maxDailyLoss && eq < this.dayStartEquity * (1 - this.cfg.maxDailyLoss)) {
      for (const k of Object.keys(this.positions)) this.close(k, closes[k], t, "daily_loss_limit");
      this.halted = true;
      this.emit(t, "warn", "DAILY LOSS LIMIT hit - trading halted until next day");
      eq = this.equity(closes);
    }
    this.equityCurve.push([t, eq]);

    // 7. queue next targets
    for (const [k, raw] of Object.entries(signals)) {
      let sig = raw == null || Number.isNaN(raw) ? 0 : Math.trunc(raw);
      const b = this.blocked[k];
      if (b !== undefined) {
        if (sig === b) sig = 0; // stay out after a stop until the signal changes
        else delete this.blocked[k];
      }
      this.pending[k] = sig;
      this.pendingAtr[k] = atrs[k] ?? null;
    }
  }

  closeAll(t: number, prices: Record<string, number>, reason = "end_of_test") {
    for (const k of Object.keys(this.positions)) this.close(k, prices[k], t, reason);
    if (this.equityCurve.length) this.equityCurve[this.equityCurve.length - 1] = [this.equityCurve.at(-1)![0], this.equity(prices)];
  }

  /** Unrealised P&L of one open position at its last close. */
  openPnl(k: string): number {
    const p = this.positions[k];
    if (!p) return 0;
    return this.pnl(k, p.direction, p.lots, p.entry, this.lastClose[k] ?? p.entry);
  }

  // ---------- persistence for paper trading ----------
  state(): EngineState {
    return structuredClone({
      cash: this.cash,
      positions: this.positions,
      pending: this.pending,
      pendingAtr: this.pendingAtr,
      blocked: this.blocked,
      day: this.day,
      dayStartEquity: this.dayStartEquity,
      halted: this.halted,
      lastClose: this.lastClose,
      trades: this.trades,
      equityCurve: this.equityCurve,
      log: this.log,
    });
  }

  loadState(s: EngineState) {
    Object.assign(this, structuredClone(s));
  }
}

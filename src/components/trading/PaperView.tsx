"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { download, toCsv } from "@/lib/csv";
import { DEFAULT_CONFIG, type EngineConfig } from "@/lib/engine";
import { dateTime, pct, usd } from "@/lib/format";
import { fetchHistory, useLocalStorage, useThrottle } from "@/lib/hooks";
import { BY_ID, fmtPrice } from "@/lib/instruments";
import { PaperTrader, LIVE_RANGE, STEP_SEC, strategyFor, type PaperSetup, type PaperSnapshot } from "@/lib/paper";
import { STRATEGY_LIST, findStrategy, getStrategy, withDefaults, type Params, type StrategyKey } from "@/lib/strategies";
import { useCustomStrategies } from "@/lib/useCustom";
import { monthlyStats } from "@/lib/backtest";
import { ReturnsCalendar } from "./MonthlyStats";
import { synthetic } from "@/lib/synthetic";
import { align, sliceOHLC, type DataSet } from "@/lib/types";
import { CandleChart, LineChart, type Marker } from "../charts";
import { Button, Card, Empty, Field, Segmented, SignalBadge, Spinner, Stat, cx, inputCls } from "../ui";
import { InstrumentChips, InstrumentSelect, ParamsEditor, RiskEditor, StrategyPicker, TradesTable, readSymbolParam } from "./shared";

const SNAP_KEY = "paper.session";
const SPEEDS = [
  { value: "1", label: "1×", perSec: 1 },
  { value: "5", label: "5×", perSec: 5 },
  { value: "20", label: "20×", perSec: 20 },
  { value: "100", label: "100×", perSec: 100 },
  { value: "max", label: "Max", perSec: 1000 },
] as const;
type Speed = (typeof SPEEDS)[number]["value"];

const defaultParams = () => Object.fromEntries(STRATEGY_LIST.map((s) => [s.key, { ...s.defaults }])) as Record<StrategyKey, Params>;

function loadSnap(): PaperSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSnap(s: PaperSnapshot | null) {
  try {
    if (s) localStorage.setItem(SNAP_KEY, JSON.stringify(s));
    else localStorage.removeItem(SNAP_KEY);
  } catch {}
}

async function fetchSet(setup: PaperSetup, range: string): Promise<DataSet> {
  if (setup.feed === "replay" && setup.source === "synthetic") return synthetic(setup.keys, setup.interval === "1d" ? "1d" : "1h");
  const entries = await Promise.all(setup.keys.map(async (k) => [k, await fetchHistory(k, setup.interval, range)] as const));
  return align(Object.fromEntries(entries));
}

export function PaperView() {
  // ----- setup form -----
  const { list: customList, defs: customDefs } = useCustomStrategies();
  const [strategy, setStrategy] = useLocalStorage<StrategyKey | "all" | "allhw">("pp.strategy", "breakout");
  const [symbols, setSymbols] = useLocalStorage<string[]>("pp.symbols", ["XAUUSD"]);
  const [legs, setLegs] = useLocalStorage<[string, string]>("pp.legs", ["XAUUSD", "XAGUSD"]);
  const [feed, setFeed] = useLocalStorage<"replay" | "live">("pp.feed", "replay");
  const [source, setSource] = useLocalStorage<"yahoo" | "synthetic">("pp.source", "yahoo");
  const [interval, setBarSize] = useLocalStorage<PaperSetup["interval"]>("pp.interval", "1h");
  const [params, setParams] = useLocalStorage<Record<StrategyKey, Params>>("pp.params", defaultParams());
  const [cfg, setCfg] = useLocalStorage<EngineConfig>("pp.cfg", DEFAULT_CONFIG);
  const [speed, setSpeed] = useLocalStorage<Speed>("pp.speed", "20");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ----- session -----
  // The trader is a mutable engine; `version` re-renders the view after it processes bars.
  const [trader, setTrader] = useState<PaperTrader | null>(null);
  const [replay, setReplay] = useState<DataSet | null>(null);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPoll, setLastPoll] = useState<number | null>(null);
  const [chartSym, setChartSym] = useState<string | null>(null);
  const [tab, setTab] = useState<"trades" | "log">("log");

  const strat: StrategyKey = strategy === "all" || strategy === "allhw" || !findStrategy(strategy) ? "trend" : strategy;
  const stratDef = getStrategy(strat);
  const t = trader;

  const persist = useCallback((tr: PaperTrader | null) => {
    if (tr) saveSnap(tr.snapshot());
  }, []);

  // restore a saved session (like --resume)
  useEffect(() => {
    const s = loadSnap();
    if (s) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore persisted session once
        setTrader(PaperTrader.restore(s));
      } catch {
        saveSnap(null);
      }
    } else {
      const sym = readSymbolParam();
      if (sym) setSymbols([sym]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setError(null);
    const keys = strat === "ratio" ? legs : symbols;
    if (!keys.length) return setError("Pick at least one instrument.");
    if (strat === "ratio" && legs[0] === legs[1]) return setError("The pair strategy needs two different instruments.");
    const setup: PaperSetup = {
      strategy: strat, params: withDefaults(strat, params[strat]), keys, cfg, feed,
      custom: stratDef.group === "custom" ? customList.find((c) => `custom:${c.id}` === strat) : undefined,
      source: feed === "live" ? "yahoo" : source,
      interval: feed === "replay" && source === "synthetic" && interval !== "1d" ? "1h" : interval,
      range: feed === "live" ? LIVE_RANGE[interval] : interval === "1h" ? "730d" : interval === "1d" ? "10y" : "60d",
    };
    setBusy("Loading market data");
    try {
      const data = await fetchSet(setup, setup.range);
      const n = data[keys[0]].t.length;
      const def = strategyFor(setup);
      const warm = Math.max(600, def.warmup(setup.params) + 50);
      let tr: PaperTrader;
      if (setup.feed === "replay") {
        if (n < warm + 20) throw new Error(`Only ${n} bars available — need more than ${warm + 20} for warm-up plus replay. Try a longer bar size.`);
        tr = new PaperTrader(setup, Object.fromEntries(keys.map((k) => [k, sliceOHLC(data[k], 0, warm)])));
        setReplay(data);
      } else {
        const now = Date.now() / 1000;
        const step = STEP_SEC[setup.interval];
        const done = Object.fromEntries(keys.map((k) => {
          const end = data[k].t.findIndex((x) => x + step > now);
          return [k, sliceOHLC(data[k], 0, end === -1 ? undefined : end)];
        }));
        tr = new PaperTrader(setup, done);
      }
      persist(tr);
      setTrader(tr);
      setChartSym(keys[0]);
      setRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    if (trader && !confirm("End this paper-trading session and clear its account, trades and log?")) return;
    setRunning(false);
    setTrader(null);
    setReplay(null);
    saveSnap(null);
  };

  // a restored replay session needs its data reloaded before it can continue
  const ensureReplayData = async (): Promise<DataSet | null> => {
    if (!trader || trader.setup.feed !== "replay") return null;
    if (replay) return replay;
    setBusy("Reloading replay data");
    try {
      const d = await fetchSet(trader.setup, trader.setup.range);
      setReplay(d);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const resume = async () => {
    if (trader?.setup.feed === "live" || (await ensureReplayData())) setRunning(true);
  };

  const stepOnce = async () => {
    const d = await ensureReplayData();
    if (!d || !trader) return;
    trader.ingest(d, STEP_SEC[trader.setup.interval], undefined, 1);
    persist(trader);
    bump();
  };

  // ----- replay loop -----
  useEffect(() => {
    if (!running || !trader || trader.setup.feed !== "replay" || !replay) return;
    const per = SPEEDS.find((s) => s.value === speed)!.perSec;
    const tickMs = per >= 20 ? 50 : 1000 / per;
    const batch = Math.max(1, Math.round((per * tickMs) / 1000));
    let saves = 0;
    const id = setInterval(() => {
      const n = trader.ingest(replay, STEP_SEC[trader.setup.interval], undefined, batch);
      if (++saves % 10 === 0 || n === 0) persist(trader);
      if (n === 0) setRunning(false);
      bump();
    }, tickMs);
    return () => {
      clearInterval(id);
      persist(trader);
    };
  }, [running, speed, persist, trader, replay]);

  // ----- live polling loop -----
  useEffect(() => {
    if (!running || !trader || trader.setup.feed !== "live") return;
    let alive = true;
    const poll = async () => {
      try {
        const data = await fetchSet(trader.setup, LIVE_RANGE[trader.setup.interval]);
        if (!alive) return;
        const n = trader.ingest(data, STEP_SEC[trader.setup.interval], Date.now() / 1000);
        if (n) persist(trader);
        setLastPoll(Date.now());
        setError(null);
        bump();
      } catch (e) {
        if (alive) setError(`Feed problem: ${e instanceof Error ? e.message : e} — retrying`);
      }
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [running, persist, trader]);

  // ----- derived view data -----
  const eng = t?.engine;
  const keys = t?.setup.keys ?? [];
  const sym = chartSym && keys.includes(chartSym) ? chartSym : keys[0];
  const equityNow = eng ? eng.equity(eng.lastClose) : 0;
  const initial = t?.setup.cfg.initialEquity ?? cfg.initialEquity;
  const openPnl = eng ? Object.keys(eng.positions).reduce((s, k) => s + eng.openPnl(k), 0) : 0;
  const dayPnl = eng ? equityNow - eng.dayStartEquity : 0;
  const dayLimit = eng ? eng.dayStartEquity * (t?.setup.cfg.maxDailyLoss ?? 0) : 0;
  const wins = eng ? eng.trades.filter((x) => x.pnl > 0).length : 0;
  const remaining = t && t.setup.feed === "replay" && replay ? t.remaining(replay) : null;

  // charts refresh at most ~1.5x per second, however fast the replay runs
  const chartTick = useThrottle(t?.lastTs ?? 0, 700);
  const eqSeries = useMemo(
    () => [{ name: "Equity", color: "--series-1", points: eng ? [...eng.equityCurve] : [] }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartTick, t],
  );
  const chartData = useMemo(() => (sym && t ? { ...t.hist[sym] } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartTick, sym, t]);
  const tradeCount = eng?.trades.length ?? 0;
  const markers = useMemo<Marker[]>(() => {
    if (!eng || !sym) return [];
    const m: Marker[] = eng.trades.filter((x) => x.symbol === sym).flatMap((x) => {
      const dir = x.side === "LONG" ? 1 : -1;
      return [{ time: x.entryTime, dir, text: x.side === "LONG" ? "Buy" : "Sell" } as Marker, { time: x.exitTime, dir, text: "", exit: true } as Marker];
    });
    const p = eng.positions[sym];
    if (p) m.push({ time: p.entryTime, dir: p.direction as 1 | -1, text: p.direction > 0 ? "Buy" : "Sell" });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTick, sym, t]);

  const paperMonths = useMemo(() => (eng && eng.equityCurve.length ? monthlyStats(eng.equityCurve, eng.trades, initial) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartTick, t]);

  const tradesCopy = useMemo(() => (eng ? [...eng.trades] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tradeCount, t]);

  const isLive = t?.setup.feed === "live";

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paper trading</h1>
          <p className="text-sm text-ink-3">A simulated account that trades a strategy bar by bar — <b className="text-ink-2">no real orders are ever sent</b>. Your session is saved in this browser.</p>
        </div>
      </div>

      {!t ? (
        /* ================= setup ================= */
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card title="1 · Strategy">
              <StrategyPicker value={strat} onChange={setStrategy} custom={customDefs} />
            </Card>
            <Card title="2 · Instruments">
              {strat === "ratio" ? (
                <div className="grid grid-cols-2 gap-3">
                  <InstrumentSelect label="Leg A" value={legs[0]} onChange={(v) => setLegs([v, legs[1]])} />
                  <InstrumentSelect label="Leg B" value={legs[1]} onChange={(v) => setLegs([legs[0], v])} />
                </div>
              ) : (
                <InstrumentChips value={symbols} onChange={setSymbols} />
              )}
            </Card>
          </div>
          <div className="space-y-4">
            <Card title="3 · Price feed">
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    { v: "replay", title: "Replay history", text: "Fast-forward through past bars to watch the strategy trade. Great for learning." },
                    { v: "live", title: "Live market", text: "Trades new bars as they complete (free data may be delayed). Keep this tab open." },
                  ] as const).map((o) => (
                    <button key={o.v} onClick={() => setFeed(o.v)} aria-pressed={feed === o.v}
                      className={cx("rounded-lg border p-3 text-left", feed === o.v ? "border-accent bg-accent/10" : "border-line bg-surface-2 hover:border-ink-3")}>
                      <div className="text-sm font-semibold">{o.v === "live" ? "● " : "⟲ "}{o.title}</div>
                      <p className="mt-1 text-xs text-ink-3">{o.text}</p>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bar size">
                    <select className={inputCls} value={interval} onChange={(e) => setBarSize(e.target.value as PaperSetup["interval"])}>
                      <option value="5m">5 minutes</option>
                      <option value="15m">15 minutes</option>
                      <option value="1h">1 hour</option>
                      <option value="1d">1 day</option>
                    </select>
                  </Field>
                  {feed === "replay" && (
                    <Field label="Replay data">
                      <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value as "yahoo" | "synthetic")}>
                        <option value="yahoo">Real history (Yahoo)</option>
                        <option value="synthetic">Synthetic (test only)</option>
                      </select>
                    </Field>
                  )}
                </div>
                {feed === "live" && interval !== "1d" && (
                  <p className="text-[11px] text-ink-3">The app checks for newly completed bars every 30 seconds. If you close the tab, it catches up on missed bars when you return.</p>
                )}
              </div>
            </Card>
            <Card title="4 · Parameters & risk" actions={<button onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs font-medium text-accent hover:underline">{showAdvanced ? "Hide" : "Customise"}</button>}>
              {showAdvanced ? (
                <div className="space-y-5">
                  <ParamsEditor def={stratDef} params={withDefaults(strat, params[strat])} onChange={(p) => setParams({ ...params, [strat]: p })} />
                  {stratDef.exits && <p className="text-[11px] text-ink-3">{stratDef.name} uses its own take-profit, stop and time limit (above) instead of the stop distance and trailing settings below.</p>}
                  <RiskEditor cfg={cfg} onChange={setCfg} showPair={strat === "ratio"} />
                </div>
              ) : (
                <p className="text-xs text-ink-3">Defaults: {usd(cfg.initialEquity, 0)} balance, {(cfg.riskPerTrade * 100).toFixed(1)}% risk per trade, {cfg.stopAtrMult}× ATR trailing stop, {(cfg.maxDailyLoss * 100).toFixed(1)}% daily loss limit.</p>
              )}
            </Card>
            {error && <p className="rounded-lg bg-down/10 px-3 py-2 text-sm text-down" role="alert">{error}</p>}
            <Button variant="primary" onClick={start} disabled={!!busy} className="w-full py-3 text-base">
              {busy ? <Spinner label={busy} /> : "▶ Start paper trading"}
            </Button>
          </div>
        </div>
      ) : (
        /* ================= session ================= */
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
            <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", isLive ? "bg-up/15 text-up" : "bg-accent/15 text-accent")}>
              {isLive ? "● LIVE" : "⟲ REPLAY"}
            </span>
            <div className="min-w-0 text-sm">
              <span className="font-semibold">{t.def.name}</span>
              <span className="text-ink-3"> · {keys.map((k) => BY_ID[k].name).join(" + ")} · {t.setup.interval} bars</span>
            </div>
            <span className="num text-xs text-ink-3">
              Last bar {t.lastTs ? `${dateTime(t.lastTs)} UTC` : "—"}
              {isLive && lastPoll && ` · checked ${new Date(lastPoll).toLocaleTimeString()}`}
              {remaining != null && ` · ${remaining} bars left`}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {!isLive && <Segmented size="sm" value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s.value, label: s.label }))} label="Replay speed" />}
              {running ? (
                <Button onClick={() => setRunning(false)}>❚❚ Pause</Button>
              ) : (
                <Button variant="primary" onClick={resume} disabled={!!busy || remaining === 0}>{busy ? <Spinner label={busy} /> : "▶ Run"}</Button>
              )}
              {!isLive && !running && <Button onClick={stepOnce} disabled={!!busy || remaining === 0} title="Process one bar">Step ›</Button>}
              <Button variant="danger" onClick={reset}>End session</Button>
            </div>
          </div>
          {error && <p className="rounded-lg bg-down/10 px-3 py-2 text-sm text-down" role="alert">{error}</p>}
          {remaining === 0 && <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">Replay finished — all bars processed. Review the results below or end the session to start a new one.</p>}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="Equity" value={usd(equityNow)} tone={equityNow > initial ? "up" : equityNow < initial ? "down" : undefined} />
            <Stat label="Return" value={pct(equityNow / initial - 1, 2)} tone={equityNow > initial ? "up" : equityNow < initial ? "down" : undefined} />
            <Stat label="Balance (closed P&L)" value={usd(eng!.cash)} />
            <Stat label="Open P&L" value={usd(openPnl)} tone={openPnl > 0 ? "up" : openPnl < 0 ? "down" : undefined} />
            <Stat label="Closed trades" value={`${eng!.trades.length}`} hint={eng!.trades.length ? `${wins} winners` : undefined} />
            <Stat label="Win rate" value={eng!.trades.length ? `${((wins / eng!.trades.length) * 100).toFixed(0)}%` : "—"} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
              <Card
                title="Price & trades"
                subtitle="Sliding window the strategy sees · ▲ buy ▼ sell ● exit"
                actions={keys.length > 1 ? <Segmented size="sm" value={sym} onChange={setChartSym} options={keys.map((k) => ({ value: k, label: BY_ID[k].name }))} /> : undefined}
              >
                {chartData && chartData.t.length ? <CandleChart data={chartData} markers={markers} digits={BY_ID[sym].digits} height={340} /> : <Empty>Waiting for bars…</Empty>}
              </Card>
              <Card title="Equity" subtitle="Account value after each bar (USD)">
                {eqSeries[0].points.length ? <LineChart series={eqSeries} height={220} baseline={initial} /> : <Empty>The equity curve starts with the first processed bar.</Empty>}
              </Card>
            </div>

            <div className="min-w-0 space-y-5">
              <Card title="Risk guard" subtitle="Daily loss kill-switch">
                {eng!.halted ? (
                  <p className="rounded-lg bg-down/10 px-3 py-2 text-sm font-medium text-down">⛔ Daily loss limit hit — trading halted until the next UTC day.</p>
                ) : (
                  <>
                    <div className="mb-1 flex justify-between text-xs text-ink-3">
                      <span>Today&apos;s P&amp;L <b className={cx("num", dayPnl >= 0 ? "text-up" : "text-down")}>{usd(dayPnl)}</b></span>
                      <span>Limit −{usd(dayLimit, 0)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-3" title="How much of today's loss allowance is used">
                      <div className={cx("h-full rounded-full", dayPnl < -dayLimit * 0.7 ? "bg-down" : "bg-warn")} style={{ width: `${dayLimit ? Math.min(100, Math.max(0, (-dayPnl / dayLimit) * 100)) : 0}%` }} />
                    </div>
                  </>
                )}
              </Card>

              <Card title="Next bar targets" subtitle="What the strategy wants after the latest bar">
                <ul className="space-y-1.5">
                  {keys.map((k) => (
                    <li key={k} className="flex items-center justify-between text-sm">
                      <span className="text-ink-2">{BY_ID[k].name}</span>
                      <SignalBadge dir={t.lastSignals[k] ?? 0} />
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title={`Open positions (${Object.keys(eng!.positions).length})`}>
                {Object.keys(eng!.positions).length === 0 ? (
                  <p className="text-sm text-ink-3">Flat — no open positions.</p>
                ) : (
                  <div className="-mx-4 overflow-x-auto">
                    <table className="num w-full min-w-[420px] text-xs">
                      <thead>
                        <tr className="border-b border-line text-left text-ink-3">
                          <th className="py-1.5 pl-4 font-medium">Instrument</th>
                          <th className="py-1.5 font-medium">Side</th>
                          <th className="py-1.5 text-right font-medium">Entry</th>
                          <th className="py-1.5 text-right font-medium">Stop</th>
                          <th className="py-1.5 pr-4 text-right font-medium">P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(eng!.positions).map(([k, p]) => {
                          const pnl = eng!.openPnl(k);
                          return (
                            <tr key={k} className="border-b border-line/60 last:border-0">
                              <td className="py-1.5 pl-4 font-medium">{BY_ID[k].name}<div className="text-[10px] text-ink-3">{p.lots} lots</div></td>
                              <td className={cx("py-1.5 font-semibold", p.direction > 0 ? "text-up" : "text-down")}>{p.direction > 0 ? "▲ Long" : "▼ Short"}</td>
                              <td className="py-1.5 text-right">{fmtPrice(k, p.entry)}</td>
                              <td className="py-1.5 text-right">{p.stop == null ? "—" : fmtPrice(k, p.stop)}</td>
                              <td className={cx("py-1.5 pr-4 text-right font-semibold", pnl >= 0 ? "text-up" : "text-down")}>{usd(pnl)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          </div>

          {paperMonths.length > 0 && <ReturnsCalendar months={paperMonths} fileName="paper_returns" />}

          <Card
            title={<Segmented size="sm" value={tab} onChange={setTab} options={[{ value: "log", label: "Event log" }, { value: "trades", label: `Trades (${eng!.trades.length})` }]} />}
            actions={
              <>
                <Button variant="ghost" className="text-xs" onClick={() => download("paper_trades.csv", toCsv(eng!.trades.map((x) => ({ ...x, entryTime: dateTime(x.entryTime), exitTime: dateTime(x.exitTime) }))))}>⤓ Trades CSV</Button>
                <Button variant="ghost" className="text-xs" onClick={() => download("paper_equity.csv", toCsv(eng!.equityCurve.map(([ts, v]) => ({ time: dateTime(ts), equity: v.toFixed(2) }))))}>⤓ Equity CSV</Button>
              </>
            }
          >
            {tab === "trades" ? (
              <TradesTable trades={tradesCopy} />
            ) : (
              <ul className="num max-h-80 space-y-0.5 overflow-auto rounded-lg bg-surface-2 p-3 text-[11px]">
                {eng!.log.length === 0 && <li className="text-ink-3">No events yet — press ▶ Run.</li>}
                {[...eng!.log].reverse().slice(0, 300).map((l, i) => (
                  <li key={i} className={cx(l.kind === "open" && "text-accent", l.kind === "close" && "text-ink", l.kind === "warn" && "text-warn", l.kind === "info" && "text-ink-3")}>
                    <span className="text-ink-3">{dateTime(l.t)}</span>  {l.msg}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

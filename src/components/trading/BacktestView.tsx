"use client";

import { useEffect, useMemo, useState } from "react";
import { drawdownCurve, runBacktest, type BacktestResult } from "@/lib/backtest";
import { download, parseCsv, toCsv } from "@/lib/csv";
import { DEFAULT_CONFIG, type EngineConfig } from "@/lib/engine";
import { date, dateTime, num, pct, usd } from "@/lib/format";
import { BY_ID } from "@/lib/instruments";
import { useLocalStorage } from "@/lib/hooks";
import { loadData, type Source } from "@/lib/loadData";
import { STRATEGIES, STRATEGY_LIST, type Params, type StrategyKey } from "@/lib/strategies";
import type { OHLC } from "@/lib/types";
import { CandleChart, LineChart, type Marker } from "../charts";
import { Button, Card, Empty, Field, Segmented, Spinner, cx, inputCls } from "../ui";
import { InstrumentChips, InstrumentSelect, KpiGrid, ParamsEditor, RiskEditor, StrategyPicker, TradesTable, readSymbolParam } from "./shared";

const RANGES: Record<"1h" | "1d", { value: string; label: string }[]> = {
  "1h": [
    { value: "3mo", label: "3 months" },
    { value: "6mo", label: "6 months" },
    { value: "1y", label: "1 year" },
    { value: "730d", label: "2 years (max)" },
  ],
  "1d": [
    { value: "2y", label: "2 years" },
    { value: "5y", label: "5 years" },
    { value: "10y", label: "10 years" },
  ],
};

const SERIES_VARS = ["--series-1", "--series-2", "--series-3", "--series-4"];

const defaultParams = () => Object.fromEntries(STRATEGY_LIST.map((s) => [s.key, { ...s.defaults }])) as Record<StrategyKey, Params>;

export function BacktestView() {
  const [strategy, setStrategy] = useLocalStorage<StrategyKey | "all">("bt.strategy", "trend");
  const [symbols, setSymbols] = useLocalStorage<string[]>("bt.symbols", ["XAUUSD", "XAGUSD"]);
  const [legs, setLegs] = useLocalStorage<[string, string]>("bt.legs", ["XAUUSD", "XAGUSD"]);
  const [source, setSource] = useLocalStorage<Source>("bt.source", "yahoo");
  const [interval, setBarSize] = useLocalStorage<"1h" | "1d">("bt.interval", "1h");
  const [range, setRange] = useLocalStorage("bt.range", "730d");
  const [params, setParams] = useLocalStorage<Record<StrategyKey, Params>>("bt.params", defaultParams());
  const [cfg, setCfg] = useLocalStorage<EngineConfig>("bt.cfg", DEFAULT_CONFIG);
  const [csvs, setCsvs] = useState<Record<string, OHLC>>({});
  const [csvNames, setCsvNames] = useState<Record<string, string>>({});
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [active, setActive] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // preset from the Markets page: /backtest?symbol=EURUSD
  useEffect(() => {
    const s = readSymbolParam();
    if (s) {
      setSymbols([s]);
      if (strategy === "ratio") setStrategy("trend");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsSingle = strategy !== "ratio";
  const needsPair = strategy === "ratio" || strategy === "all";
  const allKeys = useMemo(
    () => [...new Set([...(needsSingle ? symbols : []), ...(needsPair ? legs : [])])],
    [needsSingle, needsPair, symbols, legs],
  );
  const validRange = RANGES[interval].some((r) => r.value === range) ? range : RANGES[interval].at(-1)!.value;

  const run = async () => {
    setError(null);
    if (needsSingle && symbols.length === 0) return setError("Pick at least one instrument.");
    if (needsPair && legs[0] === legs[1]) return setError("The pair strategy needs two different instruments.");
    setRunning(true);
    try {
      const data = await loadData(source, allKeys, interval, validRange, csvs);
      await new Promise((r) => setTimeout(r, 20)); // let the spinner paint
      const keys: StrategyKey[] = strategy === "all" ? STRATEGY_LIST.map((s) => s.key) : [strategy];
      const out = keys.map((k) => runBacktest(k, params[k] ?? STRATEGIES[k].defaults, data, k === "ratio" ? legs : symbols, cfg));
      setResults(out);
      setActive(0);
      setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const onCsv = async (key: string, file: File | undefined) => {
    if (!file) return;
    try {
      const d = parseCsv(await file.text());
      setCsvs((c) => ({ ...c, [key]: d }));
      setCsvNames((c) => ({ ...c, [key]: `${file.name} · ${d.t.length} bars` }));
      setError(null);
    } catch (e) {
      setError(`${file.name}: ${e instanceof Error ? e.message : e}`);
    }
  };

  const editKey: StrategyKey = strategy === "all" ? "trend" : strategy;
  const [paramTab, setParamTab] = useState<StrategyKey>(editKey);
  const paramKey = strategy === "all" ? paramTab : strategy;
  const res = results[active];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Backtest</h1>
        <p className="text-sm text-ink-3">
          Test a strategy on history. Signals on bar <i>t</i> fill at the open of bar <i>t+1</i>; spread and commission are charged.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
        {/* ---------- settings ---------- */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
          <Card title="1 · Strategy">
            <StrategyPicker value={strategy} onChange={setStrategy} allowAll />
          </Card>

          <Card title="2 · Instruments">
            {needsSingle && (
              <div className={cx(needsPair && "mb-4")}>
                {strategy === "all" && <p className="mb-2 text-xs font-medium text-ink-2">Trend, Breakout &amp; Mean reversion trade:</p>}
                <InstrumentChips value={symbols} onChange={setSymbols} />
              </div>
            )}
            {needsPair && (
              <div>
                {strategy === "all" && <p className="mb-2 text-xs font-medium text-ink-2">Pair ratio trades:</p>}
                <div className="grid grid-cols-2 gap-3">
                  <InstrumentSelect label="Leg A (e.g. Gold)" value={legs[0]} onChange={(v) => setLegs([v, legs[1]])} />
                  <InstrumentSelect label="Leg B (e.g. Silver)" value={legs[1]} onChange={(v) => setLegs([legs[0], v])} />
                </div>
                <p className="mt-2 text-[11px] text-ink-3">Shorts the rich leg and buys the cheap one when log(A/B) is stretched.</p>
              </div>
            )}
          </Card>

          <Card title="3 · Data">
            <div className="space-y-3">
              <Segmented
                value={source}
                onChange={setSource}
                options={[
                  { value: "yahoo", label: "Live history", title: "Free Yahoo Finance history" },
                  { value: "synthetic", label: "Synthetic", title: "Fake data to test the code" },
                  { value: "csv", label: "Upload CSV", title: "Your own broker / MT5 export" },
                ]}
                label="Data source"
              />
              {source !== "csv" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bar size">
                    <select className={inputCls} value={interval} onChange={(e) => setBarSize(e.target.value as "1h" | "1d")}>
                      <option value="1h">1 hour (H1)</option>
                      <option value="1d">1 day (D1)</option>
                    </select>
                  </Field>
                  {source === "yahoo" && (
                    <Field label="Period">
                      <select className={inputCls} value={validRange} onChange={(e) => setRange(e.target.value)}>
                        {RANGES[interval].map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </Field>
                  )}
                </div>
              )}
              {source === "synthetic" && (
                <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">⚠ Synthetic data only proves the code works — results on it mean nothing.</p>
              )}
              {source === "yahoo" && (
                <p className="text-[11px] text-ink-3">Free data, may be delayed. Metals use COMEX/NYMEX futures as a spot proxy. Hourly history is limited to ~2 years.</p>
              )}
              {source === "csv" && (
                <div className="space-y-2">
                  <p className="text-[11px] text-ink-3">Columns: Date/Datetime (UTC) + Open, High, Low, Close. MT5 exports work as-is.</p>
                  {allKeys.map((k) => (
                    <label key={k} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-xs">
                      <span className="font-medium text-ink">{BY_ID[k].name}</span>
                      <span className="truncate text-ink-3">{csvNames[k] ?? "Choose file…"}</span>
                      <input type="file" accept=".csv,.txt" className="sr-only" onChange={(e) => onCsv(k, e.target.files?.[0])} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card
            title="4 · Parameters & risk"
            actions={<button onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs font-medium text-accent hover:underline">{showAdvanced ? "Hide" : "Customise"}</button>}
          >
            {!showAdvanced ? (
              <p className="text-xs text-ink-3">
                Using defaults from the strategy guide: risk {(cfg.riskPerTrade * 100).toFixed(1)}% per trade, stop {cfg.stopAtrMult}× ATR,
                daily loss limit {(cfg.maxDailyLoss * 100).toFixed(1)}%, starting balance {usd(cfg.initialEquity, 0)}.
              </p>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Strategy parameters</h3>
                  </div>
                  {strategy === "all" && (
                    <div className="mb-3">
                      <Segmented size="sm" value={paramTab} onChange={setParamTab} options={STRATEGY_LIST.map((s) => ({ value: s.key, label: s.name.split(" ")[0] }))} />
                    </div>
                  )}
                  <ParamsEditor def={STRATEGIES[paramKey]} params={params[paramKey] ?? STRATEGIES[paramKey].defaults} onChange={(p) => setParams({ ...params, [paramKey]: p })} />
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Risk engine</h3>
                  <RiskEditor cfg={cfg} onChange={setCfg} showPair={needsPair} />
                  <button onClick={() => setCfg(DEFAULT_CONFIG)} className="mt-2 text-xs text-accent hover:underline">Reset risk settings</button>
                </div>
              </div>
            )}
          </Card>

          <div className="space-y-2">
            {error && <p className="rounded-lg bg-down/10 px-3 py-2 text-sm text-down" role="alert">{error}</p>}
            <Button variant="primary" onClick={run} disabled={running} className="w-full py-3 text-base">
              {running ? <Spinner label="Running backtest" /> : "▶ Run backtest"}
            </Button>
          </div>
        </div>

        {/* ---------- results ---------- */}
        <div id="results" className="min-w-0 scroll-mt-20 space-y-5">
          {!res ? (
            <Card title="Results">
              <Empty>
                <p className="mb-1 font-medium text-ink-2">No backtest yet</p>
                Choose a strategy, instruments and data on the left, then press <b>Run backtest</b>.
                <br />Tip: &ldquo;Compare all 4&rdquo; ranks every strategy on the same data.
              </Empty>
            </Card>
          ) : (
            <>
              {results.length > 1 && <Comparison results={results} active={active} setActive={setActive} initial={cfg.initialEquity} />}
              <ResultDetail key={`${res.strategy}-${res.stats.end}-${res.trades.length}`} res={res} initial={cfg.initialEquity} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Comparison({ results, active, setActive, initial }: { results: BacktestResult[]; active: number; setActive: (i: number) => void; initial: number }) {
  const best = results.reduce((b, r, i) => (r.stats.sharpe > results[b].stats.sharpe ? i : b), 0);
  const series = useMemo(() => results.map((r, i) => ({ name: r.name, color: SERIES_VARS[i], points: r.equity })), [results]);
  return (
    <Card title="Strategy comparison" subtitle="Same data and risk settings for each strategy · click a row for details">
      <LineChart series={series} height={240} baseline={initial} />
      <div className="-mx-4 mt-4 overflow-x-auto">
        <table className="num w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="py-2 pl-4 font-medium">Strategy</th>
              <th className="py-2 text-right font-medium">Return</th>
              <th className="py-2 text-right font-medium">CAGR</th>
              <th className="py-2 text-right font-medium">Sharpe</th>
              <th className="py-2 text-right font-medium">Max DD</th>
              <th className="py-2 text-right font-medium">Win rate</th>
              <th className="py-2 text-right font-medium">PF</th>
              <th className="py-2 pr-4 text-right font-medium">Trades</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.strategy} onClick={() => setActive(i)} className={cx("cursor-pointer border-b border-line/60 last:border-0", i === active ? "bg-accent/10" : "hover:bg-surface-2")}>
                <td className="py-2 pl-4 font-medium">
                  <span className="mr-2 inline-block h-2 w-3 rounded-sm" style={{ background: `var(${SERIES_VARS[i]})` }} />
                  {r.name}
                  {i === best && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">Best Sharpe</span>}
                </td>
                <td className={cx("py-2 text-right", r.stats.totalReturn >= 0 ? "text-up" : "text-down")}>{pct(r.stats.totalReturn)}</td>
                <td className="py-2 text-right">{pct(r.stats.cagr)}</td>
                <td className="py-2 text-right">{num(r.stats.sharpe)}</td>
                <td className="py-2 text-right">{pct(r.stats.maxDrawdown)}</td>
                <td className="py-2 text-right">{Number.isNaN(r.stats.winRate) ? "—" : `${(r.stats.winRate * 100).toFixed(0)}%`}</td>
                <td className="py-2 text-right">{num(r.stats.profitFactor)}</td>
                <td className="py-2 pr-4 text-right">{r.stats.trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          variant="ghost"
          className="text-xs"
          onClick={() => download("summary.csv", toCsv(results.map((r) => ({ strategy: r.name, ...r.stats, start: date(r.stats.start), end: date(r.stats.end) }))))}
        >
          ⤓ Download summary.csv
        </Button>
      </div>
    </Card>
  );
}

function ResultDetail({ res, initial }: { res: BacktestResult; initial: number }) {
  const [sym, setSym] = useState(res.keys[0]);
  const [tab, setTab] = useState<"trades" | "log">("trades");
  const dd = useMemo(() => drawdownCurve(res.equity), [res]);
  const markers = useMemo<Marker[]>(
    () => res.trades.filter((t) => t.symbol === sym).flatMap((t) => {
      const dir = t.side === "LONG" ? 1 : -1;
      return [
        { time: t.entryTime, dir, text: t.side === "LONG" ? "Buy" : "Sell" } as Marker,
        { time: t.exitTime, dir, text: "", exit: true } as Marker,
      ];
    }),
    [res, sym],
  );
  const s = res.stats;
  const eqSeries = useMemo(() => [{ name: "Equity", color: "--series-1", points: res.equity }], [res]);
  const ddSeries = useMemo(() => [{ name: "Drawdown", color: "--series-2", points: dd }], [dd]);

  return (
    <>
      <Card
        title={`${res.name} · ${res.keys.map((k) => BY_ID[k].name).join(" + ")}`}
        subtitle={`${date(s.start)} → ${date(s.end)} · ${res.description}`}
      >
        <KpiGrid s={s} initial={initial} />
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
          <span>Sortino <b className="num text-ink-2">{num(s.sortino)}</b></span>
          <span>Calmar <b className="num text-ink-2">{num(s.calmar)}</b></span>
          <span>Avg win <b className="num text-ink-2">{usd(s.avgWin)}</b></span>
          <span>Avg loss <b className="num text-ink-2">{usd(s.avgLoss)}</b></span>
          <span>Expectancy <b className="num text-ink-2">{usd(s.expectancy)}</b>/trade</span>
          <span>Avg R <b className="num text-ink-2">{num(s.avgR)}</b></span>
          <span>Stops hit <b className="num text-ink-2">{s.stops}</b></span>
          <span>Max losing streak <b className="num text-ink-2">{s.maxConsecLosses}</b></span>
        </div>
      </Card>

      <div className="grid gap-5 2xl:grid-cols-2">
        <Card title="Equity curve" subtitle="Account value after every bar (USD)">
          <LineChart series={eqSeries} height={240} baseline={initial} />
        </Card>
        <Card title="Drawdown" subtitle="Fall from the running peak">
          <LineChart series={ddSeries} height={240} format="pct" />
        </Card>
      </div>

      <Card
        title="Trades on the chart"
        subtitle="▲ buy / ▼ sell at entry · ● exit. Scroll or pinch to zoom."
        actions={res.keys.length > 1 ? <Segmented size="sm" value={sym} onChange={setSym} options={res.keys.map((k) => ({ value: k, label: BY_ID[k].name }))} /> : undefined}
      >
        <CandleChart data={res.data[sym]} markers={markers} digits={BY_ID[sym].digits} height={360} />
      </Card>

      <Card
        title={<Segmented size="sm" value={tab} onChange={setTab} options={[{ value: "trades", label: `Trades (${res.trades.length})` }, { value: "log", label: "Event log" }]} />}
        actions={
          <>
            <Button variant="ghost" className="text-xs" onClick={() => download(`trades_${res.strategy}.csv`, toCsv(res.trades.map((t) => ({ ...t, entryTime: dateTime(t.entryTime), exitTime: dateTime(t.exitTime) }))))}>⤓ Trades CSV</Button>
            <Button variant="ghost" className="text-xs" onClick={() => download(`equity_${res.strategy}.csv`, toCsv(res.equity.map(([t, v]) => ({ time: dateTime(t), equity: v.toFixed(2) }))))}>⤓ Equity CSV</Button>
          </>
        }
      >
        {tab === "trades" ? (
          <TradesTable trades={res.trades} />
        ) : (
          <pre className="num max-h-96 overflow-auto rounded-lg bg-surface-2 p-3 text-[11px] leading-relaxed text-ink-2">
            {res.log.slice(-500).map((l) => `${dateTime(l.t)}  ${l.msg}`).join("\n") || "No events."}
          </pre>
        )}
      </Card>
    </>
  );
}

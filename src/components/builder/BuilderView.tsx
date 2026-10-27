"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { runBacktest, type BacktestResult } from "@/lib/backtest";
import {
  OPS, SOURCES, TEMPLATES, compileCustom, describeCustom, fromTemplate, newId, validateCustom,
  type Condition, type CustomStrategy, type Op, type Operand, type Side, type Source,
} from "@/lib/custom";
import { download } from "@/lib/csv";
import { DEFAULT_CONFIG } from "@/lib/engine";
import { fetchHistory } from "@/lib/hooks";
import { BY_ID } from "@/lib/instruments";
import { useCustomStrategies } from "@/lib/useCustom";
import { Button, Card, Field, Segmented, Spinner, cx, inputCls } from "../ui";
import { InstrumentSelect, KpiGrid, readParam } from "../trading/shared";

// compact inputs for rule rows (the shared input style is full-width)
const compact = inputCls.replace("w-full ", "");

const GROUPS = [...new Set(Object.values(SOURCES).map((s) => s.group))];

function OperandEditor({ value, onChange, allowNumber }: { value: Operand; onChange: (o: Operand) => void; allowNumber: boolean }) {
  const meta = SOURCES[value.src];
  const setSrc = (src: Source) => {
    const m = SOURCES[src];
    onChange({ src, ...(m.n != null ? { n: m.n } : {}), ...(m.k != null ? { k: m.k } : {}), ...(src === "number" ? { value: 50 } : {}) });
  };
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <select value={value.src} onChange={(e) => setSrc(e.target.value as Source)} className={cx(compact, "py-1.5 pr-7")} title={meta.help}>
        {GROUPS.filter((g) => allowNumber || g !== "Value").map((g) => (
          <optgroup key={g} label={g}>
            {(Object.keys(SOURCES) as Source[]).filter((s) => SOURCES[s].group === g).map((s) => (
              <option key={s} value={s}>{SOURCES[s].label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {value.src === "number" && (
        <input type="number" step="any" value={value.value ?? 0} onChange={(e) => onChange({ ...value, value: Number(e.target.value) })} className={cx(compact, "w-24 py-1.5")} aria-label="Value" />
      )}
      {meta.n != null && (
        <label className="flex items-center gap-1 text-xs text-ink-3">
          period
          <input type="number" min={1} max={1000} value={value.n ?? meta.n} onChange={(e) => onChange({ ...value, n: Math.max(1, Math.round(Number(e.target.value))) })} className={cx(compact, "w-20 py-1.5")} />
        </label>
      )}
      {meta.k != null && (
        <label className="flex items-center gap-1 text-xs text-ink-3">
          σ
          <input type="number" min={0.1} max={10} step={0.1} value={value.k ?? meta.k} onChange={(e) => onChange({ ...value, k: Number(e.target.value) })} className={cx(compact, "w-16 py-1.5")} />
        </label>
      )}
    </div>
  );
}

function ConditionRow({ c, onChange, onRemove, joiner, index }: { c: Condition; onChange: (c: Condition) => void; onRemove: () => void; joiner: "AND" | "OR"; index: number }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-surface-2 p-2">
      <span className="w-9 shrink-0 pt-2 text-center text-[11px] font-bold text-ink-3">{index === 0 ? "IF" : joiner}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <OperandEditor value={c.a} onChange={(a) => onChange({ ...c, a })} allowNumber={false} />
        <select value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as Op })} className={cx(compact, "py-1.5 font-semibold text-accent")}>
          {(Object.keys(OPS) as Op[]).map((o) => <option key={o} value={o}>{OPS[o]}</option>)}
        </select>
        <OperandEditor value={c.b} onChange={(b) => onChange({ ...c, b })} allowNumber />
      </div>
      <button onClick={onRemove} className="shrink-0 rounded-md px-2 py-1.5 text-ink-3 hover:bg-down/10 hover:text-down" aria-label="Remove condition" title="Remove">✕</button>
    </div>
  );
}

const blankCondition = (): Condition => ({ a: { src: "close" }, op: "gt", b: { src: "ema", n: 50 } });

function SideEditor({ title, tone, side, onChange }: { title: string; tone: "up" | "down"; side: Side; onChange: (s: Side) => void }) {
  const list = (key: "entry" | "exit", joiner: "AND" | "OR", heading: string, hint: string) => (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold text-ink-2">{heading}</h4>
        <span className="text-[11px] text-ink-3">{hint}</span>
      </div>
      <div className="space-y-1.5">
        {side[key].map((c, i) => (
          <ConditionRow
            key={i}
            index={i}
            c={c}
            joiner={joiner}
            onChange={(nc) => onChange({ ...side, [key]: side[key].map((x, j) => (j === i ? nc : x)) })}
            onRemove={() => onChange({ ...side, [key]: side[key].filter((_, j) => j !== i) })}
          />
        ))}
        <button onClick={() => onChange({ ...side, [key]: [...side[key], blankCondition()] })} className="rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-medium text-accent hover:border-accent">
          ＋ Add condition
        </button>
      </div>
    </div>
  );
  return (
    <Card
      title={<span className={tone === "up" ? "text-up" : "text-down"}>{tone === "up" ? "▲" : "▼"} {title}</span>}
      actions={
        <label className="flex items-center gap-2 text-xs font-medium text-ink-2">
          <input type="checkbox" checked={side.enabled} onChange={(e) => onChange({ ...side, enabled: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          {side.enabled ? "On" : "Off"}
        </label>
      }
    >
      {side.enabled ? (
        <div className="space-y-4">
          {list("entry", "AND", "Enter when ALL of these are true", "checked at each bar's close")}
          {list("exit", "OR", "Exit when ANY of these is true", "optional — stop / target below also exit")}
          {side.entry.length === 0 && <p className="text-xs text-warn">⚠ Add at least one entry condition, or this side never trades.</p>}
        </div>
      ) : (
        <p className="text-sm text-ink-3">This side is off — the strategy won&apos;t {tone === "up" ? "buy" : "sell short"}.</p>
      )}
    </Card>
  );
}

export function BuilderView() {
  const { list, setList, loaded } = useCustomStrategies();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomStrategy | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // quick test
  const [testSym, setTestSym] = useState("EURUSD");
  const [testIv, setTestIv] = useState<"1h" | "1d">("1h");
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<BacktestResult | null>(null);

  const saved = list.find((c) => c.id === selected) ?? null;
  const dirty = draft != null && (!saved || JSON.stringify({ ...draft, updatedAt: 0 }) !== JSON.stringify({ ...saved, updatedAt: 0 }));
  const summary = useMemo(() => (draft ? describeCustom(draft) : []), [draft]);

  // open ?id=... from the Backtest page, otherwise the most recent strategy
  useEffect(() => {
    if (!loaded || selected) return;
    const id = readParam("id");
    const pick = list.find((c) => c.id === id) ?? list[0];
    if (pick) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- choose the initial strategy once storage is loaded
      setSelected(pick.id);
      setDraft(structuredClone(pick));
    } else setShowTemplates(true);
  }, [loaded, list, selected]);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const open = (c: CustomStrategy) => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setSelected(c.id);
    setDraft(structuredClone(c));
    setShowTemplates(false);
    setTest(null);
  };

  const startFromTemplate = (i: number) => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    const c = fromTemplate(i);
    setSelected(c.id);
    setDraft(c);
    setShowTemplates(false);
    setTest(null);
  };

  const validate = (c: CustomStrategy): string | null => {
    if (!c.name.trim()) return "Give your strategy a name.";
    if (!c.long.enabled && !c.short.enabled) return "Turn on the Buy side, the Sell side, or both.";
    if ((c.long.enabled && !c.long.entry.length) || (c.short.enabled && !c.short.entry.length)) return "Every side that is on needs at least one entry condition.";
    if (!(c.exits.stopAtr > 0)) return "The stop loss must be greater than 0 (it also sizes each trade).";
    return null;
  };

  const save = (): boolean => {
    if (!draft) return false;
    const err = validate(draft);
    if (err) {
      flash("err", err);
      return false;
    }
    const next = { ...draft, updatedAt: Date.now() };
    setList(list.some((c) => c.id === next.id) ? list.map((c) => (c.id === next.id ? next : c)) : [next, ...list]);
    setDraft(next);
    flash("ok", `Saved "${next.name}". It now appears under My strategies on the Backtest and Paper Trade pages.`);
    return true;
  };

  const remove = () => {
    if (!draft || !confirm(`Delete "${draft.name}"? This can't be undone.`)) return;
    const rest = list.filter((c) => c.id !== draft.id);
    setList(rest);
    setSelected(rest[0]?.id ?? null);
    setDraft(rest[0] ? structuredClone(rest[0]) : null);
    if (!rest.length) setShowTemplates(true);
  };

  const duplicate = () => {
    if (!draft) return;
    const c = { ...structuredClone(draft), id: newId(), name: `${draft.name} (copy)`, updatedAt: Date.now() };
    setList([c, ...list]);
    setSelected(c.id);
    setDraft(c);
  };

  const exportJson = () => {
    if (!draft) return;
    download(`${draft.name.replace(/[^\w-]+/g, "_")}.json`, JSON.stringify(draft, null, 2), "application/json");
  };

  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const c = { ...validateCustom(JSON.parse(await file.text())), id: newId() };
      setList([c, ...list]);
      setSelected(c.id);
      setDraft(c);
      setShowTemplates(false);
      flash("ok", `Imported "${c.name}".`);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : String(e));
    }
  };

  const quickTest = async () => {
    if (!draft) return;
    const err = validate(draft);
    if (err) return flash("err", err);
    setTesting(true);
    setTest(null);
    try {
      const bars = await fetchHistory(testSym, testIv, testIv === "1h" ? "730d" : "10y");
      const res = runBacktest(compileCustom(draft), {}, { [testSym]: bars }, [testSym], DEFAULT_CONFIG);
      setTest(res);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  const go = (path: string) => {
    if (dirty && !save()) return;
    window.location.href = path;
  };

  const set = (patch: Partial<CustomStrategy>) => draft && setDraft({ ...draft, ...patch });
  const setExit = (patch: Partial<CustomStrategy["exits"]>) => draft && setDraft({ ...draft, exits: { ...draft.exits, ...patch } });

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Strategy Builder</h1>
          <p className="text-sm text-ink-3">Create your own strategy from indicators and rules — no coding. Saved strategies appear on the Backtest and Paper Trade pages.</p>
        </div>
        {msg && (
          <p role="status" className={cx("rounded-lg px-3 py-2 text-sm", msg.kind === "ok" ? "bg-up/10 text-up" : "bg-down/10 text-down")}>
            {msg.kind === "ok" ? "✓ " : "⚠ "}{msg.text}
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* ---------- my strategies ---------- */}
        <div className="space-y-3">
          <Button variant="primary" className="w-full" onClick={() => setShowTemplates(true)}>＋ New strategy</Button>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3">
            ⤒ Import from file
            <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { importJson(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <Card title={`My strategies (${list.length})`}>
            {!loaded ? (
              <Spinner />
            ) : list.length === 0 ? (
              <p className="text-sm text-ink-3">None yet — start from a template.</p>
            ) : (
              <ul className="-mx-2 space-y-1">
                {list.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => open(c)}
                      className={cx("w-full rounded-lg px-2 py-2 text-left", selected === c.id ? "bg-accent/15" : "hover:bg-surface-2")}
                    >
                      <div className={cx("truncate text-sm font-semibold", selected === c.id ? "text-accent" : "text-ink")}>{c.name}</div>
                      <div className="mt-0.5 flex gap-1 text-[10px] font-semibold">
                        {c.long.enabled && <span className="rounded bg-up/15 px-1.5 text-up">▲ BUY</span>}
                        {c.short.enabled && <span className="rounded bg-down/15 px-1.5 text-down">▼ SELL</span>}
                        <span className="font-normal text-ink-3">{new Date(c.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ---------- editor ---------- */}
        <div className="min-w-0 space-y-5">
          {showTemplates || !draft ? (
            <Card title="Start from a template" subtitle="Pick one, then change any rule. You can always start blank.">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {TEMPLATES.map((t, i) => (
                  <button key={t.name} onClick={() => startFromTemplate(i)} className="rounded-xl border border-line bg-surface-2 p-4 text-left transition-colors hover:border-accent">
                    <div className="font-semibold">{t.name}</div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-3">{t.about}</p>
                  </button>
                ))}
              </div>
              {draft && <button onClick={() => setShowTemplates(false)} className="mt-3 text-xs text-accent hover:underline">← Back to {draft.name}</button>}
            </Card>
          ) : (
            <>
              <Card
                title={dirty ? <span>Editing <span className="ml-1 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">UNSAVED</span></span> : "Editing"}
                actions={
                  <>
                    <Button variant="primary" onClick={save} disabled={!dirty}>💾 Save</Button>
                    <Button onClick={() => go(`/backtest?strategy=custom:${draft.id}`)} title="Save and open the full backtest">Backtest →</Button>
                    <Button onClick={() => go(`/paper`)} title="Save and open paper trading">Paper trade</Button>
                    <Button variant="ghost" onClick={duplicate} disabled={!saved}>Duplicate</Button>
                    <Button variant="ghost" onClick={exportJson}>⤓ Export</Button>
                    <Button variant="danger" onClick={remove} disabled={!saved}>Delete</Button>
                  </>
                }
              >
                <div className="grid gap-3 md:grid-cols-[1fr_1.4fr]">
                  <Field label="Name">
                    <input value={draft.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} maxLength={60} />
                  </Field>
                  <Field label="Notes (optional)">
                    <input value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={inputCls} placeholder="What is the idea behind it?" maxLength={200} />
                  </Field>
                </div>
                <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-accent">In plain English</div>
                  <ul className="space-y-0.5 text-sm text-ink-2">
                    {summary.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                </div>
              </Card>

              <div className="grid gap-5 2xl:grid-cols-2">
                <SideEditor title="Buy (long) rules" tone="up" side={draft.long} onChange={(long) => set({ long })} />
                <SideEditor title="Sell (short) rules" tone="down" side={draft.short} onChange={(short) => set({ short })} />
              </div>

              <Card title="Exits & risk" subtitle="ATR = the instrument's average bar size, so these adapt to any pair or timeframe">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Field label="Stop loss (× ATR)" help="Also sets the trade size: 1% of equity is risked to this stop">
                    <input type="number" min={0.25} step={0.25} value={draft.exits.stopAtr} onChange={(e) => setExit({ stopAtr: Number(e.target.value) })} className={inputCls} />
                  </Field>
                  <Field label="Take profit (× ATR)" help="0 = no fixed target">
                    <input type="number" min={0} step={0.25} value={draft.exits.targetAtr} onChange={(e) => setExit({ targetAtr: Number(e.target.value) })} className={inputCls} />
                  </Field>
                  <Field label="Time limit (bars)" help="Close after this many bars, 0 = no limit">
                    <input type="number" min={0} step={1} value={draft.exits.maxBars} onChange={(e) => setExit({ maxBars: Math.max(0, Math.round(Number(e.target.value))) })} className={inputCls} />
                  </Field>
                  <label className="flex items-end gap-2 pb-2 text-sm text-ink-2">
                    <input type="checkbox" checked={draft.exits.trailing} onChange={(e) => setExit({ trailing: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
                    Trailing stop
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-ink-3">Tip: a small take-profit with a wider stop raises the win rate but makes each loss bigger than each win.</p>
              </Card>

              <Card title="Quick test" subtitle="Run it on real history right here — open the Backtest page for charts, trades and the returns calendar">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-44"><InstrumentSelect label="Instrument" value={testSym} onChange={setTestSym} /></div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-ink-2">Bar size</span>
                    <Segmented label="Bar size" value={testIv} onChange={setTestIv} options={[{ value: "1h", label: "1 hour (2 yrs)" }, { value: "1d", label: "1 day (10 yrs)" }]} />
                  </div>
                  <Button variant="primary" onClick={quickTest} disabled={testing}>{testing ? <Spinner label="Testing" /> : "▶ Run quick test"}</Button>
                </div>
                {test && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm text-ink-2">
                      <b className="text-ink">{BY_ID[testSym].name}</b>, $10,000 start:{" "}
                      <b className={test.stats.totalReturn >= 0 ? "text-up" : "text-down"}>{test.stats.totalReturn >= 0 ? "profit" : "loss"} of {(Math.abs(test.stats.totalReturn) * 100).toFixed(1)}%</b>
                      {" "}over {Math.round((test.stats.end - test.stats.start) / 86400)} days.
                      {test.stats.trades === 0 && <span className="text-warn"> No trades — the entry rules never all came true. Try looser conditions.</span>}
                    </p>
                    <KpiGrid s={test.stats} initial={DEFAULT_CONFIG.initialEquity} />
                    <Link href={`/backtest?strategy=custom:${draft.id}&symbol=${testSym}`} onClick={(e) => { e.preventDefault(); go(`/backtest?strategy=custom:${draft.id}&symbol=${testSym}`); }} className="inline-block text-sm font-medium text-accent hover:underline">
                      Open full results →
                    </Link>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

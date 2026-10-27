"use client";

import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { OHLC } from "@/lib/types";

/** Read the current theme tokens so charts follow light/dark. */
function themeColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    surface: v("--surface"), ink2: v("--ink-2"), ink3: v("--ink-3"), grid: v("--surface-2"), border: v("--border"),
    up: v("--up"), down: v("--down"), accent: v("--accent"),
    series: [v("--series-1"), v("--series-2"), v("--series-3"), v("--series-4")],
  };
}

export function useThemeVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setV((x) => x + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return v;
}

function baseChart(el: HTMLElement, height: number) {
  const c = themeColors();
  return createChart(el, {
    height,
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: c.surface }, textColor: c.ink3, fontSize: 11, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: c.grid } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false },
    crosshair: { mode: CrosshairMode.Normal },
  });
}

const ts = (t: number) => t as UTCTimestamp;

export interface Overlay {
  name: string;
  values: number[];
  color: string; // css var name like "--series-2"
  dashed?: boolean;
}

export interface Marker {
  time: number;
  dir: 1 | -1;
  text: string;
  exit?: boolean;
}

// stable defaults so the chart isn't rebuilt on every parent render
const NO_OVERLAYS: Overlay[] = [];
const NO_MARKERS: Marker[] = [];

export function CandleChart({ data, overlays = NO_OVERLAYS, markers = NO_MARKERS, height = 380, digits = 5 }: {
  data: OHLC;
  overlays?: Overlay[];
  markers?: Marker[];
  height?: number;
  digits?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [hover, setHover] = useState<{ o: number; h: number; l: number; c: number; t: number; ov: (number | undefined)[] } | null>(null);
  const theme = useThemeVersion();

  useEffect(() => {
    if (!ref.current || !data.t.length) return;
    const c = themeColors();
    const chart = baseChart(ref.current, height);
    chartRef.current = chart;
    const fmt = { type: "price" as const, precision: digits, minMove: 1 / 10 ** digits };
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: c.up, downColor: c.down, borderVisible: false, wickUpColor: c.up, wickDownColor: c.down, priceFormat: fmt,
    });
    candles.setData(data.t.map((t, i) => ({ time: ts(t), open: data.o[i], high: data.h[i], low: data.l[i], close: data.c[i] })));

    const css = getComputedStyle(document.documentElement);
    const lines: ISeriesApi<"Line">[] = overlays.map((o) => {
      const s = chart.addSeries(LineSeries, {
        color: css.getPropertyValue(o.color).trim(), lineWidth: 2, priceLineVisible: false, lastValueVisible: false,
        lineStyle: o.dashed ? LineStyle.Dashed : LineStyle.Solid, crosshairMarkerVisible: false, priceFormat: fmt,
      });
      s.setData(data.t.map((t, i) => (Number.isFinite(o.values[i]) ? { time: ts(t), value: o.values[i] } : { time: ts(t) })));
      return s;
    });

    if (markers.length) {
      const ms: SeriesMarker<Time>[] = markers
        .filter((m) => m.time >= data.t[0])
        .sort((a, b) => a.time - b.time)
        .map((m) => ({
          time: ts(m.time),
          position: m.exit ? "inBar" : m.dir > 0 ? "belowBar" : "aboveBar",
          shape: m.exit ? "circle" : m.dir > 0 ? "arrowUp" : "arrowDown",
          color: m.exit ? c.ink3 : m.dir > 0 ? c.up : c.down,
          text: m.text,
          size: 1,
        }));
      createSeriesMarkers(candles, ms);
    }

    chart.subscribeCrosshairMove((p) => {
      if (!p.time) return setHover(null);
      const bar = p.seriesData.get(candles) as { open: number; high: number; low: number; close: number } | undefined;
      if (!bar) return setHover(null);
      setHover({
        t: p.time as number, o: bar.open, h: bar.high, l: bar.low, c: bar.close,
        ov: lines.map((l) => (p.seriesData.get(l) as { value?: number } | undefined)?.value),
      });
    });
    chart.timeScale().fitContent();
    if (data.t.length > 300) chart.timeScale().setVisibleLogicalRange({ from: data.t.length - 300, to: data.t.length + 5 });
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, overlays, markers, height, digits, theme]);

  const last = data.t.length - 1;
  const h = hover ?? (last >= 0 ? { t: data.t[last], o: data.o[last], h: data.h[last], l: data.l[last], c: data.c[last], ov: overlays.map((o) => o.values[last]) } : null);
  return (
    <div>
      {h && (
        <div className="num mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>{new Date(h.t * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
          <span>O <b className="font-medium text-ink">{h.o.toFixed(digits)}</b></span>
          <span>H <b className="font-medium text-ink">{h.h.toFixed(digits)}</b></span>
          <span>L <b className="font-medium text-ink">{h.l.toFixed(digits)}</b></span>
          <span>C <b className="font-medium text-ink">{h.c.toFixed(digits)}</b></span>
          {overlays.map((o, i) => (
            <span key={o.name} className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: `var(${o.color})` }} />
              {o.name} <b className="font-medium text-ink">{Number.isFinite(h.ov[i]) ? h.ov[i]!.toFixed(digits) : "—"}</b>
            </span>
          ))}
        </div>
      )}
      <div ref={ref} style={{ height }} className="w-full" />
    </div>
  );
}

export interface LineSpec {
  name: string;
  color: string; // css var name
  points: [number, number][];
}

/** Line / area chart for equity curves (one shared y-axis; one series = area, several = lines + legend). */
export function LineChart({ series, height = 260, format = "usd", baseline }: {
  series: LineSpec[];
  height?: number;
  format?: "usd" | "pct" | "num";
  baseline?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ t: number; vals: (number | undefined)[] } | null>(null);
  const theme = useThemeVersion();

  const fmt = (v: number) =>
    format === "usd" ? v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
      : format === "pct" ? `${(v * 100).toFixed(1)}%` : v.toFixed(2);

  useEffect(() => {
    if (!ref.current || !series.length) return;
    const chart = baseChart(ref.current, height);
    // let multi-year hourly curves (10k+ points) fit the width instead of clipping to the latest months
    chart.applyOptions({ timeScale: { minBarSpacing: 0.001 } });
    const css = getComputedStyle(document.documentElement);
    const priceFormat ={ type: "custom" as const, formatter: fmt, minMove: 0.0001 };
    const apis = series.map((s, i) => {
      const color = css.getPropertyValue(s.color).trim();
      const opts = { lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: series.length === 1, priceFormat };
      const api =
        series.length === 1
          ? chart.addSeries(AreaSeries, { ...opts, lineColor: color, topColor: color + "40", bottomColor: color + "05" })
          : chart.addSeries(LineSeries, { ...opts, color });
      // equity curves can contain duplicate timestamps when paper trading resumes; keep the last
      const pts = new Map<number, number>();
      for (const [t, v] of s.points) pts.set(t, v);
      api.setData([...pts].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ time: ts(t), value: v })));
      if (i === 0 && baseline != null) {
        api.createPriceLine({ price: baseline, color: css.getPropertyValue("--ink-3").trim(), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      }
      return api;
    });
    chart.subscribeCrosshairMove((p) => {
      if (!p.time) return setHover(null);
      setHover({ t: p.time as number, vals: apis.map((a) => (p.seriesData.get(a) as { value?: number } | undefined)?.value) });
    });
    chart.timeScale().fitContent();
    return () => chart.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, height, format, baseline, theme]);

  return (
    <div>
      <div className="num mb-2 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        {hover && <span>{new Date(hover.t * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC</span>}
        {series.map((s, i) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: `var(${s.color})` }} />
            <span className="text-ink-2">{s.name}</span>
            {hover && hover.vals[i] != null && <b className="font-medium text-ink">{fmt(hover.vals[i]!)}</b>}
          </span>
        ))}
      </div>
      <div ref={ref} style={{ height }} className="w-full" />
    </div>
  );
}

/** Tiny inline SVG trend line for watchlist rows. */
export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(" ");
  const up = values.at(-1)! >= values[0];
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <polyline points={pts} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

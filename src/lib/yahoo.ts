/**
 * Server-side Yahoo Finance access (free, delayed data; no API key).
 * Results are cached in memory so many browser tabs polling the app don't hammer Yahoo.
 */
import "server-only";
import { BY_ID } from "./instruments";
import { emptyOHLC, type OHLC, type Quote } from "./types";

const BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";
const HEADERS = { "User-Agent": "Mozilla/5.0 (forex-algo-web)" };

export type Interval = "1m" | "5m" | "15m" | "30m" | "1h" | "1d";

/** Longest history Yahoo allows per interval. */
export const MAX_RANGE: Record<Interval, string> = {
  "1m": "7d",
  "5m": "60d",
  "15m": "60d",
  "30m": "60d",
  "1h": "730d",
  "1d": "10y",
};

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

interface ChartResult {
  meta: {
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
    regularMarketTime?: number;
  };
  timestamp?: number[];
  indicators: { quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[] }[] };
}

async function chart(ticker: string, interval: string, range: string): Promise<ChartResult> {
  const url = `${BASE}${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Yahoo ${res.status} for ${ticker}`);
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(json?.chart?.error?.description ?? `No data for ${ticker}`);
  return r;
}

function toOHLC(r: ChartResult): OHLC {
  const d = emptyOHLC();
  const q = r.indicators.quote[0];
  (r.timestamp ?? []).forEach((t, i) => {
    const [o, h, l, c] = [q.open[i], q.high[i], q.low[i], q.close[i]];
    if (o == null || h == null || l == null || c == null) return;
    if (d.t.length && d.t.at(-1)! >= t) return;
    d.t.push(t);
    d.o.push(o);
    d.h.push(h);
    d.l.push(l);
    d.c.push(c);
  });
  return d;
}

export async function getHistory(id: string, interval: Interval, range?: string): Promise<OHLC> {
  const inst = BY_ID[id];
  if (!inst) throw new Error(`Unknown instrument ${id}`);
  const rg = range ?? MAX_RANGE[interval];
  const ttl = interval === "1d" ? 10 * 60_000 : interval === "1h" ? 60_000 : 20_000;
  return cached(`h:${id}:${interval}:${rg}`, ttl, async () => toOHLC(await chart(inst.yahoo, interval, rg)));
}

export async function getQuote(id: string): Promise<Quote> {
  const inst = BY_ID[id];
  return cached(`q:${id}`, 15_000, async () => {
    try {
      const r = await chart(inst.yahoo, "5m", "1d");
      const closes = r.indicators.quote[0].close.filter((v): v is number => v != null);
      const price = r.meta.regularMarketPrice ?? closes.at(-1) ?? null;
      const prev = r.meta.chartPreviousClose ?? r.meta.previousClose ?? null;
      const change = price != null && prev != null ? price - prev : null;
      return {
        id,
        price,
        prevClose: prev,
        change,
        changePct: change != null && prev ? (change / prev) * 100 : null,
        high: r.meta.regularMarketDayHigh ?? (closes.length ? Math.max(...closes) : null),
        low: r.meta.regularMarketDayLow ?? (closes.length ? Math.min(...closes) : null),
        time: r.meta.regularMarketTime ?? null,
        spark: closes.length > 60 ? closes.filter((_, i) => i % Math.ceil(closes.length / 60) === 0).concat(closes.at(-1)!) : closes,
      };
    } catch (e) {
      return { id, price: null, prevClose: null, change: null, changePct: null, high: null, low: null, time: null, spark: [], error: String(e) };
    }
  });
}

/** Run async jobs with limited concurrency. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

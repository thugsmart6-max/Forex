"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OHLC, Quote } from "./types";

/** useState persisted in localStorage (per browser). Falls back silently when storage is unavailable. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      if (raw != null) setValue(JSON.parse(raw));
    } catch {}
    loaded.current = true;
  }, [key]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock starts on the client only
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Returns `value`, but changes at most once every `ms` (always settles on the latest value). */
export function useThrottle<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  const last = useRef(0);
  useEffect(() => {
    const wait = Math.max(0, last.current + ms - Date.now());
    const id = setTimeout(() => {
      last.current = Date.now();
      setOut(value);
    }, wait);
    return () => clearTimeout(id);
  }, [value, ms]);
  return out;
}

export function useQuotes(refreshMs: number, paused: boolean) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/quotes", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: { quotes: Quote[]; at: number } = await res.json();
      setQuotes(Object.fromEntries(json.quotes.map((q) => [q.id, q])));
      setUpdatedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
    if (paused) return;
    const id = setInterval(load, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs, paused]);

  return { quotes, updatedAt, error, loading, reload: load };
}

export async function fetchHistory(id: string, interval: string, range?: string): Promise<OHLC> {
  const q = new URLSearchParams({ id, interval, ...(range ? { range } : {}) });
  const res = await fetch(`/api/history?${q}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  if (!json.bars.t.length) throw new Error(`No ${interval} data returned for ${id}`);
  return json.bars;
}

export function useHistory(id: string | null, interval: string, range?: string, refreshMs = 60_000) {
  const [data, setData] = useState<OHLC | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = async (first: boolean) => {
      if (first) setLoading(true);
      try {
        const d = await fetchHistory(id, interval, range);
        if (alive) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on symbol / interval change
    setData(null);
    load(true);
    const t = setInterval(() => load(false), refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, interval, range, refreshMs]);

  return { data, error, loading };
}

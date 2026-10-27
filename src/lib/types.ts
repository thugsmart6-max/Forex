/** Column-oriented OHLC bars. `t` is a UTC unix timestamp in seconds. */
export interface OHLC {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}

/** Market data keyed by instrument id, e.g. { XAUUSD: OHLC, XAGUSD: OHLC }. */
export type DataSet = Record<string, OHLC>;

export interface Quote {
  id: string;
  price: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
  time: number | null;
  spark: number[];
  error?: string;
}

export const emptyOHLC = (): OHLC => ({ t: [], o: [], h: [], l: [], c: [] });

export function sliceOHLC(d: OHLC, start: number, end?: number): OHLC {
  return {
    t: d.t.slice(start, end),
    o: d.o.slice(start, end),
    h: d.h.slice(start, end),
    l: d.l.slice(start, end),
    c: d.c.slice(start, end),
  };
}

/** Keep only timestamps present in every series (like data.align in Python). */
export function align(data: DataSet): DataSet {
  const keys = Object.keys(data);
  if (keys.length === 0) return {};
  let common = new Set(data[keys[0]].t);
  for (const k of keys.slice(1)) {
    const s = new Set(data[k].t);
    common = new Set([...common].filter((t) => s.has(t)));
  }
  const out: DataSet = {};
  for (const k of keys) {
    const d = data[k];
    const res = emptyOHLC();
    for (let i = 0; i < d.t.length; i++) {
      if (!common.has(d.t[i])) continue;
      res.t.push(d.t[i]);
      res.o.push(d.o[i]);
      res.h.push(d.h[i]);
      res.l.push(d.l[i]);
      res.c.push(d.c[i]);
    }
    out[k] = res;
  }
  return out;
}

/**
 * CSV import/export.
 * Input: a Date / Datetime / Time / Timestamp column plus Open, High, Low, Close
 * (MT5 export, broker download ...). Times are treated as UTC.
 */
import { emptyOHLC, type OHLC } from "./types";

function parseTime(v: string): number {
  const s = v.trim().replace(/^"|"$/g, "");
  if (/^\d{9,13}$/.test(s)) {
    const n = Number(s);
    return n > 1e11 ? Math.floor(n / 1000) : n;
  }
  // MT5 style "2024.01.02 13:00" -> ISO
  let iso = s.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, "$1-$2-$3").replace(" ", "T");
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) iso += iso.includes("T") ? "Z" : "T00:00:00Z";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Cannot parse date "${v}"`);
  return Math.floor(ms / 1000);
}

export function parseCsv(text: string): OHLC {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("CSV is empty");
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, "").replace(/^<|>$/g, "").toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const ti = col(["date", "datetime", "time", "timestamp", "gmt time", "local time"]);
  const oi = col(["open"]);
  const hi = col(["high"]);
  const li = col(["low"]);
  const ci = col(["close"]);
  const missing = [["Date", ti], ["Open", oi], ["High", hi], ["Low", li], ["Close", ci]].filter(([, i]) => i === -1).map(([n]) => n);
  if (missing.length) throw new Error(`CSV is missing columns ${missing.join(", ")}; needs Date/Datetime, Open, High, Low, Close`);
  // MT5 exports split <DATE> and <TIME> into two columns
  const timeCol = header[ti] === "date" ? header.indexOf("time") : -1;

  const rows: [number, number, number, number, number][] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(sep);
    const ts = parseTime(timeCol > -1 ? `${f[ti]} ${f[timeCol]}` : f[ti]);
    const vals = [oi, hi, li, ci].map((i) => Number(f[i]));
    if (vals.some((v) => !Number.isFinite(v))) continue;
    rows.push([ts, vals[0], vals[1], vals[2], vals[3]]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  const d = emptyOHLC();
  for (const [t, o, h, l, c] of rows) {
    if (d.t.length && d.t.at(-1) === t) continue;
    d.t.push(t);
    d.o.push(o);
    d.h.push(h);
    d.l.push(l);
    d.c.push(c);
  }
  return d;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function download(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

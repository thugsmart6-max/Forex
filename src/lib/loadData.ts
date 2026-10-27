"use client";

import { fetchHistory } from "./hooks";
import { synthetic } from "./synthetic";
import type { DataSet, OHLC } from "./types";

export type Source = "yahoo" | "synthetic" | "csv";

/** Load bars for every key from the chosen source. */
export async function loadData(
  source: Source,
  keys: string[],
  interval: "1h" | "1d",
  range: string,
  csvs: Record<string, OHLC>,
): Promise<DataSet> {
  if (source === "synthetic") return synthetic(keys, interval);
  if (source === "csv") {
    const missing = keys.filter((k) => !csvs[k]);
    if (missing.length) throw new Error(`Upload a CSV for ${missing.join(", ")}`);
    return Object.fromEntries(keys.map((k) => [k, csvs[k]]));
  }
  const entries = await Promise.all(keys.map(async (k) => [k, await fetchHistory(k, interval, range)] as const));
  return Object.fromEntries(entries);
}

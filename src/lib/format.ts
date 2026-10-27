export const usd = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export const pct = (v: number | null | undefined, digits = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;

export const num = (v: number | null | undefined, digits = 2) =>
  v == null || Number.isNaN(v) ? "—" : v === Infinity ? "∞" : v.toFixed(digits);

export const dateTime = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ");

export const date = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

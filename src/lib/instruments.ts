/**
 * Instrument catalogue + contract specifications (forex only).
 *
 * Values are typical defaults - CHECK THEM against your broker before relying on results.
 *   contractSize : units per 1 lot (P&L per 1.0 price move per lot, in the QUOTE currency)
 *   lotStep      : smallest increment of lots
 *   spread       : assumed round-trip cost in price units (half is paid on each side)
 *   commission   : cost per lot per side, in USD
 *   quote        : "USD" when P&L is already in USD (EURUSD, XAUUSD ...);
 *                  "BASE_USD" when USD is the base (USDJPY ...) -> P&L / price converts to USD
 *
 * Only instruments with a `spec` can be backtested / paper traded (account currency is USD).
 * The rest (crosses, INR crosses, currency indices) are watch-only.
 */

export type Category = "majors" | "crosses" | "metals" | "asia" | "indices";

export interface Spec {
  contractSize: number;
  lotStep: number;
  minLot: number;
  spread: number;
  commission: number;
  quote: "USD" | "BASE_USD";
}

export interface Instrument {
  id: string; // short key used everywhere in the app, e.g. "EURUSD"
  name: string; // display name, e.g. "EUR/USD"
  yahoo: string; // Yahoo Finance ticker
  category: Category;
  digits: number; // price decimals to display
  desc: string;
  spec?: Spec;
}

const fx = (spread: number, quote: Spec["quote"] = "USD"): Spec => ({
  contractSize: 100_000,
  lotStep: 0.01,
  minLot: 0.01,
  spread,
  commission: 3.5,
  quote,
});

export const INSTRUMENTS: Instrument[] = [
  // Majors
  { id: "EURUSD", name: "EUR/USD", yahoo: "EURUSD=X", category: "majors", digits: 5, desc: "Euro vs US Dollar", spec: fx(0.00012) },
  { id: "GBPUSD", name: "GBP/USD", yahoo: "GBPUSD=X", category: "majors", digits: 5, desc: "British Pound vs US Dollar", spec: fx(0.00015) },
  { id: "USDJPY", name: "USD/JPY", yahoo: "USDJPY=X", category: "majors", digits: 3, desc: "US Dollar vs Japanese Yen", spec: fx(0.015, "BASE_USD") },
  { id: "USDCHF", name: "USD/CHF", yahoo: "USDCHF=X", category: "majors", digits: 5, desc: "US Dollar vs Swiss Franc", spec: fx(0.00018, "BASE_USD") },
  { id: "AUDUSD", name: "AUD/USD", yahoo: "AUDUSD=X", category: "majors", digits: 5, desc: "Australian Dollar vs US Dollar", spec: fx(0.00015) },
  { id: "USDCAD", name: "USD/CAD", yahoo: "USDCAD=X", category: "majors", digits: 5, desc: "US Dollar vs Canadian Dollar", spec: fx(0.0002, "BASE_USD") },
  { id: "NZDUSD", name: "NZD/USD", yahoo: "NZDUSD=X", category: "majors", digits: 5, desc: "New Zealand Dollar vs US Dollar", spec: fx(0.0002) },

  // Crosses (watch-only: P&L would need a second conversion rate)
  { id: "EURGBP", name: "EUR/GBP", yahoo: "EURGBP=X", category: "crosses", digits: 5, desc: "Euro vs British Pound" },
  { id: "EURJPY", name: "EUR/JPY", yahoo: "EURJPY=X", category: "crosses", digits: 3, desc: "Euro vs Japanese Yen" },
  { id: "GBPJPY", name: "GBP/JPY", yahoo: "GBPJPY=X", category: "crosses", digits: 3, desc: "British Pound vs Japanese Yen" },
  { id: "EURCHF", name: "EUR/CHF", yahoo: "EURCHF=X", category: "crosses", digits: 5, desc: "Euro vs Swiss Franc" },
  { id: "EURAUD", name: "EUR/AUD", yahoo: "EURAUD=X", category: "crosses", digits: 5, desc: "Euro vs Australian Dollar" },
  { id: "EURCAD", name: "EUR/CAD", yahoo: "EURCAD=X", category: "crosses", digits: 5, desc: "Euro vs Canadian Dollar" },
  { id: "GBPCHF", name: "GBP/CHF", yahoo: "GBPCHF=X", category: "crosses", digits: 5, desc: "British Pound vs Swiss Franc" },
  { id: "AUDJPY", name: "AUD/JPY", yahoo: "AUDJPY=X", category: "crosses", digits: 3, desc: "Australian Dollar vs Japanese Yen" },
  { id: "CADJPY", name: "CAD/JPY", yahoo: "CADJPY=X", category: "crosses", digits: 3, desc: "Canadian Dollar vs Japanese Yen" },
  { id: "AUDNZD", name: "AUD/NZD", yahoo: "AUDNZD=X", category: "crosses", digits: 5, desc: "Australian vs New Zealand Dollar" },

  // Metals (Yahoo free data = COMEX/NYMEX futures as a proxy for spot)
  { id: "XAUUSD", name: "XAU/USD", yahoo: "GC=F", category: "metals", digits: 2, desc: "Gold (COMEX futures proxy) · 1 lot = 100 oz",
    spec: { contractSize: 100, lotStep: 0.01, minLot: 0.01, spread: 0.3, commission: 3.5, quote: "USD" } },
  { id: "XAGUSD", name: "XAG/USD", yahoo: "SI=F", category: "metals", digits: 3, desc: "Silver (COMEX futures proxy) · 1 lot = 5000 oz",
    spec: { contractSize: 5000, lotStep: 0.01, minLot: 0.01, spread: 0.03, commission: 3.5, quote: "USD" } },
  { id: "XPTUSD", name: "XPT/USD", yahoo: "PL=F", category: "metals", digits: 2, desc: "Platinum (NYMEX futures proxy) · 1 lot = 50 oz",
    spec: { contractSize: 50, lotStep: 0.01, minLot: 0.01, spread: 2, commission: 3.5, quote: "USD" } },
  { id: "XPDUSD", name: "XPD/USD", yahoo: "PA=F", category: "metals", digits: 2, desc: "Palladium (NYMEX futures proxy) · 1 lot = 100 oz",
    spec: { contractSize: 100, lotStep: 0.01, minLot: 0.01, spread: 3, commission: 3.5, quote: "USD" } },

  // Asia, INR & exotics
  { id: "USDINR", name: "USD/INR", yahoo: "USDINR=X", category: "asia", digits: 4, desc: "US Dollar vs Indian Rupee", spec: fx(0.02, "BASE_USD") },
  { id: "EURINR", name: "EUR/INR", yahoo: "EURINR=X", category: "asia", digits: 4, desc: "Euro vs Indian Rupee" },
  { id: "GBPINR", name: "GBP/INR", yahoo: "GBPINR=X", category: "asia", digits: 4, desc: "British Pound vs Indian Rupee" },
  { id: "JPYINR", name: "JPY/INR", yahoo: "JPYINR=X", category: "asia", digits: 4, desc: "Japanese Yen vs Indian Rupee" },
  { id: "USDSGD", name: "USD/SGD", yahoo: "USDSGD=X", category: "asia", digits: 5, desc: "US Dollar vs Singapore Dollar", spec: fx(0.0003, "BASE_USD") },
  { id: "USDCNH", name: "USD/CNH", yahoo: "CNH=X", category: "asia", digits: 4, desc: "US Dollar vs Offshore Yuan", spec: fx(0.002, "BASE_USD") },
  { id: "USDHKD", name: "USD/HKD", yahoo: "USDHKD=X", category: "asia", digits: 4, desc: "US Dollar vs Hong Kong Dollar", spec: fx(0.002, "BASE_USD") },
  { id: "USDZAR", name: "USD/ZAR", yahoo: "USDZAR=X", category: "asia", digits: 4, desc: "US Dollar vs South African Rand", spec: fx(0.01, "BASE_USD") },
  { id: "USDMXN", name: "USD/MXN", yahoo: "USDMXN=X", category: "asia", digits: 4, desc: "US Dollar vs Mexican Peso", spec: fx(0.01, "BASE_USD") },
  { id: "USDTRY", name: "USD/TRY", yahoo: "USDTRY=X", category: "asia", digits: 4, desc: "US Dollar vs Turkish Lira", spec: fx(0.05, "BASE_USD") },

  // Currency indices
  { id: "DXY", name: "US Dollar Index", yahoo: "DX-Y.NYB", category: "indices", digits: 3, desc: "USD vs basket of 6 majors (ICE)" },
  { id: "XDE", name: "Euro Index", yahoo: "^XDE", category: "indices", digits: 3, desc: "PHLX Euro currency index" },
  { id: "XDB", name: "Pound Index", yahoo: "^XDB", category: "indices", digits: 3, desc: "PHLX British Pound currency index" },
  { id: "XDN", name: "Yen Index", yahoo: "^XDN", category: "indices", digits: 3, desc: "PHLX Japanese Yen currency index" },
  { id: "XDA", name: "Aussie Index", yahoo: "^XDA", category: "indices", digits: 3, desc: "PHLX Australian Dollar currency index" },
  { id: "XDC", name: "Loonie Index", yahoo: "^XDC", category: "indices", digits: 3, desc: "PHLX Canadian Dollar currency index" },
  { id: "XDS", name: "Swissie Index", yahoo: "^XDS", category: "indices", digits: 3, desc: "PHLX Swiss Franc currency index" },
  { id: "XDZ", name: "Kiwi Index", yahoo: "^XDZ", category: "indices", digits: 3, desc: "PHLX New Zealand Dollar currency index" },
];

export const CATEGORIES: { key: Category | "all" | "favorites"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "favorites", label: "★ Favorites" },
  { key: "majors", label: "Majors" },
  { key: "crosses", label: "Crosses" },
  { key: "metals", label: "Metals" },
  { key: "asia", label: "INR & Exotics" },
  { key: "indices", label: "Currency Indices" },
];

export const BY_ID: Record<string, Instrument> = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));

export const TRADABLE = INSTRUMENTS.filter((i) => i.spec);

/** Currency strength: which index represents which currency, and whether it is quoted inverted. */
export const STRENGTH_SOURCES: { ccy: string; id: string }[] = [
  { ccy: "USD", id: "DXY" },
  { ccy: "EUR", id: "XDE" },
  { ccy: "GBP", id: "XDB" },
  { ccy: "JPY", id: "XDN" },
  { ccy: "AUD", id: "XDA" },
  { ccy: "CAD", id: "XDC" },
  { ccy: "CHF", id: "XDS" },
  { ccy: "NZD", id: "XDZ" },
];

export function fmtPrice(id: string, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const d = BY_ID[id]?.digits ?? 4;
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Factor converting a quote-currency P&L into USD at price `px`. */
export function toUsd(spec: Spec, px: number): number {
  return spec.quote === "USD" ? 1 : 1 / px;
}

import type { Metadata } from "next";
import Link from "next/link";
import { TRADABLE } from "@/lib/instruments";
import { STRATEGY_LIST } from "@/lib/strategies";

export const metadata: Metadata = { title: "Guide · FX Algo Desk" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

const STEPS = [
  { n: 1, title: "Watch the market", text: "Open Markets, pick a pair and check the chart, session clock and live strategy signals.", href: "/" },
  { n: 2, title: "Backtest", text: "Run a strategy (or compare all 4) on up to 2 years of hourly history or your own CSV.", href: "/backtest" },
  { n: 3, title: "Paper trade", text: "Replay history or follow the live market with a simulated account — no real money.", href: "/paper" },
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Guide</h1>
        <p className="text-sm text-ink-3">How the strategies, risk engine and data work.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <Link key={s.n} href={s.href} className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/15 text-sm font-semibold text-accent">{s.n}</span>
            <h3 className="mt-2 font-semibold">{s.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">{s.text}</p>
          </Link>
        ))}
      </div>

      <Section title="The four strategies">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="py-2 pl-5 font-medium">Strategy</th>
                <th className="py-2 font-medium">Entry</th>
                <th className="py-2 pr-5 font-medium">Exit</th>
              </tr>
            </thead>
            <tbody>
              {STRATEGY_LIST.map((s) => (
                <tr key={s.key} className="border-b border-line/60 align-top last:border-0">
                  <td className="py-2.5 pl-5 font-semibold text-ink">{s.name}</td>
                  <td className="py-2.5 pr-4">{s.entry}</td>
                  <td className="py-2.5 pr-5">{s.exit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Every parameter can be changed under <b>Parameters &amp; risk → Customise</b> on the Backtest and Paper pages.</p>
      </Section>

      <Section title="Risk engine — same code in backtest and paper trading">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Signals on bar <i>t</i> fill at the <b>open of bar t+1</b> (no look-ahead); spread + commission charged.</li>
          <li>Size = 1% of equity ÷ (2 × ATR × contract size); leverage capped at 10×; rounded down to the lot step.</li>
          <li>Pair trades: fixed notional per leg (50% of equity each).</li>
          <li>ATR trailing stops; gaps through the stop fill at the open; no re-entry in the stopped direction until the signal changes.</li>
          <li><b>Daily loss kill-switch</b>: −3% from the day&apos;s start equity → flatten and stop for the day (UTC).</li>
          <li>Account currency is USD. For USD-base pairs (USD/JPY, USD/INR …) P&amp;L is converted at the current price.</li>
        </ul>
      </Section>

      <Section title="Contract specs — verify with your broker">
        <div className="-mx-5 overflow-x-auto">
          <table className="num w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b border-line text-left text-ink-3">
                <th className="py-2 pl-5 font-medium">Instrument</th>
                <th className="py-2 text-right font-medium">Units / lot</th>
                <th className="py-2 text-right font-medium">Lot step</th>
                <th className="py-2 text-right font-medium">Spread</th>
                <th className="py-2 pr-5 text-right font-medium">Commission / lot / side</th>
              </tr>
            </thead>
            <tbody>
              {TRADABLE.map((i) => (
                <tr key={i.id} className="border-b border-line/60 last:border-0">
                  <td className="py-1.5 pl-5 font-medium text-ink">{i.name}</td>
                  <td className="py-1.5 text-right">{i.spec!.contractSize.toLocaleString()}</td>
                  <td className="py-1.5 text-right">{i.spec!.lotStep}</td>
                  <td className="py-1.5 text-right">{i.spec!.spread}</td>
                  <td className="py-1.5 pr-5 text-right">${i.spec!.commission}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Data">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Live quotes &amp; history</b> come from Yahoo Finance (free, no key). They can be delayed; metals are COMEX/NYMEX futures, not spot.</li>
          <li><b>Currency indices</b>: US Dollar Index (DXY) and the PHLX Euro, Pound, Yen, Aussie, Loonie, Swissie and Kiwi indices power the currency-strength meter.</li>
          <li><b>CSV upload</b>: a Date/Datetime column plus Open, High, Low, Close (MT5 export, broker download). Times should be UTC for the breakout session filter.</li>
          <li><b>Synthetic data</b> only proves the code works — results on it mean nothing.</li>
        </ul>
      </Section>

      <Section title="Known limits">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Not modelled: overnight swaps, slippage beyond the spread.</li>
          <li>The paper trader recomputes signals on a sliding window (600 bars), which can differ slightly from a full-history backtest.</li>
          <li>Paper sessions are stored in this browser (localStorage). Live paper trading only advances while the page is open; it catches up on missed bars when reopened.</li>
        </ul>
      </Section>

      <Section title="Suggested next steps">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Backtest each strategy on 2+ years of real H1 data.</li>
          <li>Walk-forward test (optimise on one period, test on the next) before trusting any parameter set.</li>
          <li>Paper trade for 2–3 months; compare paper results with the backtest.</li>
          <li>Only then consider connecting a broker you are legally allowed to use.</li>
        </ol>
      </Section>

      <aside className="rounded-xl border border-warn/40 bg-warn/10 p-5 text-sm leading-relaxed text-ink-2">
        <h2 className="mb-2 font-semibold text-warn">⚠ Legal note (India)</h2>
        Indian residents may not trade XAU/USD, XAG/USD or other non-INR forex pairs on offshore forex platforms (FEMA / RBI Alert List),
        and LRS cannot fund margin trading abroad. Exchange-traded INR currency derivatives (e.g. USD/INR on NSE/BSE via a SEBI-registered broker)
        are the permitted route. Only trade with a broker you are legally entitled to use.
        <p className="mt-2 italic">Educational research tool. Not financial advice. Trading leveraged products can lose more than your deposit.</p>
      </aside>
    </div>
  );
}

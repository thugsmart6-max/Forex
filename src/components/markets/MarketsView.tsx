"use client";

import { useState } from "react";
import { DetailPanel } from "./DetailPanel";
import { Watchlist } from "./Watchlist";
import { PulseTile, RatioTile, SessionsCard, StrengthCard } from "./Widgets";
import { Button, cx } from "../ui";
import { useLocalStorage, useNow, useQuotes } from "@/lib/hooks";

const PULSE = ["DXY", "EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "USDINR"];

export function MarketsView() {
  const [paused, setPaused] = useState(false);
  const { quotes, updatedAt, error, loading, reload } = useQuotes(20_000, paused);
  const [selected, setSelected] = useLocalStorage("fx.selected", "EURUSD");
  const [favorites, setFavorites] = useLocalStorage<string[]>("fx.favorites", ["EURUSD", "XAUUSD", "USDINR"]);
  const now = useNow(1000);
  const ago = updatedAt && now ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;

  const select = (id: string) => {
    setSelected(id);
    if (window.innerWidth < 1280) document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forex markets</h1>
          <p className="text-sm text-ink-3">Majors, crosses, metals, INR &amp; exotics and currency indices — free Yahoo Finance data, may be delayed.</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={cx("inline-flex items-center gap-1.5", error ? "text-down" : "text-ink-3")}>
            <span className={cx("h-1.5 w-1.5 rounded-full", error ? "bg-down" : paused ? "bg-ink-3" : "animate-pulse bg-up")} />
            {error ? `Connection problem (${error}) — retrying` : paused ? "Live updates paused" : ago == null ? "Connecting…" : `Live · updated ${ago}s ago`}
          </span>
          <Button variant="ghost" onClick={() => setPaused(!paused)} className="px-2 py-1 text-xs">{paused ? "▶ Resume" : "❚❚ Pause"}</Button>
          <Button variant="ghost" onClick={reload} className="px-2 py-1 text-xs">↻ Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {PULSE.map((id) => (
          <PulseTile key={id} id={id} q={quotes[id]} onClick={() => select(id)} active={selected === id} />
        ))}
        <RatioTile gold={quotes.XAUUSD} silver={quotes.XAGUSD} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Watchlist
          quotes={quotes}
          selected={selected}
          onSelect={select}
          favorites={favorites}
          toggleFav={(id) => setFavorites(favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id])}
          loading={loading}
        />
        <div id="detail" className="min-w-0 scroll-mt-20 space-y-5">
          <DetailPanel id={selected} quote={quotes[selected]} />
          <div className="grid gap-5 lg:grid-cols-2">
            <SessionsCard />
            <StrengthCard quotes={quotes} />
          </div>
        </div>
      </div>
    </div>
  );
}

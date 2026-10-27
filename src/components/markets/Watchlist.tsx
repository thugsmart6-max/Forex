"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, INSTRUMENTS, fmtPrice, type Category } from "@/lib/instruments";
import type { Quote } from "@/lib/types";
import { Card, Change, Segmented, cx, inputCls } from "../ui";
import { Sparkline } from "../charts";

type Tab = Category | "all" | "favorites";

function RangeBar({ q }: { q?: Quote }) {
  if (!q?.high || !q.low || q.price == null || q.high === q.low) return <span className="text-ink-3">—</span>;
  const p = Math.min(1, Math.max(0, (q.price - q.low) / (q.high - q.low)));
  return (
    <div className="relative h-1.5 w-20 rounded-full bg-surface-3" title={`Day range ${q.low} – ${q.high}`}>
      <div className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded bg-ink" style={{ left: `calc(${p * 100}% - 2px)` }} />
    </div>
  );
}

export function Watchlist({ quotes, selected, onSelect, favorites, toggleFav, loading }: {
  quotes: Record<string, Quote>;
  selected: string;
  onSelect: (id: string) => void;
  favorites: string[];
  toggleFav: (id: string) => void;
  loading: boolean;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase().replace("/", "");
    return INSTRUMENTS.filter((i) =>
      (tab === "all" || (tab === "favorites" ? favorites.includes(i.id) : i.category === tab)) &&
      (!s || i.id.toLowerCase().includes(s) || i.name.toLowerCase().replace("/", "").includes(s) || i.desc.toLowerCase().includes(s)),
    );
  }, [tab, q, favorites]);

  return (
    <Card
      title="Watchlist"
      subtitle="Click any row to chart it and see live strategy signals"
      actions={
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search e.g. EUR, gold, INR"
          className={cx(inputCls, "w-52 py-1.5")}
          aria-label="Search instruments"
        />
      }
      className="min-w-0"
    >
      <div className="-mx-1 mb-3 overflow-x-auto px-1">
        <Segmented size="sm" value={tab} onChange={setTab} options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} label="Category" />
      </div>
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="w-8 py-2 pl-4" aria-label="Favorite" />
              <th className="py-2 font-medium">Instrument</th>
              <th className="py-2 pl-3 text-right font-medium">Price</th>
              <th className="py-2 pl-4 text-right font-medium">Change</th>
              <th className="hidden py-2 pl-6 font-medium sm:table-cell xl:hidden 2xl:table-cell">Day range</th>
              <th className="py-2 pr-4 text-right font-medium">Today</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const qt = quotes[i.id];
              return (
                <tr
                  key={i.id}
                  onClick={() => onSelect(i.id)}
                  className={cx("cursor-pointer border-b border-line/60 transition-colors last:border-0", selected === i.id ? "bg-accent/10" : "hover:bg-surface-2")}
                >
                  <td className="py-2 pl-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFav(i.id);
                      }}
                      className={cx("text-base leading-none", favorites.includes(i.id) ? "text-warn" : "text-ink-3 hover:text-ink-2")}
                      aria-label={favorites.includes(i.id) ? `Remove ${i.name} from favorites` : `Add ${i.name} to favorites`}
                    >
                      {favorites.includes(i.id) ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="py-2">
                    <div className="font-semibold text-ink">{i.name}</div>
                    <div className="max-w-[220px] truncate text-xs text-ink-3">{i.desc}</div>
                  </td>
                  <td className="num py-2 pl-3 text-right font-medium">
                    {qt ? fmtPrice(i.id, qt.price) : loading ? <span className="inline-block h-3 w-16 animate-pulse rounded bg-surface-3" /> : "—"}
                  </td>
                  <td className="py-2 pl-4 text-right text-xs">
                    <Change pct={qt?.changePct} />
                  </td>
                  <td className="hidden py-2 pl-6 sm:table-cell xl:hidden 2xl:table-cell">
                    <RangeBar q={qt} />
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex justify-end">
                      <Sparkline values={qt?.spark ?? []} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-3">
            {tab === "favorites" ? "No favorites yet — tap ☆ on any row to pin it here." : "No instruments match your search."}
          </p>
        )}
      </div>
    </Card>
  );
}

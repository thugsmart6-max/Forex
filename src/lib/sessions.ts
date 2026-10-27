/** Forex trading sessions, computed in each centre's own time zone so daylight saving is handled. */

export interface Session {
  name: string;
  city: string;
  tz: string;
  open: number; // local hour
  close: number; // local hour
}

export const SESSIONS: Session[] = [
  { name: "Sydney", city: "Sydney", tz: "Australia/Sydney", open: 7, close: 16 },
  { name: "Tokyo", city: "Tokyo", tz: "Asia/Tokyo", open: 9, close: 18 },
  { name: "London", city: "London", tz: "Europe/London", open: 8, close: 17 },
  { name: "New York", city: "New York", tz: "America/New_York", open: 8, close: 17 },
];

/** Minutes the zone is ahead of UTC at instant `ms`. */
export function tzOffsetMin(tz: string, ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
}

/** Session window expressed in UTC hours (may wrap past 24). */
export function utcWindow(s: Session, ms: number) {
  const off = tzOffsetMin(s.tz, ms) / 60;
  let start = (s.open - off + 24) % 24;
  const end = start + (s.close - s.open);
  if (start >= 24) start -= 24;
  return { start, end };
}

/** The forex market is closed from ~Friday 17:00 New York until Sunday 17:00 New York. */
export function marketOpen(ms: number): boolean {
  const off = tzOffsetMin("America/New_York", ms);
  const ny = new Date(ms + off * 60000);
  const day = ny.getUTCDay();
  const h = ny.getUTCHours();
  if (day === 6) return false;
  if (day === 5 && h >= 17) return false;
  if (day === 0 && h < 17) return false;
  return true;
}

export function sessionOpen(s: Session, ms: number): boolean {
  if (!marketOpen(ms)) return false;
  const h = new Date(ms).getUTCHours() + new Date(ms).getUTCMinutes() / 60;
  const { start, end } = utcWindow(s, ms);
  return (h >= start && h < end) || (h + 24 >= start && h + 24 < end);
}

import type { NextRequest } from "next/server";
import { BY_ID } from "@/lib/instruments";
import { getHistory, MAX_RANGE, type Interval } from "@/lib/yahoo";

/** GET /api/history?id=EURUSD&interval=1h[&range=60d] -> { id, interval, bars: OHLC } */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id") ?? "";
  const interval = (sp.get("interval") ?? "1h") as Interval;
  const range = sp.get("range") ?? undefined;
  if (!BY_ID[id]) return Response.json({ error: `Unknown instrument "${id}"` }, { status: 400 });
  if (!(interval in MAX_RANGE)) return Response.json({ error: `Unsupported interval "${interval}"` }, { status: 400 });
  try {
    const bars = await getHistory(id, interval, range);
    return Response.json({ id, interval, bars });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

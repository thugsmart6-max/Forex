import type { NextRequest } from "next/server";
import { BY_ID, INSTRUMENTS } from "@/lib/instruments";
import { getQuote, mapLimit } from "@/lib/yahoo";

/** GET /api/quotes?ids=EURUSD,XAUUSD  (all instruments when `ids` is omitted) */
export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("ids");
  const ids = param ? param.split(",").filter((id) => BY_ID[id]) : INSTRUMENTS.map((i) => i.id);
  const quotes = await mapLimit(ids, 10, getQuote);
  return Response.json({ quotes, at: Date.now() });
}

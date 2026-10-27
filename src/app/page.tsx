import type { Metadata } from "next";
import { MarketsView } from "@/components/markets/MarketsView";

export const metadata: Metadata = { title: "Markets · FX Algo Desk" };

export default function MarketsPage() {
  return <MarketsView />;
}

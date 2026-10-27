import type { Metadata } from "next";
import { BacktestView } from "@/components/trading/BacktestView";

export const metadata: Metadata = { title: "Backtest · FX Algo Desk" };

export default function BacktestPage() {
  return <BacktestView />;
}

import type { Metadata } from "next";
import { PaperView } from "@/components/trading/PaperView";

export const metadata: Metadata = { title: "Paper Trading · FX Algo Desk" };

export default function PaperPage() {
  return <PaperView />;
}

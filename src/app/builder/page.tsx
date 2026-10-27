import type { Metadata } from "next";
import { BuilderView } from "@/components/builder/BuilderView";

export const metadata: Metadata = { title: "Strategy Builder · FX Algo Desk" };

export default function BuilderPage() {
  return <BuilderView />;
}

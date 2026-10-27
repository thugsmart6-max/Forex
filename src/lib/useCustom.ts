"use client";

import { useMemo } from "react";
import { compileCustom, type CustomStrategy } from "./custom";
import { useLocalStorage } from "./hooks";
import { setCustomStrategies } from "./strategies";

/** Saved Strategy Builder strategies (this browser), registered so every page can run them. */
export function useCustomStrategies() {
  const [list, setList, loaded] = useLocalStorage<CustomStrategy[]>("custom.strategies", []);
  const defs = useMemo(() => {
    const d = list.map(compileCustom);
    setCustomStrategies(d);
    return d;
  }, [list]);
  return { list, setList, defs, loaded };
}

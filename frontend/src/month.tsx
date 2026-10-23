import { createContext, ReactNode, useContext, useState } from "react";

type MonthCtx = { year: number; month: number; setYM: (y: number, m: number) => void; shift: (d: number) => void };
const Ctx = createContext<MonthCtx>(null as unknown as MonthCtx);

export function MonthProvider({ children }: { children: ReactNode }) {
  const now = new Date();
  const [ym, setState] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const setYM = (year: number, month: number) => setState({ year, month });
  const shift = (d: number) =>
    setState(({ year, month }) => {
      const idx = year * 12 + (month - 1) + d;
      return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
    });
  return <Ctx.Provider value={{ ...ym, setYM, shift }}>{children}</Ctx.Provider>;
}

export const useMonth = () => useContext(Ctx);

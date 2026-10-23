import { useQuery } from "@tanstack/react-query";

import { api, Bill, Family, Goal, MonthData, PeopleData } from "@/src/api";
import { queryClient } from "@/src/query-client";

export const useMonthData = (year: number, month: number) =>
  useQuery({ queryKey: ["month", year, month], queryFn: () => api<MonthData>(`/month/${year}/${month}`) });

export const useFamily = () => useQuery({ queryKey: ["family"], queryFn: () => api<Family>("/family") });

export type YearData = {
  year: number;
  months: { month: number; income: number; expenses: number; fixed: number; variable: number; balance: number; status: string }[];
  totals: { income: number; expenses: number; balance: number; pct: number | null };
  breakdown: { id: string; name: string; icon: string; kind: string; value: number; pct: number }[];
};

export const useYearData = (year: number) =>
  useQuery({ queryKey: ["year", year], queryFn: () => api<YearData>(`/year/${year}`) });

export const usePeople = (year: number) =>
  useQuery({ queryKey: ["people", year], queryFn: () => api<PeopleData>(`/people/${year}`) });

export const useGoals = () => useQuery({ queryKey: ["goals"], queryFn: () => api<Goal[]>("/goals") });

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const useBills = () => {
  const date = todayISO();
  return useQuery({
    queryKey: ["bills", date],
    queryFn: () => api<{ has_due_days: boolean; bills: Bill[] }>(`/bills/upcoming?date=${date}&days=7`),
  });
};

export const invalidateAll = () =>
  Promise.all(
    ["month", "year", "family", "people", "goals", "categories", "bills"].map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
  );

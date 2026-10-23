import { useQuery } from "@tanstack/react-query";

import { api, Family, Goal, MonthData, PeopleData } from "@/src/api";
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

export const invalidateAll = () =>
  Promise.all(
    ["month", "year", "family", "people", "goals", "categories"].map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
  );

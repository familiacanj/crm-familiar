import { useQuery } from "@tanstack/react-query";

import { api, Bill, Family, FamilyFinancialSummary, FamilyMembership, FamilyReimbursement, Goal, MonthData, PeopleData } from "@/src/api";
import { queryClient } from "@/src/query-client";

export const useMonthData = (year: number, month: number) =>
  useQuery({ queryKey: ["month", year, month], queryFn: () => api<MonthData>(`/month/${year}/${month}`) });

export const useFamily = () => useQuery({ queryKey: ["family"], queryFn: () => api<Family>("/family") });
export const useMyFamilies = () => useQuery({ queryKey: ["families"], queryFn: () => api<FamilyMembership[]>("/families/mine") });

export const useFamilyFinancialSummary = (year: number, month: number, enabled = true) =>
  useQuery({ queryKey: ["family-financial-summary", year, month], queryFn: () => api<FamilyFinancialSummary>(`/family/financial-summary/${year}/${month}`), enabled });

export const useFamilyReimbursements = (enabled = true) =>
  useQuery({ queryKey: ["family-reimbursements"], queryFn: () => api<FamilyReimbursement[]>("/family/reimbursements"), enabled });

export type YearData = {
  year: number;
  months: { month: number; income: number; expenses: number; fixed: number; variable: number; balance: number; status: string }[];
  totals: {
    income: number; expenses: number; balance: number; pct: number | null;
    personal_expenses?: number; family_paid_expenses?: number; cash_transfers_out?: number;
    transfers_received?: number; reimbursements_received?: number; total_inflows?: number; total_outflows?: number;
  };
  breakdown: { id: string; name: string; icon: string; kind: string; value: number; pct: number }[];
  family_financials?: {
    months: { month: number; opening_balance: number; cash_in: number; cash_out: number; cash_balance: number; family_budget_expenses_paid: number; family_cash_expenses: number; direct_family_expenses: number; contributions: number }[];
    totals: { opening_balance: number; cash_in: number; cash_out: number; closing_balance: number; direct_family_expenses: number; family_budget_expenses_paid: number; family_cash_expenses: number; contributions: number; commitments: number; unlinked_commitments?: number; credits: number; pending: number };
    members: { member_id: string; name: string; cash_contributions: number; direct_family_expenses: number; total_contributed: number; commitment_total: number; credit_balance: number; pending_balance: number; association_status?: "linked" | "unlinked_member" | "account_without_financial_member" | "duplicate_member_link" }[];
  };
};
export type PersonalYearData = YearData;

export const useYearData = (year: number, enabled = true) =>
  useQuery({ queryKey: ["year", year], queryFn: () => api<YearData>(`/year/${year}`), enabled });

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
    ["month", "year", "family", "families", "people", "goals", "categories", "bills", "family-financial-summary", "family-reimbursements", "personal-summary", "personal-year"].map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
  );

export const TOKEN_KEY = "auth_token";

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null) {
  token = t;
}

export const getToken = () => token;

export function setOnUnauthorized(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error("Sua sessão expirou. Entre de novo.");
  }
  if (!res.ok) throw new Error(data?.detail ?? "Algo deu errado. Tente de novo.");
  return data as T;
}

export type Row = {
  ref_type: "member" | "category";
  id: string;
  name: string;
  icon: string;
  color: string | null;
  kind: "member" | "income_extra" | "fixed" | "variable";
  default_value: number;
  value: number;
  overridden: boolean;
  member_id?: string | null;
  due_day?: number | null;
};

export type Bill = {
  category_id: string;
  name: string;
  icon: string;
  kind: string;
  year: number;
  month: number;
  due_date: string;
  days_left: number;
  value: number;
  paid: boolean;
};

export type Goal = {
  goal_id: string;
  name: string;
  icon: string;
  target: number;
  saved: number;
  pct: number;
  deposits: { year: number; month: number; amount: number }[];
};

export type PeopleData = {
  year: number;
  members: { member_id: string; name: string; color: string; categories: { id: string; name: string; icon: string }[]; months: number[]; total: number }[];
};

export type MonthData = {
  year: number;
  month: number;
  sections: { income: Row[]; fixed: Row[]; variable: Row[] };
  totals: {
    income: number;
    fixed: number;
    variable: number;
    expenses: number;
    balance: number;
    pct: number | null;
    status: "" | "POSITIVO" | "NEGATIVO";
  };
};

export type Member = { member_id: string; name: string; color: string; default_income: number };
export type Category = {
  category_id: string;
  name: string;
  icon: string;
  kind: "income_extra" | "fixed" | "variable";
  default_value: number;
  member_id?: string | null;
  due_day?: number | null;
};
export type Family = {
  family_id: string;
  name: string;
  invite_code: string;
  members: Member[];
  users: { user_id: string; name: string; email: string; picture?: string }[];
};

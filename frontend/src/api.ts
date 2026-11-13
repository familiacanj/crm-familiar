import { supabase } from "@/src/supabase";
import { Platform } from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import { LocalFile, toFormDataPart } from "@/src/utils/upload";

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error("Sua sessão expirou. Entre de novo.");
  }
  if (!res.ok) throw new Error(data?.detail ?? "Algo deu errado. Tente de novo.");
  return data as T;
}

export async function publicApi<T = any>(path: string): Promise<T> {
  const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api${path}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail ?? "Não foi possível carregar este convite.");
  return data as T;
}

export async function uploadMemberPhoto(memberId: string, file: LocalFile): Promise<{ photo_url: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Entre novamente para alterar a fotografia.");
  const blob = await toFormDataPart(file);
  const contentType = file.mimeType || blob.type || "application/octet-stream";
  const url = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/members/${encodeURIComponent(memberId)}/photo`;
  const options = {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": contentType },
    body: blob,
  };
  const response = Platform.OS === "web" ? await fetch(url, options) : await expoFetch(url, options);
  const data = await response.json().catch(() => null);
  if (response.status === 401) {
    onUnauthorized?.();
    throw new Error("Sua sessão expirou. Entre de novo.");
  }
  if (!response.ok) throw new Error(data?.detail ?? "Não foi possível salvar a fotografia.");
  return data as { photo_url: string };
}

export type Row = {
  ref_type: "member" | "category";
  id: string;
  name: string;
  icon: string;
  color: string | null;
  photo_url?: string;
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
  members: { member_id: string; name: string; color: string; photo_url?: string; categories: { id: string; name: string; icon: string }[]; months: number[]; total: number }[];
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

export type Member = { member_id: string; name: string; color: string; default_income: number; photo_url?: string; linked_user_id?: string | null };
export type Category = {
  category_id: string;
  name: string;
  icon: string;
  kind: "income_extra" | "fixed" | "variable";
  default_value: number;
  member_id?: string | null;
  due_day?: number | null;
};
export type InvitePreview = {
  family_name: string;
  expires_at: string;
  valid: boolean;
};

export type InviteCreated = {
  invite_url: string;
};

export type Family = {
  family_id: string;
  name: string;
  members: Member[];
  users: { user_id: string; name: string; email: string; picture?: string; family_role?: "owner" | "admin" | "member"; last_access_at?: string | null }[];
};

export type FamilyMembership = { family_id: string; name: string; role: "owner" | "admin" | "member"; active: boolean };

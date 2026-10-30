import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import { createOAuthDiagnosticFetch, isOAuthDiagnosticEnabled, recordOAuthDiagnostic } from "@/src/oauthDiagnostics";
import { storage } from "@/src/utils/storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Supabase não configurado. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
  );
}

const authStorage = {
  async getItem(key: string) {
    const diagnosticMode = isOAuthDiagnosticEnabled();
    const startedAt = diagnosticMode ? performance.now() : 0;
    if (diagnosticMode) recordOAuthDiagnostic("AUTH_STORAGE_READ_STARTED");
    try {
      const value = await storage.getItem(key, null);
      if (diagnosticMode) recordOAuthDiagnostic("AUTH_STORAGE_READ_RESOLVED", performance.now() - startedAt);
      if (value === null || value === undefined) return null;
      return typeof value === "string" ? value : JSON.stringify(value);
    } catch (error) {
      if (diagnosticMode) recordOAuthDiagnostic("AUTH_STORAGE_READ_FAILED", performance.now() - startedAt);
      throw error;
    }
  },
  async setItem(key: string, value: string) {
    const diagnosticMode = isOAuthDiagnosticEnabled();
    const startedAt = diagnosticMode ? performance.now() : 0;
    if (diagnosticMode) recordOAuthDiagnostic("AUTH_STORAGE_WRITE_STARTED");
    try {
      await storage.setItem(key, value);
      if (diagnosticMode) recordOAuthDiagnostic("AUTH_STORAGE_WRITE_RESOLVED", performance.now() - startedAt);
    } catch (error) {
      if (diagnosticMode) recordOAuthDiagnostic("AUTH_STORAGE_WRITE_FAILED", performance.now() - startedAt);
      throw error;
    }
  },
  async removeItem(key: string) {
    const diagnosticMode = isOAuthDiagnosticEnabled();
    const startedAt = diagnosticMode ? performance.now() : 0;
    if (diagnosticMode) recordOAuthDiagnostic("AUTH_STORAGE_REMOVE_STARTED");
    try {
      await storage.removeItem(key);
      if (diagnosticMode) recordOAuthDiagnostic("AUTH_STORAGE_REMOVE_RESOLVED", performance.now() - startedAt);
    } catch (error) {
      if (diagnosticMode) recordOAuthDiagnostic("AUTH_STORAGE_REMOVE_FAILED", performance.now() - startedAt);
      throw error;
    }
  },
};

const diagnosticFetch = createOAuthDiagnosticFetch(globalThis.fetch.bind(globalThis), supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: diagnosticFetch },
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    // The browser can finish the PKCE callback automatically. Native keeps
    // the explicit WebBrowser + exchangeCodeForSession flow in auth.tsx.
    detectSessionInUrl: Platform.OS === "web",
  },
});

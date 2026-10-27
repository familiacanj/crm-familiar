import "react-native-url-polyfill/auto";

import { createClient } from "@supabase/supabase-js";

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
    const value = await storage.getItem(key, null);
    if (value === null || value === undefined) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  },
  async setItem(key: string, value: string) {
    await storage.setItem(key, value);
  },
  async removeItem(key: string) {
    await storage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

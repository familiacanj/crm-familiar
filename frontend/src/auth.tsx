import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

import { api, setOnUnauthorized } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { supabase } from "@/src/supabase";

WebBrowser.maybeCompleteAuthSession();

export type User = { user_id: string; email: string; name: string; picture?: string; family_id: string | null };

type AuthCtx = {
  user: User | null | undefined; // undefined = loading
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  error: string | null;
};

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

function getRedirectUrl() {
  return Platform.OS === "web" ? window.location.origin : Linking.createURL("auth/callback");
}

async function finishWebOAuth() {
  if (Platform.OS !== "web" || !window.location.search.includes("code=")) return;
  const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
  if (error) throw error;
  window.history.replaceState(window.history.state, "", window.location.pathname);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setUser(null);
      return;
    }
    setUser(await api<User>("/auth/me"));
  }, []);

  useEffect(() => {
    let mounted = true;
    setOnUnauthorized(() => {
      void supabase.auth.signOut();
      if (mounted) setUser(null);
    });

    const initialize = async () => {
      try {
        await finishWebOAuth();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (mounted) setUser(null);
          return;
        }
        const nextUser = await api<User>("/auth/me");
        if (mounted) {
          setError(null);
          setUser(nextUser);
        }
      } catch (e: any) {
        if (mounted) {
          setError(e?.message ?? "Não foi possível carregar a sessão.");
          setUser(null);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && mounted) setUser(null);
    });
    void initialize();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      setOnUnauthorized(null);
    };
  }, []);

  const login = useCallback(async () => {
    setError(null);
    const redirectTo = getRedirectUrl();
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (oauthError || !data.url) {
      const message = oauthError?.message ?? "Não foi possível iniciar o login com Google.";
      setError(message);
      throw new Error(message);
    }

    if (Platform.OS === "web") {
      window.location.assign(data.url);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return;
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
    if (exchangeError) {
      setError(exchangeError.message);
      throw exchangeError;
    }
    await refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    await clear();
  }, [clear]);

  return <Ctx.Provider value={{ user, login, logout, refreshUser, error }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

import { api, setOnUnauthorized, setToken, TOKEN_KEY } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

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
const sentIds = new Set<string>();

function extractSessionId(url: string | null | undefined) {
  const m = url?.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(async () => {
    setToken(null);
    await storage.secureRemove(TOKEN_KEY);
    queryClient.clear();
    setUser(null);
  }, []);

  const exchange = useCallback(async (sid: string) => {
    if (sentIds.has(sid)) return false;
    sentIds.add(sid);
    try {
      const r = await api<{ session_token: string; user: User }>("/auth/session", {
        method: "POST",
        body: { session_id: sid },
      });
      setToken(r.session_token);
      await storage.secureSet(TOKEN_KEY, r.session_token);
      setError(null);
      setUser(r.user);
      return true;
    } catch (e: any) {
      setError(e.message);
      setUser(null);
      return false;
    }
  }, []);

  const checkExisting = useCallback(async () => {
    const t = await storage.secureGet(TOKEN_KEY, null);
    if (!t) return setUser(null);
    setToken(String(t));
    try {
      setUser(await api<User>("/auth/me"));
    } catch {
      await clear();
    }
  }, [clear]);

  useEffect(() => {
    setOnUnauthorized(() => {
      setToken(null);
      storage.secureRemove(TOKEN_KEY);
      setUser(null);
    });
    let sub: { remove: () => void } | undefined;
    (async () => {
      if (Platform.OS === "web") {
        const sid = extractSessionId(window.location.hash) ?? extractSessionId(window.location.search);
        if (sid) {
          const ok = await exchange(sid);
          if (ok) window.history.replaceState(window.history.state, "", window.location.pathname);
          return;
        }
        return checkExisting();
      }
      sub = Linking.addEventListener("url", (e) => {
        const sid = extractSessionId(e.url);
        if (sid) exchange(sid);
      });
      const sid = extractSessionId(await Linking.getInitialURL());
      if (sid && (await exchange(sid))) return;
      await checkExisting();
    })();
    return () => {
      sub?.remove();
      setOnUnauthorized(null);
    };
  }, [exchange, checkExisting]);

  const login = useCallback(async () => {
    setError(null);
    const redirect = Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
    if (Platform.OS === "web") {
      window.location.href = authUrl;
      return;
    }
    let captured: string | null = null;
    const sub = Linking.addEventListener("url", (e) => {
      captured = e.url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
      const url = (result.type === "success" ? result.url : null) ?? captured ?? (await Linking.getInitialURL());
      const sid = extractSessionId(url);
      if (sid) await exchange(sid);
    } finally {
      sub.remove();
    }
  }, [exchange]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clear();
  }, [clear]);

  const refreshUser = useCallback(async () => {
    setUser(await api<User>("/auth/me"));
  }, []);

  return <Ctx.Provider value={{ user, login, logout, refreshUser, error }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

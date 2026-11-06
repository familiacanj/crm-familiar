import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

import { api, setOnUnauthorized } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { supabase } from "@/src/supabase";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

export type User = { user_id: string; email: string; name: string; picture?: string; family_id: string | null; family_role?: "owner" | "admin" | "member" };

type AuthCtx = {
  user: User | null | undefined; // undefined = loading
  initializationFailed: boolean;
  retryInitialization: () => void;
  login: (inviteToken?: string, onProgress?: (message: string) => void) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  error: string | null;
};

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
const OAUTH_REQUEST_TIMEOUT_MS = 12_000;
const STARTUP_SESSION_TIMEOUT_MS = 12_000;
const STARTUP_USER_TIMEOUT_MS = 15_000;

function getRedirectUrl(inviteToken?: string) {
  if (Platform.OS !== "web") return Linking.createURL("auth/callback");
  if (!inviteToken) return window.location.origin;
  return `${window.location.origin}/invite?token=${encodeURIComponent(inviteToken)}`;
}

function logOAuthTiming(label: string, startedAt: number) {
  if (Platform.OS !== "web" || typeof performance === "undefined" || typeof console === "undefined") return;
  console.info(`[CRM] Google OAuth ${label}: ${Math.round(performance.now() - startedAt)}ms`);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [initializationFailed, setInitializationFailed] = useState(false);

  const retryInitialization = useCallback(() => {
    if (Platform.OS === "web") window.location.reload();
  }, []);

  const clear = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      await storage.removeItem("pending_invite_token");
      queryClient.clear();
      setUser(null);
    }
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
      void storage.removeItem("pending_invite_token");
      if (mounted) setUser(null);
    });

    let lastAccessToken: string | null | undefined;
    let startupPending = true;

    const syncSession = async (
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"],
      force = false,
      signal?: AbortSignal,
    ) => {
      const accessToken = session?.access_token ?? null;
      if (!force && accessToken === lastAccessToken) return true;
      lastAccessToken = accessToken;
      if (!session) {
        if (mounted) {
          setError(null);
          setInitializationFailed(false);
          setUser(null);
        }
        return true;
      }

      try {
        const backendStartedAt = Platform.OS === "web" && typeof performance !== "undefined" ? performance.now() : 0;
        const nextUser = signal
          ? await api<User>("/auth/me", { signal })
          : await api<User>("/auth/me");
        logOAuthTiming("backend-user", backendStartedAt);
        if (mounted && !signal?.aborted) {
          setError(null);
          setInitializationFailed(false);
          setUser(nextUser);
        }
        return true;
      } catch (e: any) {
        lastAccessToken = undefined;
        if (mounted && !signal?.aborted) {
          setError(e?.name === "AbortError"
            ? "A conexão demorou para iniciar o CRM. Tente novamente."
            : e?.message ?? "Não foi possível carregar a sessão.");
          setUser(null);
        }
        return false;
      }
    };

    const syncSessionWithStartupTimeout = async (
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"],
      force = false,
    ) => {
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), STARTUP_USER_TIMEOUT_MS);
      try {
        const syncSucceeded = await withTimeout(
          syncSession(session, force, controller.signal),
          STARTUP_USER_TIMEOUT_MS,
          "A conexão demorou para iniciar o CRM. Tente novamente.",
        );
        if (!syncSucceeded && mounted) {
          setError("Não foi possível carregar a sessão. Tente novamente.");
          setInitializationFailed(true);
          setUser(null);
        }
        return syncSucceeded;
      } catch (startupError: any) {
        controller.abort();
        if (mounted) {
          setError(startupError?.message ?? "Não foi possível carregar a sessão. Tente novamente.");
          setInitializationFailed(true);
          setUser(null);
        }
        return false;
      } finally {
        clearTimeout(abortTimer);
      }
    };

    const initialize = async () => {
      try {
        const sessionResult = Platform.OS === "web"
          ? await withTimeout(
            supabase.auth.getSession(),
            STARTUP_SESSION_TIMEOUT_MS,
            "A verificação da sessão demorou mais que o esperado. Tente novamente.",
          )
          : await supabase.auth.getSession();
        const { data, error: sessionError } = sessionResult;
        if (sessionError) throw sessionError;
        if (data.session) {
          if (Platform.OS === "web") {
            await syncSessionWithStartupTimeout(data.session);
          } else {
            await syncSession(data.session);
          }
        } else {
          await syncSession(null);
        }
        if (Platform.OS === "web" && window.location.search.includes("code=")) {
          const url = new URL(window.location.href);
          url.searchParams.delete("code");
          url.searchParams.delete("state");
          url.searchParams.delete("error");
          url.searchParams.delete("error_code");
          url.searchParams.delete("error_description");
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
        }
      } catch (e: any) {
        if (mounted) {
          setError(e?.message ?? "Não foi possível carregar a sessão.");
          if (Platform.OS === "web") setInitializationFailed(true);
          setUser(null);
        }
      } finally {
        startupPending = false;
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        lastAccessToken = null;
        void storage.removeItem("pending_invite_token");
        setUser(null);
        return;
      }
      if (["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        // Do not await application/API work inside the Supabase callback.
        setTimeout(() => {
          if (Platform.OS === "web" && startupPending) {
            void syncSessionWithStartupTimeout(session, event === "USER_UPDATED");
          } else {
            void syncSession(session, event === "USER_UPDATED");
          }
        }, 0);
      }
    });
    void initialize();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      setOnUnauthorized(null);
    };
  }, []);

  const login = useCallback(async (inviteToken?: string, onProgress?: (message: string) => void) => {
    const startedAt = Platform.OS === "web" && typeof performance !== "undefined" ? performance.now() : 0;
    logOAuthTiming("started", startedAt);
    setError(null);
    onProgress?.("Iniciando autenticação...");
    const normalizedInviteToken = inviteToken?.trim() || undefined;
    if (normalizedInviteToken) {
      // The invitation token is already in redirectTo. On web, storage is only
      // a recovery aid and must never delay opening the Google authorization page.
      if (Platform.OS === "web") void storage.setItem("pending_invite_token", normalizedInviteToken);
      else await storage.setItem("pending_invite_token", normalizedInviteToken);
    } else {
      // A normal login must never inherit an invitation from an earlier session.
      // AsyncStorage can stall in a regular Chrome Android tab. The normal
      // callback never reads this key, so cleanup is intentionally non-blocking.
      if (Platform.OS === "web") void storage.removeItem("pending_invite_token");
      else await storage.removeItem("pending_invite_token");
    }
    const redirectTo = getRedirectUrl(normalizedInviteToken);
    onProgress?.("Solicitando autorização ao Supabase...");
    let oauthResponse: Awaited<ReturnType<typeof supabase.auth.signInWithOAuth>>;
    try {
      oauthResponse = await withTimeout(
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        }),
        OAUTH_REQUEST_TIMEOUT_MS,
        "A autorização demorou mais que o esperado. Toque em Entrar com Google para tentar novamente.",
      );
    } catch (e: any) {
      const message = e?.message ?? "Não foi possível solicitar a autorização ao Supabase.";
      logOAuthTiming("request-failed", startedAt);
      setError(message);
      throw new Error(message);
    }
    const { data, error: oauthError } = oauthResponse;
    if (oauthError || !data.url) {
      const message = oauthError?.message ?? "Não foi possível iniciar o login com Google.";
      logOAuthTiming("failed", startedAt);
      setError(message);
      throw new Error(message);
    }

    if (Platform.OS === "web") {
      onProgress?.("Resposta recebida. Abrindo o Google...");
      logOAuthTiming("redirecting", startedAt);
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
    try {
      await clear();
    } finally {
      if (Platform.OS === "web") {
        window.location.replace(`${window.location.origin}/`);
      }
    }
  }, [clear]);

  return <Ctx.Provider value={{ user, initializationFailed, retryInitialization, login, logout, refreshUser, error }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

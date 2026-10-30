import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

import { api, setOnUnauthorized } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { isOAuthDiagnosticEnabled, recordOAuthDiagnostic } from "@/src/oauthDiagnostics";
import { supabase } from "@/src/supabase";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

export type User = { user_id: string; email: string; name: string; picture?: string; family_id: string | null; family_role?: "owner" | "admin" | "member" };

type AuthCtx = {
  user: User | null | undefined; // undefined = loading
  login: (inviteToken?: string, onProgress?: (message: string) => void) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  error: string | null;
};

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);
const OAUTH_REQUEST_TIMEOUT_MS = 12_000;

function getRedirectUrl(inviteToken?: string) {
  if (Platform.OS !== "web") return Linking.createURL("auth/callback");
  if (!inviteToken) return window.location.origin;
  return `${window.location.origin}/invite?token=${encodeURIComponent(inviteToken)}`;
}

function logOAuthTiming(label: string, startedAt: number) {
  if (Platform.OS !== "web" || typeof performance === "undefined" || typeof console === "undefined") return;
  console.info(`[CRM] Google OAuth ${label}: ${Math.round(performance.now() - startedAt)}ms`);
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
  onLateSettlement?: (resolved: boolean) => void,
): Promise<T> {
  let timeoutFired = false;
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      timeoutFired = true;
      onTimeout?.();
      reject(new Error(message));
    }, timeoutMs);
    promise.then(
      (value) => {
        if (timeoutFired) onLateSettlement?.(true);
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        if (timeoutFired) onLateSettlement?.(false);
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

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

    const syncSession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"], force = false) => {
      const accessToken = session?.access_token ?? null;
      if (!force && accessToken === lastAccessToken) return;
      lastAccessToken = accessToken;
      if (!session) {
        if (mounted) setUser(null);
        return;
      }

      try {
        const backendStartedAt = Platform.OS === "web" && typeof performance !== "undefined" ? performance.now() : 0;
        const nextUser = await api<User>("/auth/me");
        logOAuthTiming("backend-user", backendStartedAt);
        if (mounted) {
          setError(null);
          setUser(nextUser);
        }
      } catch (e: any) {
        lastAccessToken = undefined;
        if (mounted) {
          setError(isOAuthDiagnosticEnabled() ? "Não foi possível carregar a sessão. Consulte o registro técnico." : e?.message ?? "Não foi possível carregar a sessão.");
          setUser(null);
        }
      }
    };

    const initialize = async () => {
      const diagnosticMode = Platform.OS === "web" && isOAuthDiagnosticEnabled();
      const sessionStartedAt = diagnosticMode ? performance.now() : 0;
      if (diagnosticMode) recordOAuthDiagnostic("SESSION_GET_STARTED");
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (diagnosticMode) recordOAuthDiagnostic("SESSION_GET_RESOLVED", performance.now() - sessionStartedAt);
        if (sessionError) throw sessionError;
        await syncSession(data.session);
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
        if (diagnosticMode) recordOAuthDiagnostic("SESSION_GET_REJECTED", performance.now() - sessionStartedAt);
        if (mounted) {
          setError(diagnosticMode ? "Não foi possível carregar a sessão. Consulte o registro técnico." : e?.message ?? "Não foi possível carregar a sessão.");
          setUser(null);
        }
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
        setTimeout(() => void syncSession(session, event === "USER_UPDATED"), 0);
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
    const diagnosticMode = Platform.OS === "web" && isOAuthDiagnosticEnabled();
    if (diagnosticMode) recordOAuthDiagnostic("AUTH_FUNCTION_ENTERED");
    const startedAt = Platform.OS === "web" && typeof performance !== "undefined" ? performance.now() : 0;
    logOAuthTiming("started", startedAt);
    setError(null);
    onProgress?.("Iniciando autenticação...");
    const normalizedInviteToken = inviteToken?.trim() || undefined;
    if (normalizedInviteToken) {
      if (diagnosticMode) recordOAuthDiagnostic("PENDING_INVITE_WRITE_STARTED");
      try {
        await storage.setItem("pending_invite_token", normalizedInviteToken);
        if (diagnosticMode) recordOAuthDiagnostic("PENDING_INVITE_WRITE_RESOLVED");
      } catch (error) {
        if (diagnosticMode) recordOAuthDiagnostic("PENDING_INVITE_WRITE_FAILED");
        throw error;
      }
    } else {
      if (diagnosticMode) recordOAuthDiagnostic("PENDING_INVITE_REMOVE_STARTED");
      try {
        await storage.removeItem("pending_invite_token");
        if (diagnosticMode) recordOAuthDiagnostic("PENDING_INVITE_REMOVE_RESOLVED");
      } catch (error) {
        if (diagnosticMode) recordOAuthDiagnostic("PENDING_INVITE_REMOVE_FAILED");
        throw error;
      }
    }
    const redirectTo = getRedirectUrl(normalizedInviteToken);
    onProgress?.("Solicitando autorização ao Supabase...");
    let oauthResponse: Awaited<ReturnType<typeof supabase.auth.signInWithOAuth>>;
    let timedOut = false;
    let promiseCreated = false;
    try {
      if (diagnosticMode) recordOAuthDiagnostic("OAUTH_CALL_STARTED");
      const oauthPromise = supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
      });
      promiseCreated = true;
      if (diagnosticMode) recordOAuthDiagnostic("OAUTH_PROMISE_RETURNED");
      const timedOAuthPromise = withTimeout(
        oauthPromise,
        OAUTH_REQUEST_TIMEOUT_MS,
        "A autorização demorou mais que o esperado. Toque em Entrar com Google para tentar novamente.",
        () => {
          timedOut = true;
          if (diagnosticMode) recordOAuthDiagnostic("OAUTH_TIMEOUT_FIRED");
        },
        (resolved) => {
          if (diagnosticMode) {
            recordOAuthDiagnostic(resolved ? "OAUTH_RESOLVED_AFTER_TIMEOUT" : "OAUTH_REJECTED_AFTER_TIMEOUT");
          }
        },
      );
      if (diagnosticMode) recordOAuthDiagnostic("OAUTH_TIMEOUT_ARMED", OAUTH_REQUEST_TIMEOUT_MS);
      oauthResponse = await timedOAuthPromise;
    } catch (e: any) {
      if (diagnosticMode && !timedOut) {
        recordOAuthDiagnostic(promiseCreated ? "OAUTH_PROMISE_REJECTED" : "OAUTH_CALL_THROWN");
      }
      const message = diagnosticMode
        ? "A solicitação de login não foi concluída. Consulte o registro técnico."
        : e?.message ?? "Não foi possível solicitar a autorização ao Supabase.";
      logOAuthTiming("request-failed", startedAt);
      setError(message);
      throw new Error(message);
    }
    const { data, error: oauthError } = oauthResponse;
    if (diagnosticMode) {
      recordOAuthDiagnostic(data.url ? "OAUTH_PROMISE_RESOLVED_WITH_URL" : "OAUTH_PROMISE_RESOLVED_WITHOUT_URL");
    }
    if (oauthError || !data.url) {
      if (diagnosticMode) recordOAuthDiagnostic("OAUTH_ERROR_RETURNED");
      const message = diagnosticMode
        ? "O Supabase não concluiu a solicitação de login. Consulte o registro técnico."
        : oauthError?.message ?? "Não foi possível iniciar o login com Google.";
      logOAuthTiming("failed", startedAt);
      setError(message);
      throw new Error(message);
    }

    if (Platform.OS === "web") {
      onProgress?.("Resposta recebida. Abrindo o Google...");
      logOAuthTiming("redirecting", startedAt);
      if (diagnosticMode) {
        let callbackIsPreview = false;
        try {
          const authUrl = new URL(data.url);
          const callback = authUrl.searchParams.get("redirect_to");
          callbackIsPreview = !!callback && new URL(callback).origin === window.location.origin;
        } catch {
          callbackIsPreview = false;
        }
        if (!callbackIsPreview) {
          recordOAuthDiagnostic("REDIRECT_BLOCKED_CALLBACK_MISMATCH");
          const message = "A prévia não recebeu um callback seguro para este endereço. Consulte o registro técnico.";
          setError(message);
          throw new Error(message);
        }
        recordOAuthDiagnostic("REDIRECT_ATTEMPTED");
        setTimeout(() => {
          if (!window.__CRM_OAUTH_DIAGNOSTICS__?.navigationStarted && document.visibilityState === "visible") {
            recordOAuthDiagnostic("REDIRECT_NO_PAGEHIDE_AFTER_3000MS");
          }
        }, 3000);
        try {
          window.location.assign(data.url);
        } catch {
          recordOAuthDiagnostic("REDIRECT_ASSIGN_FAILED");
          const message = "O navegador recusou a navegação. Consulte o registro técnico.";
          setError(message);
          throw new Error(message);
        }
        return;
      }
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

  return <Ctx.Provider value={{ user, login, logout, refreshUser, error }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

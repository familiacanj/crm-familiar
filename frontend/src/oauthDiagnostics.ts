export type OAuthDiagnosticCode =
  | "DIAGNOSTIC_LOADED"
  | "MODE_BROWSER"
  | "MODE_STANDALONE"
  | "SERVICE_WORKER_CONTROLLED"
  | "SERVICE_WORKER_UNCONTROLLED"
  | "TOUCH_RECEIVED"
  | "PRESS_RECEIVED"
  | "LOGIN_HANDLER_ENTERED"
  | "AUTH_FUNCTION_ENTERED"
  | "LOGIN_DUPLICATE_IGNORED"
  | "LOGIN_WAIT_MARKER_4500MS"
  | "PENDING_INVITE_WRITE_STARTED"
  | "PENDING_INVITE_WRITE_RESOLVED"
  | "PENDING_INVITE_WRITE_FAILED"
  | "PENDING_INVITE_REMOVE_STARTED"
  | "PENDING_INVITE_REMOVE_RESOLVED"
  | "PENDING_INVITE_REMOVE_FAILED"
  | "SESSION_GET_STARTED"
  | "SESSION_GET_RESOLVED"
  | "SESSION_GET_REJECTED"
  | "AUTH_STORAGE_READ_STARTED"
  | "AUTH_STORAGE_READ_RESOLVED"
  | "AUTH_STORAGE_READ_FAILED"
  | "AUTH_STORAGE_WRITE_STARTED"
  | "AUTH_STORAGE_WRITE_RESOLVED"
  | "AUTH_STORAGE_WRITE_FAILED"
  | "AUTH_STORAGE_REMOVE_STARTED"
  | "AUTH_STORAGE_REMOVE_RESOLVED"
  | "AUTH_STORAGE_REMOVE_FAILED"
  | "OAUTH_CALL_STARTED"
  | "OAUTH_PROMISE_RETURNED"
  | "OAUTH_CALL_THROWN"
  | "OAUTH_TIMEOUT_ARMED"
  | "OAUTH_PROMISE_RESOLVED_WITH_URL"
  | "OAUTH_PROMISE_RESOLVED_WITHOUT_URL"
  | "OAUTH_PROMISE_REJECTED"
  | "OAUTH_RESOLVED_AFTER_TIMEOUT"
  | "OAUTH_REJECTED_AFTER_TIMEOUT"
  | "OAUTH_TIMEOUT_FIRED"
  | "OAUTH_ERROR_RETURNED"
  | "AUTH_FETCH_STARTED"
  | "AUTH_FETCH_RESPONDED"
  | "AUTH_FETCH_REJECTED"
  | "REDIRECT_ATTEMPTED"
  | "REDIRECT_ASSIGN_FAILED"
  | "REDIRECT_NO_PAGEHIDE_AFTER_3000MS"
  | "REDIRECT_BLOCKED_CALLBACK_MISMATCH"
  | "PAGEHIDE"
  | "JAVASCRIPT_ERROR"
  | "UNHANDLED_REJECTION"
  | "DIAGNOSTIC_COPIED"
  | "DIAGNOSTIC_CLEARED";

export type OAuthDiagnosticEvent = {
  elapsedMs: number;
  code: OAuthDiagnosticCode;
  durationMs?: number;
  httpStatus?: number;
};

export type OAuthDiagnosticBridge = {
  enabled: boolean;
  version: string;
  navigationStarted?: boolean;
  record: (code: OAuthDiagnosticCode, durationMs?: number, httpStatus?: number) => void;
  read: () => OAuthDiagnosticEvent[];
  clear: () => void;
};

declare global {
  interface Window {
    __CRM_OAUTH_DIAGNOSTICS__?: OAuthDiagnosticBridge;
  }
}

const LABELS: Record<OAuthDiagnosticCode, string> = {
  DIAGNOSTIC_LOADED: "Versão de diagnóstico carregada",
  MODE_BROWSER: "Modo: navegador normal",
  MODE_STANDALONE: "Modo: PWA instalado (standalone)",
  SERVICE_WORKER_CONTROLLED: "Service worker está controlando esta página",
  SERVICE_WORKER_UNCONTROLLED: "Service worker não está controlando esta página",
  TOUCH_RECEIVED: "Evento onPressIn recebido",
  PRESS_RECEIVED: "Evento onPress recebido",
  LOGIN_HANDLER_ENTERED: "Entrada no manipulador de login da tela",
  AUTH_FUNCTION_ENTERED: "Entrada na função de login do AuthProvider",
  LOGIN_DUPLICATE_IGNORED: "Chamada duplicada ignorada pela trava de login",
  LOGIN_WAIT_MARKER_4500MS: "Mensagem visual de espera (4,5 s; não confirma etapa OAuth)",
  PENDING_INVITE_WRITE_STARTED: "Contexto temporário de convite: gravação começou",
  PENDING_INVITE_WRITE_RESOLVED: "Contexto temporário de convite: gravação terminou",
  PENDING_INVITE_WRITE_FAILED: "Contexto temporário de convite: gravação falhou (detalhes ocultos)",
  PENDING_INVITE_REMOVE_STARTED: "Contexto temporário de convite: limpeza começou",
  PENDING_INVITE_REMOVE_RESOLVED: "Contexto temporário de convite: limpeza terminou",
  PENDING_INVITE_REMOVE_FAILED: "Contexto temporário de convite: limpeza falhou (detalhes ocultos)",
  SESSION_GET_STARTED: "Inicialização: leitura da sessão começou",
  SESSION_GET_RESOLVED: "Inicialização: leitura da sessão terminou",
  SESSION_GET_REJECTED: "Inicialização: leitura da sessão rejeitada",
  AUTH_STORAGE_READ_STARTED: "Armazenamento de autenticação: leitura começou",
  AUTH_STORAGE_READ_RESOLVED: "Armazenamento de autenticação: leitura terminou",
  AUTH_STORAGE_READ_FAILED: "Armazenamento de autenticação: leitura falhou (detalhes ocultos)",
  AUTH_STORAGE_WRITE_STARTED: "Armazenamento de autenticação: gravação começou",
  AUTH_STORAGE_WRITE_RESOLVED: "Armazenamento de autenticação: gravação terminou",
  AUTH_STORAGE_WRITE_FAILED: "Armazenamento de autenticação: gravação falhou (detalhes ocultos)",
  AUTH_STORAGE_REMOVE_STARTED: "Armazenamento de autenticação: remoção começou",
  AUTH_STORAGE_REMOVE_RESOLVED: "Armazenamento de autenticação: remoção terminou",
  AUTH_STORAGE_REMOVE_FAILED: "Armazenamento de autenticação: remoção falhou (detalhes ocultos)",
  OAUTH_CALL_STARTED: "Chamada signInWithOAuth iniciada",
  OAUTH_PROMISE_RETURNED: "signInWithOAuth devolveu uma promessa",
  OAUTH_CALL_THROWN: "signInWithOAuth lançou erro antes de devolver promessa (detalhes ocultos)",
  OAUTH_TIMEOUT_ARMED: "Timeout de 12 s armado para a promessa OAuth",
  OAUTH_PROMISE_RESOLVED_WITH_URL: "Promessa OAuth resolvida; URL recebida (conteúdo oculto)",
  OAUTH_PROMISE_RESOLVED_WITHOUT_URL: "Promessa OAuth resolvida sem URL",
  OAUTH_PROMISE_REJECTED: "Promessa OAuth rejeitada (detalhes ocultos)",
  OAUTH_RESOLVED_AFTER_TIMEOUT: "Promessa OAuth resolveu depois do timeout",
  OAUTH_REJECTED_AFTER_TIMEOUT: "Promessa OAuth rejeitou depois do timeout (detalhes ocultos)",
  OAUTH_TIMEOUT_FIRED: "Timeout de 12 s disparou",
  OAUTH_ERROR_RETURNED: "Supabase retornou erro OAuth (detalhes ocultos)",
  AUTH_FETCH_STARTED: "Requisição Supabase Auth iniciada",
  AUTH_FETCH_RESPONDED: "Resposta Supabase Auth recebida",
  AUTH_FETCH_REJECTED: "Requisição Supabase Auth rejeitada (detalhes ocultos)",
  REDIRECT_ATTEMPTED: "Tentativa de navegar para autorização do Google",
  REDIRECT_ASSIGN_FAILED: "A chamada de navegação lançou erro (detalhes ocultos)",
  REDIRECT_NO_PAGEHIDE_AFTER_3000MS: "A página continuou visível 3 s após tentar navegar",
  REDIRECT_BLOCKED_CALLBACK_MISMATCH: "Navegação bloqueada: callback não aponta para esta prévia",
  PAGEHIDE: "A página começou a sair/ocultar",
  JAVASCRIPT_ERROR: "Erro JavaScript detectado (detalhes omitidos)",
  UNHANDLED_REJECTION: "Rejeição não tratada detectada (detalhes omitidos)",
  DIAGNOSTIC_COPIED: "Registro de diagnóstico copiado",
  DIAGNOSTIC_CLEARED: "Registro de diagnóstico limpo",
};

export function getOAuthDiagnosticBridge() {
  if (typeof window === "undefined") return undefined;
  return window.__CRM_OAUTH_DIAGNOSTICS__;
}

export function isOAuthDiagnosticEnabled() {
  return getOAuthDiagnosticBridge()?.enabled === true;
}

export function recordOAuthDiagnostic(
  code: OAuthDiagnosticCode,
  durationMs?: number,
  httpStatus?: number,
) {
  getOAuthDiagnosticBridge()?.record(code, durationMs, httpStatus);
}

export function getOAuthDiagnosticLabel(code: OAuthDiagnosticCode) {
  return LABELS[code];
}

export function formatOAuthDiagnosticTime(elapsedMs: number) {
  const safeElapsed = Math.max(0, Math.floor(elapsedMs));
  const minutes = Math.floor(safeElapsed / 60_000);
  const seconds = Math.floor((safeElapsed % 60_000) / 1000);
  const milliseconds = safeElapsed % 1000;
  return `+${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export function getOAuthDiagnosticText(events: OAuthDiagnosticEvent[]) {
  const bridge = getOAuthDiagnosticBridge();
  const heading = `CRM Familiar — ${bridge?.version ?? "versão desconhecida"}`;
  const lines = events.map((event) => {
    const duration = Number.isFinite(event.durationMs) ? ` (${Math.round(event.durationMs!)} ms)` : "";
    const status = Number.isInteger(event.httpStatus) ? ` — HTTP ${event.httpStatus}` : "";
    return `${formatOAuthDiagnosticTime(event.elapsedMs)} | ${getOAuthDiagnosticLabel(event.code)}${duration}${status}`;
  });
  return [heading, ...lines].join("\n");
}

export function createOAuthDiagnosticFetch(fetchImplementation: typeof fetch, supabaseUrl: string) {
  if (!isOAuthDiagnosticEnabled()) return fetchImplementation;

  let supabaseOrigin: string;
  try {
    supabaseOrigin = new URL(supabaseUrl).origin;
  } catch {
    return fetchImplementation;
  }

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    let isAuthRequest = false;
    try {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const parsedUrl = new URL(requestUrl, window.location.origin);
      isAuthRequest = parsedUrl.origin === supabaseOrigin && parsedUrl.pathname.startsWith("/auth/v1/");
    } catch {
      // A request that cannot be safely classified is passed through unobserved.
    }

    if (!isAuthRequest) return fetchImplementation(input, init);

    const startedAt = performance.now();
    recordOAuthDiagnostic("AUTH_FETCH_STARTED");
    try {
      const response = await fetchImplementation(input, init);
      recordOAuthDiagnostic("AUTH_FETCH_RESPONDED", performance.now() - startedAt, response.status);
      return response;
    } catch (error) {
      recordOAuthDiagnostic("AUTH_FETCH_REJECTED", performance.now() - startedAt);
      throw error;
    }
  }) as typeof fetch;
}

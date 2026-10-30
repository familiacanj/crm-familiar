import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import {
  formatOAuthDiagnosticTime,
  getOAuthDiagnosticBridge,
  getOAuthDiagnosticLabel,
  getOAuthDiagnosticText,
  isOAuthDiagnosticEnabled,
  recordOAuthDiagnostic,
  type OAuthDiagnosticEvent,
} from "@/src/oauthDiagnostics";
import { makeStyles } from "@/src/theme";
import { BigButton, FONT } from "@/src/ui";

const CRM_LOGO = require("../assets/images/crm-logo-light.png");
const FAMILY_PORTRAIT_TALL = require("../assets/images/family-portrait-tall.png");
const FAMILY_PORTRAIT_WIDE = require("../assets/images/family-portrait-wide.png");
const FAMILY_PORTRAIT_TALL_WEB = require("../assets/images/family-portrait-tall-web.jpg");
const FAMILY_PORTRAIT_WIDE_WEB = require("../assets/images/family-portrait-wide-web.jpg");

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function Login() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { login, error } = useAuth();
  const [busy, setBusy] = useState(false);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [androidChromeBrowser] = useState(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof navigator === "undefined") return false;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const androidChrome = /Android/i.test(navigator.userAgent)
      && /Chrome\//i.test(navigator.userAgent)
      && !/(EdgA|OPR)\//i.test(navigator.userAgent);
    return androidChrome && !standalone;
  });
  const loginNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loginStarted = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    if (isOAuthDiagnosticEnabled()) {
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      recordOAuthDiagnostic(standalone ? "MODE_STANDALONE" : "MODE_BROWSER");
      recordOAuthDiagnostic(navigator.serviceWorker?.controller ? "SERVICE_WORKER_CONTROLLED" : "SERVICE_WORKER_UNCONTROLLED");
    }

    const onBeforeInstallPrompt = (event: Event) => {
      const candidate = event as BeforeInstallPromptEvent;
      if (typeof candidate.prompt !== "function") return;
      event.preventDefault();
      setInstallPrompt(candidate);
    };
    const onInstalled = () => setInstallPrompt(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (loginNoticeTimer.current) clearTimeout(loginNoticeTimer.current);
    };
  }, []);

  const isWide = width >= 720;
  const logoWidth = Math.min(width - 40, 300);
  const logoHeight = logoWidth * (138 / 300);
  const photoAspect = isWide ? 1536 / 1024 : 1122 / 1402;
  const maxPhotoHeight = isWide
    ? Math.min(360, Math.max(280, height - 380))
    : Math.min(375, Math.max(220, height - 470));
  const photoWidth = Math.min(
    width - (isWide ? 96 : 40),
    isWide ? 720 : 340,
    maxPhotoHeight * photoAspect,
  );
  const photoHeight = photoWidth / photoAspect;
  const photoSource = Platform.OS === "web"
    ? (isWide ? FAMILY_PORTRAIT_WIDE_WEB : FAMILY_PORTRAIT_TALL_WEB)
    : (isWide ? FAMILY_PORTRAIT_WIDE : FAMILY_PORTRAIT_TALL);

  const onLogin = async (trigger: "onPressIn" | "onPress" = "onPress") => {
    if (isOAuthDiagnosticEnabled()) {
      recordOAuthDiagnostic(trigger === "onPressIn" ? "TOUCH_RECEIVED" : "PRESS_RECEIVED");
    }
    if (loginStarted.current) {
      recordOAuthDiagnostic("LOGIN_DUPLICATE_IGNORED");
      return;
    }
    recordOAuthDiagnostic("LOGIN_HANDLER_ENTERED");
    loginStarted.current = true;
    let shouldReset = Platform.OS !== "web";
    setBusy(true);
    setLoginNotice("Toque recebido. Iniciando autenticação...");
    if (loginNoticeTimer.current) clearTimeout(loginNoticeTimer.current);
    loginNoticeTimer.current = setTimeout(() => {
      recordOAuthDiagnostic("LOGIN_WAIT_MARKER_4500MS");
      setLoginNotice("Ainda aguardando a autorização do Supabase...");
    }, 4500);
    try {
      await login(undefined, setLoginNotice);
    } catch {
      // AuthProvider exposes the user-facing error without an unhandled
      // rejection reaching the browser console.
      shouldReset = true;
    } finally {
      // A successful web call has already scheduled a full-page navigation.
      // Keep the guard active so onPressIn + onPress cannot start two OAuth flows.
      if (shouldReset) {
        if (loginNoticeTimer.current) clearTimeout(loginNoticeTimer.current);
        loginNoticeTimer.current = null;
        setBusy(false);
        setLoginNotice(null);
        loginStarted.current = false;
      }
    }
  };

  const onInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } finally {
      setInstallPrompt(null);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.content, { maxWidth: isWide ? 860 : 520 }]} testID="login-screen">
        <View style={styles.brand}>
          <Image
            source={CRM_LOGO}
            style={[styles.logo, { width: logoWidth, height: logoHeight }]}
            contentFit="cover"
            contentPosition="center"
            cachePolicy="memory-disk"
          />
          <Text style={styles.tagline}>Organização financeira para a sua família</Text>
        </View>

        <Image
          source={photoSource}
          style={[styles.photo, { width: photoWidth, height: photoHeight }]}
          contentFit="cover"
          contentPosition="center"
          cachePolicy="memory-disk"
          accessibilityLabel="Família reunida"
        />

        <View style={styles.actions}>
          {error ? (
            <Text style={styles.error} testID="login-error">
              {error}
            </Text>
          ) : null}
          {loginNotice ? (
            <Text style={styles.loginStatus} testID="login-status">
              {loginNotice}
            </Text>
          ) : null}
          <BigButton
            testID="login-google-button"
            title="Entrar com Google"
            icon="google"
            onPress={() => onLogin("onPress")}
            onPressIn={androidChromeBrowser ? () => onLogin("onPressIn") : undefined}
            pressRetentionOffset={androidChromeBrowser ? 80 : undefined}
            loading={busy}
          />
          {installPrompt ? (
            <BigButton
              testID="install-app-button"
              title="Instalar aplicativo"
              icon="download"
              variant="secondary"
              onPress={onInstall}
            />
          ) : null}
          {androidChromeBrowser && !installPrompt ? (
            <Text style={styles.installHint} testID="install-menu-hint">
              Para instalar, abra o menu ⋮ do Chrome e escolha “Instalar aplicativo”.
            </Text>
          ) : null}
          <BigButton
            testID="help-center-button"
            title="Conheça o Aplicativo"
            variant="secondary"
            onPress={() => undefined}
            disabled
          />
        </View>
        <OAuthDiagnosticPanel />
      </View>
    </ScrollView>
  );
}

function OAuthDiagnosticPanel() {
  const bridge = getOAuthDiagnosticBridge();
  const [events, setEvents] = useState<OAuthDiagnosticEvent[]>(() => bridge?.enabled ? bridge.read() : []);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (!bridge?.enabled) return;
    const refresh = () => setEvents(bridge.read());
    window.addEventListener("crm-oauth-diagnostic-update", refresh);
    return () => window.removeEventListener("crm-oauth-diagnostic-update", refresh);
  }, [bridge]);

  if (!bridge?.enabled) return null;

  const copyLog = async () => {
    recordOAuthDiagnostic("DIAGNOSTIC_COPIED");
    const text = getOAuthDiagnosticText(bridge.read());
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Registro copiado. Cole aqui na conversa.");
    } catch {
      setCopyStatus("Não foi possível copiar. Selecione e copie os eventos exibidos.");
    }
  };

  const clearLog = () => {
    bridge.clear();
    recordOAuthDiagnostic("DIAGNOSTIC_CLEARED");
    setCopyStatus("Registro limpo.");
  };

  return (
    <View style={{ width: "100%", maxWidth: 620, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: "#3B825C", backgroundColor: "#F0F7F2", gap: 8 }}>
      <Text style={{ fontFamily: FONT.bold, fontSize: 16, color: "#173D2B" }}>Diagnóstico temporário do login</Text>
      <Text selectable style={{ fontFamily: FONT.regular, fontSize: 12, color: "#173D2B" }}>Versão: {bridge.version}</Text>
      <Text style={{ fontFamily: FONT.regular, fontSize: 12, lineHeight: 17, color: "#173D2B" }}>
        O retorno desta prévia depende da lista de redirecionamentos do Supabase. Nenhuma configuração será alterada. O registro omite mensagens, URLs, tokens e dados pessoais.
      </Text>
      <ScrollView nestedScrollEnabled style={{ maxHeight: 260, borderRadius: 10, backgroundColor: "#FFFFFF", padding: 8 }}>
        <Text selectable style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 17, color: "#17251D" }}>
          {events.length
            ? events.map((event) => {
                const duration = Number.isFinite(event.durationMs) ? ` (${Math.round(event.durationMs!)} ms)` : "";
                const status = Number.isInteger(event.httpStatus) ? ` — HTTP ${event.httpStatus}` : "";
                return `${formatOAuthDiagnosticTime(event.elapsedMs)} | ${getOAuthDiagnosticLabel(event.code)}${duration}${status}`;
              }).join("\n")
            : "Aguardando eventos..."}
        </Text>
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable onPress={copyLog} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#3B825C" }}>
          <Text style={{ fontFamily: FONT.bold, color: "#FFFFFF" }}>Copiar diagnóstico</Text>
        </Pressable>
        <Pressable onPress={clearLog} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "#E3ECE5" }}>
          <Text style={{ fontFamily: FONT.bold, color: "#173D2B" }}>Limpar</Text>
        </Pressable>
      </View>
      {copyStatus ? <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: "#173D2B" }}>{copyStatus}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  scrollContent: { flexGrow: 1, alignItems: "center", paddingHorizontal: 20 },
  content: { width: "100%", flex: 1, alignItems: "center", justifyContent: "space-between", gap: 28 },
  brand: { alignItems: "center", width: "100%" },
  logo: { width: 300, height: 138 },
  tagline: {
    marginTop: 16,
    fontFamily: FONT.bold,
    fontSize: 18,
    lineHeight: 24,
    color: c.onSurface,
    textAlign: "center",
    maxWidth: 340,
    paddingHorizontal: 8,
  },
  photo: {
    borderRadius: 28,
    backgroundColor: c.surfaceSecondary,
    shadowColor: c.onSurface,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  actions: { width: "100%", maxWidth: 620, gap: 12 },
  error: { fontFamily: FONT.bold, fontSize: 16, color: c.error, textAlign: "center" },
  loginStatus: { fontFamily: FONT.bold, fontSize: 15, color: c.muted, textAlign: "center" },
  installHint: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: c.muted, textAlign: "center" },
}));

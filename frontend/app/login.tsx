import { Image } from "expo-image";
import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
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

declare global {
  interface Window {
    __CRM_PWA_INSTALL__?: { prompt: BeforeInstallPromptEvent | null; installed: boolean };
  }
}

export default function Login() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { login, error, initializationFailed, retryInitialization } = useAuth();
  const [busy, setBusy] = useState(false);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    Platform.OS === "web" && typeof window !== "undefined" ? window.__CRM_PWA_INSTALL__?.prompt ?? null : null);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [standalone, setStandalone] = useState(() => Platform.OS === "web" && typeof window !== "undefined"
    && (window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
      || window.__CRM_PWA_INSTALL__?.installed === true));
  const [installPlatform] = useState<"ios" | "android" | "other">(() => {
    if (Platform.OS !== "web" || typeof navigator === "undefined") return "other";
    const ua = navigator.userAgent;
    return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
      ? "ios" : /Android/i.test(ua) ? "android" : "other";
  });
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

    const display = window.matchMedia("(display-mode: standalone)");
    const updateInstall = () => {
      const appleStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setStandalone(display.matches || appleStandalone || window.__CRM_PWA_INSTALL__?.installed === true);
      setInstallPrompt(window.__CRM_PWA_INSTALL__?.prompt ?? null);
    };
    window.addEventListener("crm-pwa-install-change", updateInstall);
    display.addEventListener?.("change", updateInstall);
    const reconcileTimer = setTimeout(updateInstall, 0);
    return () => {
      clearTimeout(reconcileTimer);
      window.removeEventListener("crm-pwa-install-change", updateInstall);
      display.removeEventListener?.("change", updateInstall);
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

  const onLogin = async () => {
    if (loginStarted.current) return;
    loginStarted.current = true;
    let shouldReset = Platform.OS !== "web";
    setBusy(true);
    setLoginNotice("Toque recebido. Iniciando autenticação...");
    if (loginNoticeTimer.current) clearTimeout(loginNoticeTimer.current);
    loginNoticeTimer.current = setTimeout(() => {
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
    if (window.__CRM_PWA_INSTALL__) window.__CRM_PWA_INSTALL__.prompt = null;
    setInstallPrompt(null);
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch {
      setInstallGuideOpen(true);
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
          {Platform.OS === "web" && initializationFailed ? (
            <BigButton
              testID="retry-startup-button"
              title="Tentar novamente"
              icon="refresh"
              variant="secondary"
              onPress={retryInitialization}
            />
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
            onPress={onLogin}
            onPressIn={androidChromeBrowser ? onLogin : undefined}
            pressRetentionOffset={androidChromeBrowser ? 80 : undefined}
            loading={busy}
          />
          {!standalone && installPrompt ? (
            <BigButton
              testID="install-app-button"
              title="Instalar CRM Familiar"
              icon="download"
              variant="secondary"
              onPress={onInstall}
            />
          ) : null}
          {Platform.OS === "web" && !standalone && !installPrompt ? (
            <>
              <BigButton
                testID="install-guide-button"
                title="Como instalar o CRM Familiar"
                icon="download"
                variant="secondary"
                onPress={() => setInstallGuideOpen((open) => !open)}
              />
              {installGuideOpen ? (
                <Text style={styles.installHint} testID="install-menu-hint">
                  {installPlatform === "ios"
                    ? "No Safari, toque em Compartilhar e escolha ‘Adicionar à Tela de Início’. Se necessário, abra este link no Safari."
                    : installPlatform === "android"
                      ? "Abra o menu ⋮ do navegador e escolha ‘Instalar aplicativo’ ou ‘Adicionar à tela inicial’. Os nomes podem variar conforme o navegador."
                      : "No menu do navegador, procure ‘Instalar aplicativo’ ou uma opção para adicionar à tela inicial."}
                </Text>
              ) : null}
            </>
          ) : null}
          <BigButton
            testID="help-center-button"
            title="Conheça o Aplicativo"
            variant="secondary"
            onPress={() => undefined}
            disabled
          />
        </View>
        <View style={styles.legalLinks} testID="login-legal-links">
          <Link href="/politica-de-privacidade" asChild>
            <Text accessibilityRole="link" style={styles.legalLink}>Política de Privacidade</Text>
          </Link>
          <Text style={styles.legalSeparator}>·</Text>
          <Link href="/termos-de-uso" asChild>
            <Text accessibilityRole="link" style={styles.legalLink}>Termos de Uso</Text>
          </Link>
        </View>
      </View>
    </ScrollView>
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
  legalLinks: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 10, paddingVertical: 12 },
  legalLink: { fontFamily: FONT.bold, fontSize: 14, color: c.onBrandSecondary, textDecorationLine: "underline" },
  legalSeparator: { fontFamily: FONT.regular, fontSize: 14, color: c.muted },
  error: { fontFamily: FONT.bold, fontSize: 16, color: c.error, textAlign: "center" },
  loginStatus: { fontFamily: FONT.bold, fontSize: 15, color: c.muted, textAlign: "center" },
  installHint: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: c.muted, textAlign: "center" },
}));

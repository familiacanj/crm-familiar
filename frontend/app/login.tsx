import { Image } from "expo-image";
import { useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { makeStyles } from "@/src/theme";
import { BigButton, FONT } from "@/src/ui";

const CRM_LOGO = require("../assets/images/crm-logo-light.png");
const FAMILY_PORTRAIT_TALL = require("../assets/images/family-portrait-tall.png");
const FAMILY_PORTRAIT_WIDE = require("../assets/images/family-portrait-wide.png");

export default function Login() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { login, error } = useAuth();
  const [busy, setBusy] = useState(false);

  const isWide = width >= 720;
  const photoWidth = Math.min(width - (isWide ? 96 : 40), isWide ? 720 : 380);
  const photoHeight = isWide ? photoWidth * (1024 / 1536) : photoWidth * (1402 / 1122);

  const onLogin = async () => {
    setBusy(true);
    try {
      await login();
    } finally {
      setBusy(false);
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
          <Image source={CRM_LOGO} style={styles.logo} contentFit="cover" contentPosition="center" />
          <Text style={styles.tagline}>Organização financeira para a sua família</Text>
        </View>

        <Image
          source={isWide ? FAMILY_PORTRAIT_WIDE : FAMILY_PORTRAIT_TALL}
          style={[styles.photo, { width: photoWidth, height: photoHeight }]}
          contentFit="cover"
          contentPosition="center"
          accessibilityLabel="Família reunida"
        />

        <View style={styles.actions}>
          {error ? (
            <Text style={styles.error} testID="login-error">
              {error}
            </Text>
          ) : null}
          <BigButton
            testID="login-google-button"
            title="Entrar com Google"
            icon="google"
            onPress={onLogin}
            loading={busy}
          />
          <BigButton
            testID="help-center-button"
            title="Conheça o Aplicativo"
            variant="secondary"
            onPress={() => undefined}
            disabled
          />
          <Text style={styles.helpNote}>Central de Ajuda em preparação.</Text>
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
    marginTop: -8,
    fontFamily: FONT.bold,
    fontSize: 18,
    lineHeight: 24,
    color: c.onSurface,
    textAlign: "center",
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
  helpNote: { fontFamily: FONT.regular, fontSize: 14, color: c.muted, textAlign: "center" },
}));

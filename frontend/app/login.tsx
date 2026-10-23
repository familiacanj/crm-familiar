import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, FONT, Icon } from "@/src/ui";

const HERO = "https://images.unsplash.com/photo-1603484477859-abe6a73f9366?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80";

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { login, error } = useAuth();
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
    setBusy(true);
    try {
      await login();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <View style={styles.hero}>
        <Image source={{ uri: HERO }} style={StyleSheetAbs} contentFit="cover" />
        <LinearGradient colors={["transparent", colors.surface]} style={StyleSheetAbs} />
        <View style={[styles.heroInner, { paddingTop: insets.top + 32 }]}>
          <View style={styles.logo}>
            <Icon name="piggy-bank" size={64} color={colors.onBrandPrimary} />
          </View>
        </View>
      </View>
      <View style={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.title}>Orçamento{"\n"}da Família</Text>
        <View style={styles.points}>
          {[
            ["cash-plus", "Anote quanto cada um ganha"],
            ["home-city", "Anote as contas da casa"],
            ["thumb-up", "Veja se sobrou ou faltou"],
          ].map(([ic, t]) => (
            <View key={t} style={styles.point}>
              <Icon name={ic as any} size={30} color={colors.brandPrimary} />
              <Text style={styles.pointText}>{t}</Text>
            </View>
          ))}
        </View>
        {error ? (
          <Text style={styles.error} testID="login-error">
            {error}
          </Text>
        ) : null}
        <BigButton testID="login-google-button" title="Entrar com Google" icon="google" onPress={onLogin} loading={busy} />
      </View>
    </View>
  );
}

const StyleSheetAbs = { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 280 },
  heroInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center",
    shadowColor: c.onSurface, shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  body: { flex: 1, paddingHorizontal: 24 },
  title: { fontFamily: FONT.xbold, fontSize: 40, lineHeight: 46, color: c.onSurface },
  points: { gap: 16, marginTop: 24, marginBottom: "auto" },
  point: { flexDirection: "row", alignItems: "center", gap: 16 },
  pointText: { fontFamily: FONT.bold, fontSize: 20, color: c.onSurface, flex: 1 },
  error: { fontFamily: FONT.bold, fontSize: 18, color: c.error, marginBottom: 12 },
}));

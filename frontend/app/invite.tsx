import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, InvitePreview, publicApi } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, FONT, haptic, Icon } from "@/src/ui";
import { storage } from "@/src/utils/storage";

export default function Invite() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const routeToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const { user, login, refreshUser } = useAuth();
  const [token, setToken] = useState(routeToken ?? "");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      void storage.getItem("pending_invite_token", "").then((saved) => {
        if (typeof saved === "string" && saved) setToken(saved);
        else {
          setLoading(false);
          setError("Este convite não contém um link válido.");
        }
      });
      return;
    }
    let active = true;
    void publicApi<InvitePreview>(`/family/invites/${encodeURIComponent(token)}`)
      .then((data) => { if (active) setPreview(data); })
      .catch((e: any) => { if (active) setError(e?.message ?? "Não foi possível carregar este convite."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/family/invites/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        body: { display_name: displayName.trim() || user?.name?.trim() || undefined },
      });
      await storage.removeItem("pending_invite_token");
      haptic("success");
      await refreshUser();
      router.replace("/");
    } catch (e: any) {
      haptic("error");
      setError(e?.message ?? "Não foi possível aceitar o convite agora.");
    } finally {
      setBusy(false);
    }
  };

  const leaveInvite = async () => {
    await storage.removeItem("pending_invite_token");
    if (Platform.OS === "web") {
      window.location.replace(`${window.location.origin}/`);
      return;
    }
    router.replace("/");
  };

  return (
    <KeyboardAwareScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
      testID="invite-screen"
    >
      <View style={styles.icon}><Icon name="account-group" size={44} color={colors.onBrandSecondary} /></View>
      <Text style={styles.title}>Convite para uma família</Text>
      {loading ? <Text style={styles.sub}>Carregando convite...</Text> : null}
      {preview ? (
        <>
          <Text style={styles.family}>{preview.family_name}</Text>
          <Text style={styles.sub}>Você recebeu um convite para participar do CRM da {preview.family_name}.</Text>
          <Text style={styles.note}>Este convite é individual, válido por 24 horas e pode ser utilizado apenas uma vez.</Text>
        </>
      ) : null}
      {error ? <Text style={styles.error} testID="invite-error">{error}</Text> : null}

      {!loading && preview && !user ? (
        <BigButton testID="invite-login-button" title="Entrar com Google" icon="google" onPress={() => login(token)} />
      ) : null}

      {!loading && preview && user ? (
        <View style={styles.confirmation}>
          <Text style={styles.confirmTitle}>Confirme sua entrada</Text>
          <Text style={styles.label}>Como você quer aparecer na família?</Text>
          <TextInput
            testID="invite-display-name-input"
            value={displayName || user?.name || ""}
            onChangeText={setDisplayName}
            style={styles.input}
            placeholder="Seu nome"
            placeholderTextColor={colors.muted}
          />
          <BigButton testID="invite-accept-button" title="Entrar na família" icon="check-bold" onPress={accept} loading={busy} disabled={!displayName.trim()} />
        </View>
      ) : null}

      <BigButton testID="invite-back-button" title="Voltar" variant="ghost" onPress={leaveInvite} />
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 24, gap: 16, width: "100%", maxWidth: 520, alignSelf: "center" },
  icon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: c.brandPrimary, alignSelf: "center" },
  title: { fontFamily: FONT.xbold, fontSize: 32, color: c.onSurface, textAlign: "center" },
  family: { fontFamily: FONT.xbold, fontSize: 28, color: c.brandPrimary, textAlign: "center" },
  sub: { fontFamily: FONT.regular, fontSize: 20, color: c.muted, textAlign: "center" },
  note: { fontFamily: FONT.regular, fontSize: 17, color: c.muted, textAlign: "center" },
  error: { fontFamily: FONT.bold, fontSize: 17, color: c.error, textAlign: "center" },
  confirmation: { gap: 10, marginTop: 8 },
  confirmTitle: { fontFamily: FONT.xbold, fontSize: 24, color: c.onSurface },
  label: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  input: { height: 60, borderRadius: 18, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.borderStrong, paddingHorizontal: 16, fontFamily: FONT.bold, fontSize: 20, color: c.onSurface },
}));

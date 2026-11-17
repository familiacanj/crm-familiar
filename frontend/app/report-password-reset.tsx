import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, setReportSessionToken } from "@/src/api";
import { BigButton, FONT } from "@/src/ui";
import { makeStyles, useTheme } from "@/src/theme";

export default function ReportPasswordReset() {
  const styles = useStyles(); const { colors } = useTheme(); const insets = useSafeAreaInsets(); const router = useRouter();
  const params = useLocalSearchParams<{ recovery_nonce?: string; report_recovery?: string }>();
  const nonce = params.recovery_nonce ?? params.report_recovery;
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (!nonce) return setError("Abra o link de recuperação enviado ao seu e-mail.");
    if (password.length < 8 || password !== confirmation) return setError("Use pelo menos 8 caracteres e confirme a mesma senha.");
    setBusy(true); setError(null);
    try {
      const result = await api<{ report_session: string }>("/reports/password/recovery-reset", { method: "POST", body: { recovery_nonce: nonce, password } });
      setReportSessionToken(result.report_session); router.replace("/(tabs)/ano");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível redefinir a senha."); }
    finally { setBusy(false); }
  };
  return <View style={styles.root}><ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Redefinir senha de relatórios</Text>
    <Text style={styles.help}>Esta senha protege a aba Ano e é diferente da senha da sua conta.</Text>
    <TextInput testID="report-reset-password" accessibilityLabel="Nova senha de relatórios" secureTextEntry autoCapitalize="none" value={password} onChangeText={setPassword} style={styles.input} placeholder="Nova senha (mínimo 8 caracteres)" placeholderTextColor={colors.muted} />
    <TextInput testID="report-reset-confirm" accessibilityLabel="Confirme a nova senha de relatórios" secureTextEntry autoCapitalize="none" value={confirmation} onChangeText={setConfirmation} style={styles.input} placeholder="Confirme a nova senha" placeholderTextColor={colors.muted} />
    <BigButton testID="report-reset-submit" title="Salvar nova senha" icon="lock-reset" onPress={() => void reset()} loading={busy} />
    {error ? <Text style={styles.error} testID="report-reset-error">{error}</Text> : null}
  </ScrollView></View>;
}

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, content: { width: "100%", maxWidth: 520, alignSelf: "center", padding: 20, gap: 14 }, title: { fontFamily: FONT.xbold, fontSize: 26, color: c.onSurface }, help: { fontFamily: FONT.regular, fontSize: 16, color: c.muted }, input: { minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, paddingHorizontal: 14, fontFamily: FONT.regular, fontSize: 16, color: c.onSurface }, error: { fontFamily: FONT.bold, color: c.error, fontSize: 15 } }));

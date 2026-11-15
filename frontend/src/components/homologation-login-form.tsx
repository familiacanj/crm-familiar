import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { isHomologationAuthEnabled } from "@/src/homologation-auth";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, FONT } from "@/src/ui";

export function HomologationLoginForm({ inviteToken }: { inviteToken?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { loginWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isHomologationAuthEnabled()) return null;

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("Informe o e-mail e a senha da conta de homologação.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await loginWithPassword(normalizedEmail, password, inviteToken);
    } catch {
      setError("Não foi possível entrar com estas credenciais de homologação.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container} testID="homologation-login-form">
      <Text style={styles.title}>Acesso de homologação</Text>
      <Text style={styles.hint}>Disponível somente neste ambiente de testes.</Text>
      <TextInput
        testID="homologation-email-input"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        placeholder="E-mail de teste"
        placeholderTextColor={colors.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />
      <TextInput
        testID="homologation-password-input"
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        placeholder="Senha de teste"
        placeholderTextColor={colors.muted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />
      {error ? <Text style={styles.error} testID="homologation-login-error">{error}</Text> : null}
      <BigButton
        testID="homologation-login-button"
        title="Entrar com e-mail"
        icon="email-outline"
        onPress={submit}
        loading={busy}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { gap: 10, padding: 16, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.borderStrong },
  title: { fontFamily: FONT.xbold, fontSize: 19, color: c.onSurface, textAlign: "center" },
  hint: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 19, color: c.muted, textAlign: "center" },
  input: { minHeight: 52, borderRadius: 14, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.borderStrong, paddingHorizontal: 14, fontFamily: FONT.bold, fontSize: 16, color: c.onSurface },
  error: { fontFamily: FONT.bold, fontSize: 14, lineHeight: 19, color: c.error, textAlign: "center" },
}));

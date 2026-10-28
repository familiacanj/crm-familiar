import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, FONT, haptic } from "@/src/ui";

export default function Onboarding() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, refreshUser, logout } = useAuth();
  const lastName = user?.name?.trim().split(" ").slice(-1)[0] ?? "";
  const [name, setName] = useState(lastName ? `Família ${lastName}` : "Minha Família");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/family", { method: "POST", body: { name } });
      haptic("success");
      await refreshUser();
    } catch (e: any) {
      haptic("error");
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
      testID="onboarding-screen"
    >
      <Text style={styles.hello}>Olá, {user?.name?.split(" ")[0]}!</Text>
      <Text style={styles.sub}>Vamos montar o orçamento da sua família.</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Nome da família</Text>
        <TextInput testID="family-name-input" value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.muted} />
        <Text style={styles.hint}>Já vamos colocar: Eu, Esposa, Filha e Mãe. Depois você pode mudar.</Text>
      </View>

      {error ? <Text style={styles.error} testID="onboarding-error">{error}</Text> : null}

      <BigButton
        testID="onboarding-submit-button"
        title="Criar família"
        icon="check-bold"
        onPress={submit}
        loading={busy}
        disabled={!name.trim()}
      />
      <BigButton testID="onboarding-logout-button" title="Sair" variant="ghost" onPress={logout} />
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 24, gap: 16, width: "100%", maxWidth: 520, alignSelf: "center" },
  hello: { fontFamily: FONT.xbold, fontSize: 36, color: c.onSurface },
  sub: { fontFamily: FONT.regular, fontSize: 20, color: c.muted },
  field: { gap: 8 },
  label: { fontFamily: FONT.bold, fontSize: 20, color: c.onSurface },
  input: {
    height: 64, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.borderStrong,
    paddingHorizontal: 16, fontFamily: FONT.bold, fontSize: 22, color: c.onSurface,
  },
  hint: { fontFamily: FONT.regular, fontSize: 18, color: c.muted },
  error: { fontFamily: FONT.bold, fontSize: 18, color: c.error },
}));

import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, FONT, haptic, Icon, Tap } from "@/src/ui";

export default function Onboarding() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, refreshUser, logout } = useAuth();
  const [mode, setMode] = useState<"create" | "join">("create");
  const lastName = user?.name?.trim().split(" ").slice(-1)[0] ?? "";
  const [name, setName] = useState(lastName ? `Família ${lastName}` : "Minha Família");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") await api("/family", { method: "POST", body: { name } });
      else await api("/family/join", { method: "POST", body: { code } });
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

      <View style={styles.options}>
        <Tap testID="onboarding-create-option" onPress={() => setMode("create")} style={[styles.option, mode === "create" && styles.optionOn]}>
          <Icon name="home-plus" size={40} color={colors.brandPrimary} />
          <Text style={styles.optionText}>Criar minha família</Text>
        </Tap>
        <Tap testID="onboarding-join-option" onPress={() => setMode("join")} style={[styles.option, mode === "join" && styles.optionOn]}>
          <Icon name="account-group" size={40} color={colors.brandPrimary} />
          <Text style={styles.optionText}>Tenho um código</Text>
        </Tap>
      </View>

      {mode === "create" ? (
        <View style={styles.field}>
          <Text style={styles.label}>Nome da família</Text>
          <TextInput testID="family-name-input" value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.muted} />
          <Text style={styles.hint}>Já vamos colocar: Eu, Esposa, Filha e Mãe. Depois você pode mudar.</Text>
        </View>
      ) : (
        <View style={styles.field}>
          <Text style={styles.label}>Código da família</Text>
          <TextInput
            testID="family-code-input"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            maxLength={6}
            placeholder="EX: AB12CD"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.codeInput]}
          />
          <Text style={styles.hint}>Peça o código para quem já criou a família.</Text>
        </View>
      )}

      {error ? <Text style={styles.error} testID="onboarding-error">{error}</Text> : null}

      <BigButton
        testID="onboarding-submit-button"
        title={mode === "create" ? "Criar família" : "Entrar na família"}
        icon="check-bold"
        onPress={submit}
        loading={busy}
        disabled={mode === "join" ? code.length < 6 : !name.trim()}
      />
      <BigButton testID="onboarding-logout-button" title="Sair" variant="ghost" onPress={logout} />
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 24, gap: 16 },
  hello: { fontFamily: FONT.xbold, fontSize: 36, color: c.onSurface },
  sub: { fontFamily: FONT.regular, fontSize: 20, color: c.muted },
  options: { flexDirection: "row", gap: 12, marginTop: 8 },
  option: {
    flex: 1, minHeight: 130, borderRadius: 20, borderWidth: 2, borderColor: c.border, backgroundColor: c.surfaceSecondary,
    alignItems: "center", justifyContent: "center", gap: 8, padding: 12,
  },
  optionOn: { borderColor: c.brandPrimary, backgroundColor: c.brandSecondary },
  optionText: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface, textAlign: "center" },
  field: { gap: 8 },
  label: { fontFamily: FONT.bold, fontSize: 20, color: c.onSurface },
  input: {
    height: 64, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.borderStrong,
    paddingHorizontal: 16, fontFamily: FONT.bold, fontSize: 22, color: c.onSurface,
  },
  codeInput: { fontFamily: FONT.mono, fontSize: 30, letterSpacing: 6, textAlign: "center" },
  hint: { fontFamily: FONT.regular, fontSize: 18, color: c.muted },
  error: { fontFamily: FONT.bold, fontSize: 18, color: c.error },
}));

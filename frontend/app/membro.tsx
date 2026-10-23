import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { parseMoney, toInput } from "@/src/format";
import { invalidateAll, useFamily } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, BigButton, FONT, haptic, Icon, Tap } from "@/src/ui";

// Member avatar colors are user data, identical in any theme.
const COLORS = ["#3B825C", "#C2185B", "#F57C00", "#6D4C41", "#1565C0", "#00838F", "#7B1FA2", "#455A64"];

export default function Membro() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const fam = useFamily();
  const existing = fam.data?.members.find((m) => m.member_id === id);
  const [name, setName] = useState(existing?.name ?? "");
  const [income, setIncome] = useState(toInput(existing?.default_income ?? 0));
  const [color, setColor] = useState(existing?.color ?? COLORS[4]);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const v = income.trim() ? parseMoney(income) : 0;
    if (!name.trim()) return setError("Digite o nome.");
    if (v === null) return setError("Digite só números. Exemplo: 2500,00");
    setBusy(true);
    try {
      const body = { name, color, default_income: v };
      if (id) await api(`/members/${id}`, { method: "PUT", body });
      else await api("/members", { method: "POST", body });
      await invalidateAll();
      haptic("success");
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDel) return setConfirmDel(true);
    setBusy(true);
    try {
      await api(`/members/${id}`, { method: "DELETE" });
      await invalidateAll();
      router.back();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="membro-screen">
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>{id ? "Mudar pessoa" : "Nova pessoa"}</Text>
        <Tap testID="membro-close-button" onPress={() => router.back()} style={styles.close}>
          <Icon name="close" size={32} color={colors.onSurface} />
        </Tap>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center" }}>
          <Avatar name={name || "?"} color={color} size={96} />
        </View>
        <Text style={styles.label}>Nome</Text>
        <TextInput testID="membro-name-input" value={name} onChangeText={setName} placeholder="Ex: Vó Maria" placeholderTextColor={colors.muted} style={styles.input} />
        <Text style={styles.label}>Quanto ganha por mês?</Text>
        <View style={styles.moneyWrap}>
          <Text style={styles.currency}>R$</Text>
          <TextInput testID="membro-income-input" value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.moneyInput} />
        </View>
        <Text style={styles.label}>Cor</Text>
        <View style={styles.colors}>
          {COLORS.map((c) => (
            <Tap key={c} testID={`membro-color-${c.slice(1)}`} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}>
              {color === c ? <Icon name="check-bold" size={26} color={colors.onBrand} /> : null}
            </Tap>
          ))}
        </View>
        {error ? <Text style={styles.error} testID="membro-error">{error}</Text> : null}
        <BigButton testID="membro-save-button" title="Salvar" icon="check-bold" onPress={save} loading={busy && !confirmDel} />
        {id ? (
          <BigButton testID="membro-delete-button" title={confirmDel ? "Toque de novo para remover" : "Remover pessoa"} icon="delete" variant="danger" onPress={remove} />
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 },
  title: { fontFamily: FONT.xbold, fontSize: 26, color: c.onSurface, paddingLeft: 8 },
  close: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24, gap: 12 },
  label: { fontFamily: FONT.bold, fontSize: 20, color: c.onSurface, marginTop: 4 },
  input: {
    height: 64, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.borderStrong,
    paddingHorizontal: 16, fontFamily: FONT.bold, fontSize: 22, color: c.onSurface,
  },
  moneyWrap: {
    flexDirection: "row", alignItems: "center", height: 72, borderRadius: 20, backgroundColor: c.surfaceSecondary,
    borderWidth: 1.5, borderColor: c.borderStrong, paddingHorizontal: 16, gap: 8,
  },
  currency: { fontFamily: FONT.xbold, fontSize: 26, color: c.muted },
  moneyInput: { flex: 1, height: 68, fontFamily: FONT.xbold, fontSize: 30, color: c.onSurface },
  colors: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  swatch: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 4, borderColor: c.onSurface },
  error: { fontFamily: FONT.bold, fontSize: 18, color: c.error },
}));

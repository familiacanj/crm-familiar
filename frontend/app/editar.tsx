import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { brl, MONTHS, parseMoney, toInput } from "@/src/format";
import { useMonth } from "@/src/month";
import { invalidateAll } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, FONT, haptic, Icon, IconCircle, Tap } from "@/src/ui";

export default function Editar() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = useLocalSearchParams<{ refType: "member" | "category"; id: string; name: string; icon: string; color: string; kind: string; value: string; def: string; overridden: string }>();
  const { year, month } = useMonth();
  const [text, setText] = useState(toInput(Number(p.value)));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recurring = p.kind === "member" || p.kind === "fixed";
  const isIncome = p.kind === "member" || p.kind === "income_extra";
  const mName = MONTHS[month - 1];

  const save = async (which: string, value: number | null, applyAll = false) => {
    setError(null);
    setBusy(which);
    try {
      await api("/entries", { method: "PUT", body: { year, month, ref_type: p.refType, ref_id: p.id, value, apply_all: applyAll } });
      await invalidateAll();
      haptic("success");
      router.back();
    } catch (e: any) {
      haptic("error");
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const withValue = (which: string, applyAll: boolean) => {
    const v = parseMoney(text);
    if (v === null) {
      haptic("error");
      return setError("Digite só números. Exemplo: 1250,50");
    }
    save(which, v, applyAll);
  };

  return (
    <View style={styles.root} testID="editar-screen">
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Tap testID="editar-close-button" onPress={() => router.back()} style={styles.close}>
          <Icon name="close" size={32} color={colors.onSurface} />
        </Tap>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          {p.kind === "member" ? (
            <View style={[styles.avatar, { backgroundColor: p.color || colors.brandPrimary }]}>
              <Text style={styles.avatarText}>{p.name?.charAt(0).toUpperCase()}</Text>
            </View>
          ) : (
            <IconCircle name={p.icon} size={72} color={isIncome ? colors.success : colors.error} bg={isIncome ? colors.successSoft : colors.surfaceTertiary} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.name} testID="editar-name">{p.name}</Text>
            <Text style={styles.month}>{mName} de {year}</Text>
          </View>
        </View>

        <Text style={styles.question}>{p.kind === "member" ? `Quanto ${p.name} ganhou?` : isIncome ? "Quanto entrou?" : "Quanto foi?"}</Text>
        <View style={styles.inputWrap}>
          <Text style={styles.currency}>R$</Text>
          <TextInput
            testID="editar-value-input"
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
            selectTextOnFocus
          />
        </View>
        {error ? <Text style={styles.error} testID="editar-error">{error}</Text> : null}

        {recurring ? (
          <>
            <BigButton testID="editar-save-all-button" title="Salvar para todo mês" icon="calendar-sync" onPress={() => withValue("all", true)} loading={busy === "all"} />
            <BigButton testID="editar-save-month-button" title={`Salvar só em ${mName}`} icon="calendar-today" variant="secondary" onPress={() => withValue("month", false)} loading={busy === "month"} />
            <Text style={styles.hint}>
              “Todo mês” muda o valor de {mName} em diante. “Só em {mName}” é para quando o valor mudou só neste mês.
            </Text>
            {p.overridden === "1" ? (
              <BigButton testID="editar-reset-button" title={`Voltar ao valor normal (${brl(Number(p.def))})`} icon="undo" variant="ghost" onPress={() => save("reset", null)} loading={busy === "reset"} />
            ) : null}
          </>
        ) : (
          <>
            <BigButton testID="editar-save-button" title="Salvar" icon="check-bold" onPress={() => withValue("month", false)} loading={busy === "month"} />
            {Number(p.value) > 0 ? (
              <BigButton testID="editar-clear-button" title="Apagar valor" icon="eraser" variant="ghost" onPress={() => save("reset", null)} loading={busy === "reset"} />
            ) : null}
          </>
        )}

        {p.refType === "category" ? (
          <Tap testID="editar-manage-category" onPress={() => router.replace({ pathname: "/categoria", params: { id: p.id } })} style={styles.link}>
            <Icon name="cog" size={22} color={colors.muted} />
            <Text style={styles.linkText}>Mudar nome, vencimento ou apagar</Text>
          </Tap>
        ) : (
          <Tap testID="editar-manage-member" onPress={() => router.replace({ pathname: "/membro", params: { id: p.id } })} style={styles.link}>
            <Icon name="cog" size={22} color={colors.muted} />
            <Text style={styles.linkText}>Mudar nome ou remover pessoa</Text>
          </Tap>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { paddingHorizontal: 16, alignItems: "flex-end" },
  close: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24, gap: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: FONT.xbold, fontSize: 32, color: c.onBrand },
  name: { fontFamily: FONT.xbold, fontSize: 26, color: c.onSurface },
  month: { fontFamily: FONT.bold, fontSize: 18, color: c.muted },
  question: { fontFamily: FONT.xbold, fontSize: 22, color: c.onSurface, marginTop: 12 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", height: 88, borderRadius: 20, borderWidth: 2, borderColor: c.brandPrimary,
    backgroundColor: c.surfaceSecondary, paddingHorizontal: 20, gap: 8,
  },
  currency: { fontFamily: FONT.xbold, fontSize: 32, color: c.muted },
  input: { flex: 1, fontFamily: FONT.xbold, fontSize: 40, color: c.onSurface, height: 84 },
  error: { fontFamily: FONT.bold, fontSize: 18, color: c.error },
  hint: { fontFamily: FONT.regular, fontSize: 16, color: c.muted },
  link: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56, justifyContent: "center" },
  linkText: { fontFamily: FONT.bold, fontSize: 17, color: c.muted },
}));

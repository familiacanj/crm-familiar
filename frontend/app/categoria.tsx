import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Category } from "@/src/api";
import { parseMoney, toInput } from "@/src/format";
import { invalidateAll, useFamily } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, BigButton, FONT, haptic, Icon, Tap } from "@/src/ui";

const ICONS = [
  "tag", "home-city", "water", "flash", "fire", "wifi", "cellphone", "car", "bus", "gas-station", "cart", "food",
  "pill", "hospital-box", "school", "television-play", "credit-card", "party-popper", "wrench", "dog", "baby-face-outline",
  "tshirt-crew", "gift", "cash-multiple", "church", "dumbbell", "airplane", "dots-horizontal-circle",
];
const KINDS = [
  { key: "fixed", label: "Conta da casa (todo mês)" },
  { key: "variable", label: "Gasto do mês" },
  { key: "income_extra", label: "Dinheiro que entrou (extra)" },
] as const;

export default function CategoriaScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories"), enabled: !!params.id });
  const existing = cats.data?.find((c) => c.category_id === params.id);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const [kind, setKind] = useState<Category["kind"]>((params.kind === "income" ? "income_extra" : (params.kind as Category["kind"])) ?? "variable");
  const [value, setValue] = useState("");
  const [owner, setOwner] = useState<string>("");
  const [dueDay, setDueDay] = useState(0);
  const fam = useFamily();
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setIcon(existing.icon);
      setKind(existing.kind);
      setValue(toInput(existing.default_value));
      setOwner(existing.member_id ?? "");
      setDueDay(existing.due_day ?? 0);
    }
  }, [existing]);

  const save = async () => {
    if (!name.trim()) return setError("Digite o nome da conta.");
    const v = value.trim() ? parseMoney(value) : 0;
    if (v === null) return setError("Digite só números. Exemplo: 150,00");
    setBusy(true);
    try {
      const member_id = kind === "income_extra" ? "" : owner;
      const due_day = kind === "income_extra" ? 0 : dueDay;
      if (params.id) await api(`/categories/${params.id}`, { method: "PUT", body: { name, icon, member_id, due_day, ...(kind === "fixed" ? { default_value: v } : {}) } });
      else await api("/categories", { method: "POST", body: { name, icon, kind, default_value: v, member_id, due_day } });
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
    try {
      await api(`/categories/${params.id}`, { method: "DELETE" });
      await invalidateAll();
      router.back();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <View style={styles.root} testID="categoria-screen">
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>{params.id ? "Mudar conta" : "Nova conta"}</Text>
        <Tap testID="categoria-close-button" onPress={() => router.back()} style={styles.close}>
          <Icon name="close" size={32} color={colors.onSurface} />
        </Tap>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Nome</Text>
        <TextInput testID="categoria-name-input" value={name} onChangeText={setName} placeholder="Ex: Academia" placeholderTextColor={colors.muted} style={styles.input} />

        {!params.id ? (
          <>
            <Text style={styles.label}>Que tipo?</Text>
            {KINDS.map((k) => (
              <Tap key={k.key} testID={`categoria-kind-${k.key}`} onPress={() => setKind(k.key)} style={[styles.kind, kind === k.key && styles.kindOn]}>
                <Icon name={kind === k.key ? "radiobox-marked" : "radiobox-blank"} size={28} color={colors.brandPrimary} />
                <Text style={styles.kindText}>{k.label}</Text>
              </Tap>
            ))}
          </>
        ) : null}

        {kind === "fixed" ? (
          <>
            <Text style={styles.label}>Valor de todo mês</Text>
            <View style={styles.moneyWrap}>
              <Text style={styles.currency}>R$</Text>
              <TextInput testID="categoria-value-input" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.moneyInput} />
            </View>
          </>
        ) : null}

        {kind !== "income_extra" ? (
          <>
            <Text style={styles.label}>Dia do vencimento</Text>
            <Text style={styles.hint}>{dueDay ? `Vence todo dia ${dueDay}. Vamos avisar na tela inicial.` : "Escolha o dia para receber o lembrete."}</Text>
            <View style={styles.days}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <Tap key={d} testID={`categoria-due-day-${d}`} onPress={() => setDueDay(d)} style={[styles.day, dueDay === d && styles.dayOn]}>
                  <Text style={[styles.dayText, dueDay === d && { color: colors.onBrandPrimary }]}>{d}</Text>
                </Tap>
              ))}
            </View>
            <Tap testID="categoria-due-day-none" onPress={() => setDueDay(0)} style={[styles.kind, dueDay === 0 && styles.kindOn]}>
              <Icon name={dueDay === 0 ? "radiobox-marked" : "radiobox-blank"} size={28} color={colors.brandPrimary} />
              <Text style={styles.kindText}>Sem vencimento</Text>
            </Tap>
          </>
        ) : null}

        {kind !== "income_extra" && fam.data ? (
          <>
            <Text style={styles.label}>De quem é este gasto?</Text>
            <View style={styles.owners}>
              {[{ member_id: "", name: "Da família toda", color: colors.brandPrimary }, ...fam.data.members].map((m) => {
                const on = owner === m.member_id;
                return (
                  <Tap key={m.member_id || "all"} testID={`categoria-owner-${m.member_id || "all"}`} onPress={() => setOwner(m.member_id)} style={[styles.owner, on && styles.ownerOn]}>
                    {m.member_id ? <Avatar name={m.name} color={m.color} size={32} /> : <Icon name="home-heart" size={28} color={colors.brandPrimary} />}
                    <Text style={styles.ownerText}>{m.name}</Text>
                  </Tap>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>Desenho</Text>
        <View style={styles.icons}>
          {ICONS.map((ic) => (
            <Tap key={ic} testID={`categoria-icon-${ic}`} onPress={() => setIcon(ic)} style={[styles.iconBtn, icon === ic && styles.iconOn]}>
              <Icon name={ic as any} size={28} color={icon === ic ? colors.onBrandPrimary : colors.onSurface} />
            </Tap>
          ))}
        </View>
        {error ? <Text style={styles.error} testID="categoria-error">{error}</Text> : null}
        <BigButton testID="categoria-save-button" title="Salvar" icon="check-bold" onPress={save} loading={busy} />
        {params.id ? (
          <BigButton testID="categoria-delete-button" title={confirmDel ? "Toque de novo para apagar" : "Apagar conta"} icon="delete" variant="danger" onPress={remove} />
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
  kind: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, borderRadius: 20, paddingHorizontal: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.border },
  kindOn: { borderColor: c.brandPrimary, backgroundColor: c.brandSecondary },
  kindText: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface, flex: 1 },
  moneyWrap: {
    flexDirection: "row", alignItems: "center", height: 72, borderRadius: 20, backgroundColor: c.surfaceSecondary,
    borderWidth: 1.5, borderColor: c.borderStrong, paddingHorizontal: 16, gap: 8,
  },
  currency: { fontFamily: FONT.xbold, fontSize: 26, color: c.muted },
  moneyInput: { flex: 1, height: 68, fontFamily: FONT.xbold, fontSize: 30, color: c.onSurface },
  icons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  owners: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  hint: { fontFamily: FONT.regular, fontSize: 17, color: c.muted },
  days: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  day: { width: 44, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  dayOn: { backgroundColor: c.brandPrimary },
  dayText: { fontFamily: FONT.xbold, fontSize: 18, color: c.onSurface },
  owner: {
    flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56, paddingHorizontal: 14, borderRadius: 999,
    backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.border,
  },
  ownerOn: { borderColor: c.brandPrimary, backgroundColor: c.brandSecondary },
  ownerText: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  iconBtn: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  iconOn: { backgroundColor: c.brandPrimary },
  error: { fontFamily: FONT.bold, fontSize: 18, color: c.error },
}));

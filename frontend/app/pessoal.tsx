import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { brl, MONTHS } from "@/src/format";
import { useMonth } from "@/src/month";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, FONT, Loading, MonthSelector, Tap } from "@/src/ui";

type PrivateKind = "income" | "fixed" | "variable";
type PrivateSummary = { items: { item_id: string; kind: PrivateKind; name: string; value: number }[]; income: number; expenses: number; balance: number };

const KINDS: { value: PrivateKind; label: string }[] = [
  { value: "income", label: "Entrada" }, { value: "fixed", label: "Conta fixa" }, { value: "variable", label: "Gasto" },
];

export default function Pessoal() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { year, month, shift } = useMonth();
  const queryClient = useQueryClient();
  const summaryQuery = useQuery({ queryKey: ["personal-summary", year, month], queryFn: () => api<PrivateSummary>(`/personal/summary/${year}/${month}`) });
  const summary = summaryQuery.data;
  const items = summary?.items ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [defaultValue, setDefaultValue] = useState("");
  const [kind, setKind] = useState<PrivateKind>("variable");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addItem = async () => {
    const parsed = Number(defaultValue.replace(/\./g, "").replace(",", ".")) || 0;
    if (!name.trim()) { setError("Informe o nome do item."); return; }
    setBusy(true); setError(null);
    try {
      await api("/personal/items", { method: "POST", body: { name: name.trim(), kind, default_value: parsed, icon: kind === "income" ? "cash-plus" : "tag" } });
      setName(""); setDefaultValue(""); await queryClient.invalidateQueries({ queryKey: ["personal-summary", year, month] });
    } catch (e: any) { setError(e?.message ?? "Não foi possível adicionar o item."); }
    finally { setBusy(false); }
  };

  const saveValue = async (item: PrivateSummary["items"][number]) => {
    const entryKey = `${year}-${month}-${item.item_id}`;
    const parsed = Number((values[entryKey] ?? String(item.value)).replace(/\./g, "").replace(",", ".")) || 0;
    setBusy(true); setError(null);
    try {
      await api(`/personal/items/${encodeURIComponent(item.item_id)}/entry`, { method: "PUT", body: { year, month, value: parsed } });
      await queryClient.invalidateQueries({ queryKey: ["personal-summary", year, month] });
    } catch (e: any) { setError(e?.message ?? "Não foi possível salvar o valor."); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.root} testID="personal-finances-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Minhas finanças privadas</Text>
        <Text style={styles.subtitle}>Visíveis somente para você. Não aparecem no orçamento nem nos relatórios compartilhados da família.</Text>
        <MonthSelector year={year} month={month} onShift={shift} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} refreshControl={<RefreshControl refreshing={summaryQuery.isRefetching} onRefresh={() => { void summaryQuery.refetch(); }} tintColor={colors.brandPrimary} />}>
        {summaryQuery.isLoading ? <Loading text="Carregando suas finanças..." /> : summary ? (
          <View style={styles.summary} testID="private-summary">
            <Text style={styles.summaryLine}>Entradas: {brl(summary.income)}</Text>
            <Text style={styles.summaryLine}>Despesas: {brl(summary.expenses)}</Text>
            <Text style={styles.balance}>Saldo pessoal de {MONTHS[month - 1]}: {brl(summary.balance)}</Text>
          </View>
        ) : null}

        <Text style={styles.section}>Meus itens</Text>
        {items.map((item) => (
          <View key={item.item_id} style={styles.item} testID={`private-item-${item.item_id}`}>
            <Text style={styles.itemName}>{item.name} · {KINDS.find((option) => option.value === item.kind)?.label}</Text>
            <View style={styles.valueRow}>
              <Text style={styles.currency}>R$</Text>
              <TextInput value={values[`${year}-${month}-${item.item_id}`] ?? String(item.value).replace(".", ",")} onChangeText={(value) => setValues((current) => ({ ...current, [`${year}-${month}-${item.item_id}`]: value }))} keyboardType="decimal-pad" style={styles.input} accessibilityLabel={`Valor de ${item.name} em ${MONTHS[month - 1]}`} />
              <BigButton testID={`private-entry-save-${item.item_id}`} title="Salvar" icon="check-bold" variant="secondary" onPress={() => void saveValue(item)} loading={busy} />
            </View>
          </View>
        ))}
        {!summaryQuery.isLoading && items.length === 0 ? <Text style={styles.empty}>Você ainda não adicionou itens pessoais.</Text> : null}

        <Text style={styles.section}>Adicionar item pessoal</Text>
        <View style={styles.itemForm}>
          <View style={styles.kindRow}>
            {KINDS.map((option) => (
              <Tap key={option.value} onPress={() => setKind(option.value)} style={[styles.kindChip, kind === option.value && styles.kindChipSelected]}>
                <Text style={[styles.kindText, kind === option.value && styles.kindTextSelected]}>{option.label}</Text>
              </Tap>
            ))}
          </View>
          <TextInput value={name} onChangeText={setName} maxLength={100} style={styles.input} placeholder="Nome do item" placeholderTextColor={colors.muted} />
          <TextInput value={defaultValue} onChangeText={setDefaultValue} keyboardType="decimal-pad" style={styles.input} placeholder="Valor mensal inicial (opcional)" placeholderTextColor={colors.muted} />
          <BigButton testID="private-item-add" title="Adicionar à minha lista" icon="plus" onPress={() => void addItem()} loading={busy} />
        </View>
        {error || summaryQuery.isError ? <View style={{ gap: 8 }}><Text style={styles.error} testID="personal-finances-error">{error ?? (summaryQuery.error instanceof Error ? summaryQuery.error.message : "Não foi possível carregar suas finanças pessoais.")}</Text><BigButton testID="personal-finances-retry" title="Tentar novamente" icon="refresh" variant="secondary" onPress={() => { setError(null); void summaryQuery.refetch(); }} /></View> : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  title: { fontFamily: FONT.xbold, fontSize: 27, color: c.onSurface },
  subtitle: { fontFamily: FONT.regular, fontSize: 16, color: c.muted },
  content: { paddingHorizontal: 16, gap: 12 },
  summary: { borderRadius: 20, backgroundColor: c.successSoft, padding: 16, gap: 4 },
  summaryLine: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  balance: { fontFamily: FONT.xbold, fontSize: 20, color: c.success, marginTop: 6 },
  section: { fontFamily: FONT.xbold, fontSize: 22, color: c.onSurface, marginTop: 8 },
  item: { borderRadius: 18, backgroundColor: c.surfaceSecondary, padding: 14, gap: 8, borderWidth: 1, borderColor: c.border },
  itemName: { fontFamily: FONT.bold, fontSize: 17, color: c.onSurface },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  currency: { fontFamily: FONT.bold, fontSize: 18, color: c.muted },
  input: { minHeight: 52, flex: 1, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, fontFamily: FONT.regular, fontSize: 17, color: c.onSurface },
  itemForm: { borderRadius: 20, backgroundColor: c.surfaceSecondary, padding: 14, gap: 10, borderWidth: 1, borderColor: c.border },
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kindChip: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: c.surfaceTertiary },
  kindChipSelected: { backgroundColor: c.brandPrimary },
  kindText: { fontFamily: FONT.bold, fontSize: 15, color: c.onSurface },
  kindTextSelected: { color: c.onBrandPrimary },
  empty: { fontFamily: FONT.regular, fontSize: 16, color: c.muted },
  error: { fontFamily: FONT.bold, fontSize: 16, color: c.error },
}));

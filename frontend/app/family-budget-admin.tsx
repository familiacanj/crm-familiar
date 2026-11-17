import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Row } from "@/src/api";
import { useAuth } from "@/src/auth";
import { brl, MONTHS } from "@/src/format";
import { DatePickerField, todayLocalIso } from "@/src/components/date-picker-field";
import { useMonth } from "@/src/month";
import { usesNativeTabs } from "@/src/navigation";
import { invalidateAll, useMonthData } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, BigButton, ErrorState, FONT, haptic, Icon, IconCircle, Loading, MonthSelector, Tap } from "@/src/ui";

type Section = "income" | "fixed" | "variable";
const CHIPS: { key: Section; label: string; icon: string }[] = [
  { key: "income", label: "Entradas", icon: "arrow-up-bold" },
  { key: "fixed", label: "Contas da casa", icon: "home-city" },
  { key: "variable", label: "Gastos do mês", icon: "cart" },
];
const HELP: Record<Section, string> = {
  income: "Quanto cada pessoa ganha. Toque para mudar.",
  fixed: "Contas que se repetem todo mês. Toque para mudar.",
  variable: "Anote o total gasto em cada item neste mês.",
};

export default function Lancar() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ section?: Section }>();
  const [section, setSection] = useState<Section>(params.section ?? "income");
  const { year, month, shift } = useMonth();
  const q = useMonthData(year, month);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  useEffect(() => {
    if (params.section) {
      // Router params are external state and must hydrate the selected family section.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSection(params.section);
    }
  }, [params.section]);

  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [cashDescription, setCashDescription] = useState("");
  const [initialCashDate] = useState(todayLocalIso);
  const [cashDate, setCashDate] = useState(initialCashDate);
  const [cashError, setCashError] = useState<string | null>(null);
  const [cashFeedback, setCashFeedback] = useState<string | null>(null);
  const [cashBusy, setCashBusy] = useState(false);
  const [leaveConfirmation, setLeaveConfirmation] = useState(false);
  const cashKey = useRef<string | null>(null);
  useEffect(() => {
    // Clear the transient confirmation when the selected month changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCopyMsg(null);
  }, [year, month]);

  const copyPrevious = async () => {
    setCopying(true);
    try {
      const r = await api<{ copied: number }>(`/month/${year}/${month}/copy-previous`, { method: "POST" });
      await invalidateAll();
      haptic("success");
      setCopyMsg(r.copied ? `Pronto! Copiamos ${r.copied} ${r.copied === 1 ? "valor" : "valores"}. Agora é só mudar o que for diferente.` : "Nada para copiar: o mês passado está vazio ou este mês já foi anotado.");
    } catch (e: any) {
      setCopyMsg(e.message);
    } finally {
      setCopying(false);
    }
  };

  const saveCashExpense = async () => {
    const amount = Number(cashAmount.trim().replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || !cashDescription.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(cashDate)) {
      setCashError("Informe a data, o valor e a descrição da despesa.");
      return;
    }
    setCashBusy(true);
    setCashError(null);
    setCashFeedback(null);
    cashKey.current ??= "family-cash:" + user?.user_id + ":" + Date.now();
    try {
      await api("/family/cash-expenses", { method: "POST", body: {
        amount, description: cashDescription.trim(), occurred_on: cashDate, category_id: null,
        idempotency_key: cashKey.current,
      } });
      cashKey.current = null;
      setCashAmount("");
      setCashDescription("");
      setCashDate(initialCashDate);
      setCashFeedback("Saída do caixa familiar registrada.");
      await invalidateAll();
    } catch (e) {
      setCashError(e instanceof Error ? e.message : "Não foi possível registrar a saída do caixa.");
    } finally {
      setCashBusy(false);
    }
  };

  const rows = q.data?.sections[section] ?? [];
  const total = rows.reduce((s, r) => s + r.value, 0);
  const isIncome = section === "income";
  const canManageFamily = user?.family_role === "owner" || user?.family_role === "admin";
  const leaveFamily = () => {
    const hasUnsavedInfo = Boolean(cashAmount.trim() || cashDescription.trim() || cashDate !== initialCashDate);
    if (hasUnsavedInfo) setLeaveConfirmation(true);
    else router.replace("/(tabs)/familia");
  };
  const confirmLeaveFamily = () => {
    setLeaveConfirmation(false);
    router.replace("/(tabs)/familia");
  };

  const openRow = (r: Row) =>
    router.push({
      pathname: "/editar",
      params: { refType: r.ref_type, id: r.id, name: r.name, icon: r.icon, color: r.color ?? "", kind: r.kind, value: String(r.value), def: String(r.default_value), overridden: r.overridden ? "1" : "0" },
    });

  if (!canManageFamily) return (
    <View style={[styles.root, { padding: 24, justifyContent: "center" }]} testID="family-budget-manager-only">
      <Text style={styles.title}>Acesso restrito</Text>
      <Text style={styles.help}>Somente o Proprietário ou Administrador pode gerenciar o orçamento familiar.</Text>
    </View>
  );

  return (
    <View style={styles.root} testID="lancar-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Tap testID="family-budget-back" onPress={leaveFamily} style={styles.backButton}>
          <Icon name="arrow-left" size={21} color={colors.brandPrimary} />
          <Text style={styles.backButtonText}>Voltar para Família</Text>
        </Tap>
        <Text style={styles.title}>Anotar valores</Text>
        <MonthSelector year={year} month={month} onShift={shift} />
      </View>
      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipContent}>
          {CHIPS.map((c) => {
            const on = c.key === section;
            return (
              <Tap
                key={c.key}
                testID={`section-chip-${c.key}`}
                onPress={() => {
                  haptic("selection");
                  setSection(c.key);
                }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Icon name={c.icon as any} size={20} color={on ? colors.onBrandPrimary : colors.onSurface} />
                <Text style={[styles.chipText, on && { color: colors.onBrandPrimary }]}>{c.label}</Text>
              </Tap>
            );
          })}
        </ScrollView>
      </View>

      {q.isLoading ? (
        <Loading text="Carregando contas..." />
      ) : q.isError ? (
        <ErrorState text="Não conseguimos carregar as contas." onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomChrome + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brandPrimary} />}
          ListHeaderComponent={
            <View style={styles.totalBox} testID="section-total">
              <Text style={styles.help}>{HELP[section]}</Text>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={[styles.totalValue, { color: isIncome ? colors.success : colors.error }]} testID="section-total-value">{brl(total)}</Text>
              {!isIncome ? (
                <View style={styles.copyBox}>
                  <BigButton testID="copy-previous-button" title={`Copiar de ${MONTHS[(month + 10) % 12]}`} icon="content-copy" variant="secondary" onPress={copyPrevious} loading={copying} />
                  {copyMsg ? <Text style={styles.copyMsg} testID="copy-previous-message">{copyMsg}</Text> : null}
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => {
            const fg = isIncome ? colors.success : colors.error;
            const sub =
              item.kind === "member" || item.kind === "fixed"
                ? item.overridden
                  ? "Valor só deste mês"
                  : item.default_value
                    ? "Igual todo mês"
                    : "Toque para anotar"
                : item.value
                  ? "Anotado neste mês"
                  : "Toque para anotar";
            return (
              <Tap testID={`row-${item.id}`} onPress={() => openRow(item)} style={styles.row}>
                {item.kind === "member" ? (
                  <Avatar name={item.name} color={item.color ?? colors.brandPrimary} size={56} photoUrl={item.photo_url} />
                ) : (
                  <IconCircle name={item.icon} color={fg} bg={isIncome ? colors.successSoft : colors.surfaceTertiary} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.rowSub}>{sub}{item.due_day ? ` · vence dia ${item.due_day}` : ""}</Text>
                </View>
                <Text style={[styles.rowValue, { color: item.value ? fg : colors.muted }]}>{brl(item.value)}</Text>
              </Tap>
            );
          }}
          ListFooterComponent={
            canManageFamily ? (
            <View style={{ gap: 12, marginTop: 8 }}>
              <BigButton testID="add-item-button" variant="secondary" icon="plus" title={isIncome ? "Adicionar pessoa ou renda" : "Adicionar nova conta"} onPress={() => isIncome ? router.push("/membro") : router.push({ pathname: "/categoria", params: { kind: section } })} />
              <View style={styles.cashCard} testID="family-cash-expense-admin">
                <Text style={styles.cashTitle}>Saída do caixa familiar</Text>
                <Text style={styles.cashHelp}>Somente Proprietário e Administrador podem registrar uma despesa paga pelo caixa.</Text>
                <Text style={styles.cashLabel}>Data</Text>
                <DatePickerField testID="family-cash-date" label="Data da saída do caixa" value={cashDate} onChange={setCashDate} />
                <Text style={styles.cashLabel}>Valor em reais</Text>
                <TextInput testID="family-cash-amount" accessibilityLabel="Valor da saída do caixa" keyboardType="decimal-pad" value={cashAmount} onChangeText={setCashAmount} style={styles.cashInput} placeholder="0,00" placeholderTextColor={colors.muted} />
                <Text style={styles.cashLabel}>Descrição</Text>
                <TextInput testID="family-cash-description" accessibilityLabel="Descrição da saída do caixa" value={cashDescription} onChangeText={setCashDescription} style={styles.cashInput} placeholder="Ex.: conta de água" placeholderTextColor={colors.muted} />
                <BigButton testID="family-cash-expense-save" title="Registrar saída do caixa" icon="cash-minus" variant="secondary" onPress={() => void saveCashExpense()} loading={cashBusy} />
                {cashError ? <Text style={styles.cashError} testID="family-cash-error">{cashError}</Text> : null}
                {cashFeedback ? <Text style={styles.cashFeedback} testID="family-cash-feedback">{cashFeedback}</Text> : null}
              </View>
            </View>
            ) : undefined
          }
        />
      )}
      <Modal visible={leaveConfirmation} transparent animationType="fade" onRequestClose={() => setLeaveConfirmation(false)}>
        <View style={styles.confirmRoot}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar confirmação" style={styles.confirmBackdrop} onPress={() => setLeaveConfirmation(false)} />
          <View style={styles.confirmCard} testID="family-budget-unsaved-confirmation">
            <Text style={styles.confirmTitle}>Há informações não salvas</Text>
            <Text style={styles.confirmBody}>Se você voltar para Família agora, os dados preenchidos para a saída do caixa serão descartados.</Text>
            <View style={styles.confirmActions}>
              <BigButton testID="family-budget-stay" title="Continuar aqui" variant="secondary" onPress={() => setLeaveConfirmation(false)} />
              <BigButton testID="family-budget-discard" title="Voltar e descartar" variant="danger" onPress={confirmLeaveFamily} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, gap: 12, backgroundColor: c.surface },
  backButton: { minHeight: 42, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: c.successSoft },
  backButtonText: { fontFamily: FONT.bold, fontSize: 15, color: c.brandPrimary },
  title: { fontFamily: FONT.xbold, fontSize: 28, color: c.onSurface },
  chipRow: { height: 64, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: c.divider },
  chipContent: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  chip: {
    flexShrink: 0, height: 44, paddingHorizontal: 16, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: c.surfaceTertiary, borderWidth: 1.5, borderColor: c.border,
  },
  chipOn: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  chipText: { fontFamily: FONT.bold, fontSize: 17, color: c.onSurface },
  list: { padding: 16, gap: 10 },
  totalBox: { paddingBottom: 8, gap: 2 },
  help: { fontFamily: FONT.regular, fontSize: 18, color: c.muted, marginBottom: 8 },
  totalLabel: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  totalValue: { fontFamily: FONT.xbold, fontSize: 32 },
  copyBox: { marginTop: 12, gap: 8 },
  copyMsg: { fontFamily: FONT.bold, fontSize: 17, color: c.onBrandSecondary, backgroundColor: c.brandSecondary, padding: 12, borderRadius: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, minHeight: 80, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: FONT.xbold, fontSize: 24, color: c.onBrand },
  rowName: { fontFamily: FONT.bold, fontSize: 19, color: c.onSurface },
  rowSub: { fontFamily: FONT.regular, fontSize: 15, color: c.muted },
  rowValue: { fontFamily: FONT.xbold, fontSize: 19 },
  cashCard: { padding: 16, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 9 },
  cashTitle: { fontFamily: FONT.xbold, fontSize: 20, color: c.onSurface },
  cashHelp: { fontFamily: FONT.regular, fontSize: 14, color: c.muted },
  cashLabel: { fontFamily: FONT.bold, fontSize: 15, color: c.onSurface },
  cashInput: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 12, fontFamily: FONT.regular, fontSize: 16, color: c.onSurface },
  cashError: { fontFamily: FONT.bold, fontSize: 15, color: c.error },
  cashFeedback: { fontFamily: FONT.bold, fontSize: 15, color: c.success },
  confirmRoot: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  confirmBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.42)" },
  confirmCard: { width: "100%", maxWidth: 440, borderRadius: 22, padding: 20, gap: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, elevation: 10 },
  confirmTitle: { fontFamily: FONT.xbold, fontSize: 20, color: c.onSurface },
  confirmBody: { fontFamily: FONT.regular, fontSize: 15, color: c.onSurface, lineHeight: 22 },
  confirmActions: { gap: 8, marginTop: 4 },
}));

import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { Modal, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api, FamilyFinancialSummary } from "@/src/api";
import { useAuth } from "@/src/auth";
import { brl, MONTHS } from "@/src/format";
import { useMonth } from "@/src/month";
import { invalidateAll, useFamilyFinancialSummary } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, BigButton, ErrorState, FONT, Loading, MonthSelector, Tap } from "@/src/ui";

type PersonalTransaction = { transaction_id: string; kind: "income" | "expense"; occurred_on: string; amount: number; personal_amount?: number; family_amount?: number; description: string; category_id?: string | null; can_edit: boolean; can_delete: boolean };
type PersonalSummary = { income: number; planned_income?: number; expenses: number; personal_expenses: number; family_paid_expenses: number; cash_transfers_out: number; total_outflows?: number; balance: number; transactions: PersonalTransaction[] };
type Area = "family" | "personal";

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ area?: string }>();
  const { user } = useAuth();
  const { year, month, shift } = useMonth();
  const [area, setArea] = useState<Area>(() => user?.family_access_revoked || params.area === "personal" ? "personal" : "family");
  useEffect(() => {
    // Router params can change when the user returns from Contas or Ano.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user?.family_access_revoked) setArea("personal");
    else if (params.area === "personal" || params.area === "family") setArea(params.area);
  }, [params.area, user?.family_access_revoked]);
  const family = useFamilyFinancialSummary(year, month, area === "family" && !user?.family_access_revoked);
  const personal = useQuery({
    queryKey: ["personal-summary", user?.user_id, year, month],
    queryFn: () => api<PersonalSummary>(`/personal/summary/${year}/${month}`),
    enabled: area === "personal",
  });
  const active = area === "family" ? family : personal;

  return (
    <View style={styles.root} testID="home-screen">
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.profileRow}>
          <Tap testID="home-profile-button" onPress={() => router.push("/perfil")}>
            {user?.picture ? <Image source={{ uri: user.picture }} style={styles.photo} contentFit="cover" /> : <Avatar name={user?.name ?? "?"} color={colors.brandPrimary} size={48} />}
          </Tap>
          <View style={{ flex: 1 }}><Text style={styles.greeting}>Olá, {user?.name?.split(" ")[0]}</Text><Text style={styles.subtitle}>Resumo de {MONTHS[month - 1]}</Text></View>
          <Tap testID="home-profile-access" onPress={() => router.push("/perfil")} style={styles.profileButton}><Text style={styles.profileButtonText}>Meu Perfil</Text></Tap>
        </View>
        <MonthSelector year={year} month={month} onShift={shift} />
        {!user?.family_access_revoked ? <View style={styles.switchRow}>
          <Tap testID="family-context-selected" onPress={() => setArea("family")} style={[styles.switchButton, area === "family" && styles.selected]}><Text style={[styles.switchText, area === "family" && styles.selectedText]}>Finanças da Família</Text></Tap>
          <Tap testID="switch-to-personal-finances" onPress={() => setArea("personal")} style={[styles.switchButton, area === "personal" && styles.selected]}><Text style={[styles.switchText, area === "personal" && styles.selectedText]}>Minhas Finanças</Text></Tap>
        </View> : <Text style={styles.revokedNotice}>Seu acesso aos dados compartilhados desta família foi encerrado. Suas finanças pessoais continuam disponíveis.</Text>}
      </View>

      {active.isLoading ? <Loading text="Carregando resumo..." /> : active.isError || !active.data ? (
        <ErrorState text="Não conseguimos carregar este resumo." onRetry={() => void active.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={() => { void active.refetch(); }} tintColor={colors.brandPrimary} />}>
          <Text style={styles.sectionTitle}>{area === "family" ? "Orçamento da Família" : "Meu orçamento"}</Text>
          {area === "family" ? <FamilySummary data={family.data!} /> : <PersonalSummaryCard data={personal.data as PersonalSummary} />}
        </ScrollView>
      )}
    </View>
  );
}

function FamilySummary({ data }: { data: FamilyFinancialSummary }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const cashOut = data.cash_out ?? data.cash_in - data.cash_delta;
  const availableBalance = data.available_balance ?? data.cash_delta;
  const contributions = data.contribution_breakdown ?? [];
  const maximumContribution = Math.max(1, ...contributions.map((item) => item.total));
  return <>
    <View style={styles.balanceCard} testID="family-summary-cash">
      <Text style={styles.cardHeading}>Saldo disponível no caixa</Text>
      <Text style={styles.balanceValue}>{brl(availableBalance)}</Text>
      <View style={styles.cashRow}><Text style={styles.cashLabel}>Saldo inicial do mês</Text><Text style={styles.cashValue}>{brl(data.opening_balance ?? 0)}</Text></View>
      <View style={styles.cashRow}><Text style={styles.cashLabel}>Dinheiro recebido neste mês</Text><Text style={styles.cashValue}>{brl(data.cash_in)}</Text></View>
      <View style={styles.cashRow}><Text style={styles.cashLabel}>Despesas pagas pelo caixa</Text><Text style={styles.cashValue}>{brl(cashOut)}</Text></View>
      <View style={styles.cashRow}><Text style={styles.cashLabel}>Despesas da casa pagas pelos integrantes</Text><Text style={styles.cashValue}>{brl(data.direct_family_expenses)}</Text></View>
    </View>
    <View style={styles.card} testID="family-contributions">
      <Text style={styles.cardHeading}>Contribuições por integrante</Text>
      <View style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: colors.brandPrimary }]} /><Text style={styles.legendText}>Dinheiro no caixa</Text><View style={[styles.legendDot, { backgroundColor: colors.brandSecondary }]} /><Text style={styles.legendText}>Despesas da casa</Text></View>
      {contributions.map((item) => <View key={item.user_id} style={styles.memberRow} testID={`contribution-${item.user_id}`}>
        <View style={styles.memberTop}><Text style={styles.memberName}>{item.name}</Text><Text style={styles.memberAmount}>{brl(item.total)}</Text></View>
        <View style={styles.memberBarTrack} accessibilityLabel={`${item.name}: contribuição em dinheiro ${brl(item.cash)}, despesas da casa ${brl(item.family_expenses)}`}>
          {item.total > 0 ? <><View style={[styles.memberBarCash, { width: `${(item.cash / maximumContribution) * 100}%`, backgroundColor: colors.brandPrimary }]} /><View style={[styles.memberBarHouse, { width: `${(item.family_expenses / maximumContribution) * 100}%`, backgroundColor: colors.brandSecondary }]} /></> : null}
        </View>
        <Text style={styles.memberDetail}>Dinheiro {brl(item.cash)} · Despesas da casa {brl(item.family_expenses)}</Text>
      </View>)}
      {!contributions.length ? <Text style={styles.bodyText}>Ainda não há integrantes para mostrar.</Text> : null}
    </View>
    <Text style={styles.note}>Despesas da casa pagas pelos integrantes não aumentam o dinheiro disponível no caixa.</Text>
  </>;
}

function PersonalSummaryCard({ data }: { data: PersonalSummary }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [editing, setEditing] = useState<PersonalTransaction | null>(null);
  const [deleting, setDeleting] = useState<PersonalTransaction | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const personalExpenses = data.personal_expenses ?? ((data.expenses ?? 0) - (data.family_paid_expenses ?? 0));
  const totalOut = data.total_outflows ?? ((data.expenses ?? (personalExpenses + data.family_paid_expenses)) + (data.cash_transfers_out ?? 0));
  const beginEdit = (item: PersonalTransaction) => {
    setEditing(item);
    setDescription(item.description);
    setAmount(String(item.amount).replace(".", ","));
    const [dateYear, dateMonth, dateDay] = item.occurred_on.slice(0, 10).split("-");
    setOccurredOn(`${dateDay}/${dateMonth}/${dateYear}`);
    setError(null);
  };
  const saveEdit = async () => {
    if (!editing) return;
    const normalized = amount.trim().includes(",") ? amount.trim().replace(/\./g, "").replace(",", ".") : amount.trim();
    const value = Number(normalized);
    const dateMatch = occurredOn.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const occurredDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : "";
    const parsedDate = dateMatch ? new Date(Date.UTC(Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1]))) : null;
    const validDate = !!dateMatch && parsedDate?.toISOString().slice(0, 10) === occurredDate;
    if (!Number.isFinite(value) || value <= 0 || !validDate || !description.trim()) {
      setError("Confira a data, a descrição e o valor do lançamento.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const endpoint = editing.kind === "income" ? "incomes" : "expenses";
      await api(`/personal/${endpoint}/${encodeURIComponent(editing.transaction_id)}`, { method: "PUT", body: editing.kind === "income"
        ? { amount: value, occurred_on: occurredDate, description: description.trim(), category_id: editing.category_id ?? null }
        : { total_amount: value, occurred_on: occurredDate, description: description.trim(), category_id: editing.category_id ?? null } });
      setEditing(null);
      await invalidateAll();
    } catch (e: any) { setError(e?.message ?? "Não foi possível salvar a alteração."); }
    finally { setSaving(false); }
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      const endpoint = deleting.kind === "income" ? "incomes" : "expenses";
      await api(`/personal/${endpoint}/${encodeURIComponent(deleting.transaction_id)}`, { method: "DELETE" });
      setDeleting(null);
      await invalidateAll();
    } catch (e: any) { setError(e?.message ?? "Não foi possível excluir o lançamento."); }
    finally { setSaving(false); }
  };
  return <>
  <View style={styles.balanceCard} testID="personal-summary">
    <Text style={styles.cardHeading}>Saldo do mês</Text>
    <Text style={styles.balanceValue}>{brl(data.balance)}</Text>
    <View style={styles.personalTotals}>
      <View style={styles.personalTotal}><Text style={styles.totalLabel}>Entrou</Text><Text style={styles.totalValue}>{brl(data.income)}</Text></View>
      <View style={styles.personalTotal}><Text style={styles.totalLabel}>Saiu</Text><Text style={styles.totalValue}>{brl(totalOut)}</Text></View>
    </View>
    <View style={styles.personalBreakdown}>
      <Text style={styles.breakdownTitle}>Despesas pessoais</Text><Text style={styles.breakdownValue}>{brl(personalExpenses)}</Text>
      <Text style={styles.breakdownTitle}>Despesas da casa pagas por você</Text><Text style={styles.breakdownValue}>{brl(data.family_paid_expenses)}</Text>
      <Text style={styles.breakdownTitle}>Transferências para o caixa familiar</Text><Text style={styles.breakdownValue}>{brl(data.cash_transfers_out ?? 0)}</Text>
    </View>
  </View>
  <View style={styles.card} testID="personal-transactions">
    <Text style={styles.cardHeading}>Lançamentos pessoais</Text>
    {!data.transactions?.length ? <Text style={styles.bodyText}>Nenhum lançamento neste mês.</Text> : data.transactions.map((item) => (
      <View key={`${item.kind}-${item.transaction_id}`} style={styles.transactionRow} testID={`personal-transaction-${item.transaction_id}`}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.transactionTitle} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.transactionMeta}>{item.kind === "income" ? "Entrada" : item.family_amount ? `Saída · casa ${brl(item.family_amount)}` : "Saída"} · {new Date(`${item.occurred_on.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR")}</Text>
        </View>
        <Text style={styles.transactionAmount}>{brl(item.amount)}</Text>
        {item.can_edit ? <Tap testID={`edit-personal-transaction-${item.transaction_id}`} onPress={() => beginEdit(item)} style={styles.transactionAction}><Text style={styles.actionText}>Editar</Text></Tap> : null}
        {item.can_delete ? <Tap testID={`delete-personal-transaction-${item.transaction_id}`} onPress={() => { setDeleting(item); setError(null); }} style={styles.transactionAction}><Text style={styles.actionText}>Excluir</Text></Tap> : null}
        {!item.can_edit && item.kind === "expense" ? <Text style={styles.transactionMeta}>Vinculado à família</Text> : null}
      </View>
    ))}
  </View>
  <Modal transparent visible={!!editing || !!deleting} animationType="fade" onRequestClose={() => { if (!saving) { setEditing(null); setDeleting(null); setError(null); } }}>
    <View style={styles.modalBackdrop}>
      <View style={[styles.editModal, { backgroundColor: colors.surface }]}>
        {editing ? <>
          <Text style={styles.cardHeading}>Editar lançamento pessoal</Text>
          <TextInput testID="personal-transaction-description" value={description} onChangeText={setDescription} placeholder="Descrição" placeholderTextColor={colors.muted} style={styles.editInput} maxLength={240} />
          <TextInput testID="personal-transaction-amount" value={amount} onChangeText={setAmount} placeholder="Valor em reais" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={styles.editInput} />
          <TextInput testID="personal-transaction-date" value={occurredOn} onChangeText={setOccurredOn} placeholder="DD/MM/AAAA" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" style={styles.editInput} />
          {error ? <Text style={styles.errorText} testID="personal-transaction-error">{error}</Text> : null}
          <BigButton testID="save-personal-transaction" title="Salvar alteração" icon="check-bold" onPress={() => void saveEdit()} loading={saving} />
          <BigButton testID="cancel-personal-transaction-edit" title="Cancelar" variant="ghost" onPress={() => setEditing(null)} disabled={saving} />
        </> : <>
          <Text style={styles.cardHeading}>Excluir lançamento?</Text>
          <Text style={styles.bodyText}>“{deleting?.description}” será removido dos saldos. O registro será preservado no histórico interno de auditoria.</Text>
          {error ? <Text style={styles.errorText} testID="personal-transaction-error">{error}</Text> : null}
          <BigButton testID="confirm-delete-personal-transaction" title="Confirmar exclusão" icon="delete" variant="danger" onPress={() => void confirmDelete()} loading={saving} />
          <BigButton testID="cancel-delete-personal-transaction" title="Manter lançamento" variant="ghost" onPress={() => setDeleting(null)} disabled={saving} />
        </>}
      </View>
    </View>
  </Modal>
  </>;
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 10, gap: 10, backgroundColor: c.surface },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  photo: { width: 48, height: 48, borderRadius: 24 },
  greeting: { fontFamily: FONT.xbold, fontSize: 24, color: c.onSurface },
  subtitle: { fontFamily: FONT.regular, fontSize: 15, color: c.muted },
  profileButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: c.successSoft },
  profileButtonText: { fontFamily: FONT.bold, fontSize: 14, color: c.brandPrimary },
  revokedNotice: { marginHorizontal: 16, marginBottom: 8, color: c.muted, fontFamily: FONT.regular, fontSize: 14 },
  switchRow: { flexDirection: "row", gap: 8 },
  switchButton: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 46, borderRadius: 16, backgroundColor: c.surfaceTertiary, paddingHorizontal: 8 },
  selected: { backgroundColor: c.brandPrimary },
  switchText: { textAlign: "center", fontFamily: FONT.bold, fontSize: 15, color: c.onSurface },
  selectedText: { color: c.onBrandPrimary },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 12 },
  sectionTitle: { fontFamily: FONT.xbold, fontSize: 24, color: c.onSurface },
  balanceCard: { borderRadius: 22, backgroundColor: c.successSoft, padding: 18, gap: 7 },
  card: { borderRadius: 20, backgroundColor: c.surfaceSecondary, padding: 16, borderWidth: 1, borderColor: c.border, gap: 8 },
  cardHeading: { fontFamily: FONT.xbold, fontSize: 20, color: c.onSurface },
  balanceValue: { fontFamily: FONT.xbold, fontSize: 34, color: c.brandPrimary },
  bodyText: { fontFamily: FONT.bold, fontSize: 16, color: c.onSurface },
  cashRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 6 },
  cashLabel: { fontFamily: FONT.regular, fontSize: 15, color: c.onSurface },
  cashValue: { fontFamily: FONT.bold, fontSize: 16, color: c.onSurface },
  legendRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, paddingBottom: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: FONT.regular, fontSize: 12, color: c.muted, marginRight: 6 },
  memberRow: { gap: 5, paddingVertical: 8, borderTopWidth: 1, borderTopColor: c.border },
  memberTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  memberName: { flex: 1, fontFamily: FONT.bold, fontSize: 16, color: c.onSurface },
  memberAmount: { fontFamily: FONT.xbold, fontSize: 16, color: c.onSurface },
  memberDetail: { fontFamily: FONT.regular, fontSize: 12, color: c.muted },
  memberBarTrack: { height: 10, width: "100%", borderRadius: 5, overflow: "hidden", backgroundColor: c.surfaceTertiary, flexDirection: "row" },
  memberBarCash: { height: 10 },
  memberBarHouse: { height: 10 },
  personalTotals: { flexDirection: "row", gap: 10, marginTop: 4 },
  personalTotal: { flex: 1, borderRadius: 14, padding: 12, backgroundColor: c.surface },
  totalLabel: { fontFamily: FONT.regular, fontSize: 14, color: c.muted },
  totalValue: { fontFamily: FONT.xbold, fontSize: 19, color: c.onSurface },
  personalBreakdown: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, gap: 4 },
  transactionRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border },
  transactionTitle: { fontFamily: FONT.bold, fontSize: 16, color: c.onSurface },
  transactionMeta: { fontFamily: FONT.regular, fontSize: 12, color: c.muted },
  transactionAmount: { fontFamily: FONT.xbold, fontSize: 15, color: c.onSurface },
  transactionAction: { paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, backgroundColor: c.surface },
  actionText: { fontFamily: FONT.bold, fontSize: 13, color: c.brandPrimary },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  editModal: { borderRadius: 22, padding: 18, gap: 12, width: "100%", maxWidth: 460, alignSelf: "center" },
  editInput: { minHeight: 50, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, color: c.onSurface, fontFamily: FONT.regular, fontSize: 16 },
  errorText: { fontFamily: FONT.bold, fontSize: 14, color: c.error },
  breakdownTitle: { fontFamily: FONT.regular, fontSize: 14, color: c.muted },
  breakdownValue: { fontFamily: FONT.bold, fontSize: 16, color: c.onSurface },
  note: { fontFamily: FONT.regular, fontSize: 14, color: c.muted },
}));

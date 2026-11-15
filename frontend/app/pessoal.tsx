import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, FamilyFinancialSummary, FamilyReimbursement } from "@/src/api";
import { useAuth } from "@/src/auth";
import { brl, MONTHS } from "@/src/format";
import { useMonth } from "@/src/month";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, FONT, Icon, Loading, MonthSelector, Tap } from "@/src/ui";

type Kind = "income" | "fixed" | "variable";
type FamilyMovementKind = "cash_contribution" | "direct_family_expense";
type FamilyTransferDirection = "personal_to_family" | "family_to_personal";
type PersonalSummary = {
  items: { item_id: string; kind: Kind; name: string; icon: string; value: number }[];
  income: number; expenses: number; balance: number;
};

const KINDS: { value: Kind; label: string }[] = [
  { value: "income", label: "Entrada" },
  { value: "fixed", label: "Conta fixa" },
  { value: "variable", label: "Gasto" },
];

function parseMoney(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN;
}

export default function PersonalFinances() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { year, month, shift } = useMonth();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<Kind>("variable");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [movementKind, setMovementKind] = useState<FamilyMovementKind>("cash_contribution");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [reimbursementRequested, setReimbursementRequested] = useState(false);
  const [ruleLabel, setRuleLabel] = useState("");
  const [ruleAmount, setRuleAmount] = useState("");
  const [ruleDay, setRuleDay] = useState("5");
  const [transferDirection, setTransferDirection] = useState<FamilyTransferDirection>("personal_to_family");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDescription, setTransferDescription] = useState("");
  const movementKey = useRef<string | null>(null);
  const ruleKey = useRef<string | null>(null);
  const transferKey = useRef<string | null>(null);
  const paymentKeys = useRef<Record<string, string>>({});
  const query = useQuery({
    queryKey: ["personal-summary", user?.user_id, year, month],
    queryFn: () => api<PersonalSummary>(`/personal/summary/${year}/${month}`),
  });
  const familySummary = useQuery({
    queryKey: ["family-financial-summary", year, month],
    queryFn: () => api<FamilyFinancialSummary>(`/family/financial-summary/${year}/${month}`),
  });
  const reimbursements = useQuery({
    queryKey: ["family-reimbursements"],
    queryFn: () => api<FamilyReimbursement[]>("/family/reimbursements"),
  });
  const data = query.data;
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["personal-summary", user?.user_id] }),
      client.invalidateQueries({ queryKey: ["family-financial-summary", year, month] }),
      client.invalidateQueries({ queryKey: ["family-reimbursements"] }),
    ]);
  };

  const addItem = async () => {
    const value = amount ? parseMoney(amount) : 0;
    if (!name.trim() || !Number.isFinite(value)) { setError("Informe um nome e um valor válido."); return; }
    setBusy(true); setError(null);
    try {
      await api("/personal/items", { method: "POST", body: { name: name.trim(), kind, default_value: value, icon: kind === "income" ? "cash-plus" : "tag" } });
      setName(""); setAmount(""); await invalidate();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o item."); }
    finally { setBusy(false); }
  };

  const saveValue = async (item: PersonalSummary["items"][number]) => {
    const value = parseMoney(drafts[item.item_id] ?? String(item.value));
    if (!Number.isFinite(value)) { setError("Informe um valor válido."); return; }
    setBusy(true); setError(null);
    try {
      await api(`/personal/items/${encodeURIComponent(item.item_id)}/entry`, { method: "PUT", body: { year, month, value } });
      await invalidate();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar o valor."); }
    finally { setBusy(false); }
  };

  const saveFamilyMovement = async () => {
    const value = parseMoney(movementAmount);
    if (!Number.isFinite(value) || !movementDescription.trim()) {
      setError("Informe o valor e a descrição da movimentação familiar.");
      return;
    }
    setBusy(true); setError(null); setFeedback(null);
    movementKey.current ??= `manual:${user?.user_id ?? "user"}:${Date.now()}`;
    try {
      const result = await api<{ reimbursement_id?: string }>("/family/financial-movements", {
        method: "POST",
        body: {
          kind: movementKind,
          amount: value,
          occurred_on: `${year}-${String(month).padStart(2, "0")}-01`,
          description: movementDescription.trim(),
          idempotency_key: movementKey.current,
          reimbursement_requested: movementKind === "direct_family_expense" && reimbursementRequested,
        },
      });
      setMovementAmount(""); setMovementDescription(""); setReimbursementRequested(false); movementKey.current = null;
      setFeedback(result.reimbursement_id ? "Despesa registrada. O pedido de reembolso ficou pendente." : "Movimentação familiar registrada.");
      await invalidate();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar a movimentação familiar."); }
    finally { setBusy(false); }
  };

  const saveContributionRule = async () => {
    const value = parseMoney(ruleAmount);
    const day = Number(ruleDay);
    if (!Number.isFinite(value) || !ruleLabel.trim() || !Number.isInteger(day) || day < 1 || day > 31) {
      setError("Informe nome, valor e um dia entre 1 e 31 para a contribuição automática.");
      return;
    }
    setBusy(true); setError(null); setFeedback(null);
    ruleKey.current ??= `rule:${user?.user_id ?? "user"}:${Date.now()}`;
    try {
      await api("/family/contribution-rules", {
        method: "POST",
        body: { label: ruleLabel.trim(), amount: value, day_of_month: day, active: true, idempotency_key: ruleKey.current },
      });
      await api(`/family/contribution-rules/materialize/${year}/${month}`, { method: "POST" });
      setRuleLabel(""); setRuleAmount(""); ruleKey.current = null;
      setFeedback("Contribuição automática salva e lançada neste mês.");
      await invalidate();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar a contribuição automática."); }
    finally { setBusy(false); }
  };

  const saveFamilyTransfer = async () => {
    const value = parseMoney(transferAmount);
    if (!Number.isFinite(value) || !transferDescription.trim()) {
      setError("Informe o valor e a descrição da transferência.");
      return;
    }
    setBusy(true); setError(null); setFeedback(null);
    transferKey.current ??= `transfer:${user?.user_id ?? "user"}:${Date.now()}`;
    try {
      await api("/family/transfers", {
        method: "POST",
        body: {
          direction: transferDirection,
          amount: value,
          occurred_on: `${year}-${String(month).padStart(2, "0")}-01`,
          description: transferDescription.trim(),
          idempotency_key: transferKey.current,
        },
      });
      setTransferAmount(""); setTransferDescription(""); transferKey.current = null;
      setFeedback("Transferência registrada uma única vez e vinculada aos dois orçamentos.");
      await invalidate();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível registrar a transferência."); }
    finally { setBusy(false); }
  };

  const payReimbursement = async (item: FamilyReimbursement) => {
    setBusy(true); setError(null); setFeedback(null);
    paymentKeys.current[item.reimbursement_id] ??= `payment:${item.reimbursement_id}`;
    try {
      await api(`/family/reimbursements/${encodeURIComponent(item.reimbursement_id)}/pay`, {
        method: "POST",
        body: { idempotency_key: paymentKeys.current[item.reimbursement_id] },
      });
      setFeedback("Reembolso pago sem criar uma nova despesa operacional.");
      await invalidate();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível pagar o reembolso."); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.root} testID="personal-finances-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Minhas Finanças</Text>
        <Text style={styles.subtitle}>Somente você pode consultar estes valores. Eles não entram no orçamento ou nos relatórios da família.</Text>
        <View style={styles.contextRow}>
          <Tap testID="personal-context-selected" style={[styles.contextChip, styles.contextSelected]}><Text style={styles.contextSelectedText}>Minhas Finanças</Text></Tap>
          <Tap testID="switch-to-family-finances" onPress={() => router.replace("/")} style={styles.contextChip}><Text style={styles.contextText}>Finanças da Família</Text></Tap>
        </View>
        <MonthSelector year={year} month={month} onShift={shift} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={colors.brandPrimary} />}
      >
        {query.isLoading ? <Loading text="Carregando suas finanças..." /> : query.isError || !data ? (
          <View style={styles.card}><Text style={styles.error}>{error ?? "Não foi possível carregar suas finanças."}</Text><BigButton testID="personal-retry" title="Tentar novamente" icon="refresh" variant="secondary" onPress={() => { void query.refetch(); }} /></View>
        ) : (
          <View style={styles.summary} testID="personal-summary">
            <Text style={styles.summaryLine}>Entradas: {brl(data.income)}</Text>
            <Text style={styles.summaryLine}>Despesas: {brl(data.expenses)}</Text>
            <Text style={styles.balance}>Saldo pessoal de {MONTHS[month - 1]}: {brl(data.balance)}</Text>
          </View>
        )}
        <Text style={styles.section}>Finanças da família</Text>
        {familySummary.data ? (
          <View style={styles.summary} testID="family-financial-summary">
            <Text style={styles.summaryLine}>Contribuições: {brl(familySummary.data.contributions)}</Text>
            <Text style={styles.summaryLine}>Transferido para a família: {brl(familySummary.data.personal_to_family_transfers)}</Text>
            <Text style={styles.summaryLine}>Transferido para o orçamento pessoal: {brl(familySummary.data.family_to_personal_transfers)}</Text>
            <Text style={styles.summaryLine}>Despesas familiares pagas por integrantes: {brl(familySummary.data.direct_family_expenses)}</Text>
            <Text style={styles.summaryLine}>Reembolsos pendentes: {brl(familySummary.data.pending_reimbursements)}</Text>
            <Text style={styles.balance}>Caixa da família: {brl(familySummary.data.cash_delta)}</Text>
          </View>
        ) : null}
        <View style={styles.card} testID="family-movement-form">
          <Text style={styles.itemName}>Registrar na família</Text>
          <View style={styles.kindRow}>
            <Tap testID="family-cash-contribution" onPress={() => { setMovementKind("cash_contribution"); setReimbursementRequested(false); }} style={[styles.contextChip, movementKind === "cash_contribution" && styles.contextSelected]}>
              <Text style={movementKind === "cash_contribution" ? styles.contextSelectedText : styles.contextText}>Contribuí em dinheiro</Text>
            </Tap>
            <Tap testID="family-direct-expense" onPress={() => setMovementKind("direct_family_expense")} style={[styles.contextChip, movementKind === "direct_family_expense" && styles.contextSelected]}>
              <Text style={movementKind === "direct_family_expense" ? styles.contextSelectedText : styles.contextText}>Paguei uma despesa</Text>
            </Tap>
          </View>
          <TextInput accessibilityLabel="Valor da movimentação familiar" keyboardType="decimal-pad" value={movementAmount} onChangeText={setMovementAmount} style={styles.input} placeholder="Valor" placeholderTextColor={colors.muted} />
          <TextInput accessibilityLabel="Descrição da movimentação familiar" maxLength={240} value={movementDescription} onChangeText={setMovementDescription} style={styles.input} placeholder={movementKind === "cash_contribution" ? "Ex.: contribuição de novembro" : "Ex.: mercado pago por mim"} placeholderTextColor={colors.muted} />
          {movementKind === "direct_family_expense" ? (
            <Tap testID="family-reimbursement-toggle" onPress={() => setReimbursementRequested((value) => !value)} style={styles.checkRow}>
              <Icon name={reimbursementRequested ? "checkbox-marked" : "checkbox-blank-outline"} size={26} color={colors.brandPrimary} />
              <Text style={styles.checkText}>Quero pedir reembolso desta despesa</Text>
            </Tap>
          ) : null}
          <BigButton testID="family-movement-save" title="Registrar movimentação" icon="check-bold" onPress={() => void saveFamilyMovement()} loading={busy} />
        </View>
        <View style={styles.card} testID="family-transfer-form">
          <Text style={styles.itemName}>Transferir entre meus orçamentos</Text>
          <Text style={styles.help}>A transferência fica vinculada nos dois lados, mas seus detalhes pessoais continuam privados.</Text>
          <View style={styles.kindRow}>
            <Tap testID="transfer-to-family" onPress={() => setTransferDirection("personal_to_family")} style={[styles.contextChip, transferDirection === "personal_to_family" && styles.contextSelected]}>
              <Text style={transferDirection === "personal_to_family" ? styles.contextSelectedText : styles.contextText}>Para a família</Text>
            </Tap>
            <Tap testID="transfer-to-personal" onPress={() => setTransferDirection("family_to_personal")} style={[styles.contextChip, transferDirection === "family_to_personal" && styles.contextSelected]}>
              <Text style={transferDirection === "family_to_personal" ? styles.contextSelectedText : styles.contextText}>Para mim</Text>
            </Tap>
          </View>
          <TextInput accessibilityLabel="Valor da transferência" keyboardType="decimal-pad" value={transferAmount} onChangeText={setTransferAmount} style={styles.input} placeholder="Valor" placeholderTextColor={colors.muted} />
          <TextInput accessibilityLabel="Descrição da transferência" maxLength={240} value={transferDescription} onChangeText={setTransferDescription} style={styles.input} placeholder="Ex.: ajuste do orçamento de novembro" placeholderTextColor={colors.muted} />
          <BigButton testID="family-transfer-save" title="Registrar transferência" icon="swap-horizontal" onPress={() => void saveFamilyTransfer()} loading={busy} variant="secondary" />
        </View>
        <View style={styles.card} testID="automatic-contribution-form">
          <Text style={styles.itemName}>Contribuição automática</Text>
          <Text style={styles.help}>Cria uma regra sua e lança apenas uma contribuição por mês, mesmo se o botão for repetido.</Text>
          <TextInput accessibilityLabel="Nome da contribuição automática" maxLength={100} value={ruleLabel} onChangeText={setRuleLabel} style={styles.input} placeholder="Ex.: salário para a casa" placeholderTextColor={colors.muted} />
          <View style={styles.valueRow}>
            <TextInput accessibilityLabel="Valor da contribuição automática" keyboardType="decimal-pad" value={ruleAmount} onChangeText={setRuleAmount} style={styles.input} placeholder="Valor" placeholderTextColor={colors.muted} />
            <TextInput accessibilityLabel="Dia da contribuição automática" keyboardType="number-pad" value={ruleDay} onChangeText={setRuleDay} style={[styles.input, styles.dayInput]} placeholder="Dia" placeholderTextColor={colors.muted} />
          </View>
          <BigButton testID="automatic-contribution-save" title="Salvar contribuição" icon="calendar-check" onPress={() => void saveContributionRule()} loading={busy} variant="secondary" />
        </View>
        {(reimbursements.data ?? []).length > 0 ? (
          <View style={styles.card} testID="family-reimbursements">
            <Text style={styles.itemName}>Reembolsos</Text>
            {(reimbursements.data ?? []).map((item) => (
              <View key={item.reimbursement_id} style={styles.reimbursementRow}>
                <View style={styles.reimbursementCopy}>
                  <Text style={styles.reimbursementDescription}>{item.description}</Text>
                  <Text style={styles.help}>{item.status === "paid" ? "Pago" : "Pendente"} · {brl(item.amount)}</Text>
                </View>
                {item.status === "pending" && (user?.family_role === "owner" || user?.family_role === "admin") ? (
                  <BigButton testID={`pay-reimbursement-${item.reimbursement_id}`} title="Pagar" icon="cash-check" variant="secondary" onPress={() => void payReimbursement(item)} loading={busy} />
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        {feedback ? <Text style={styles.feedback} testID="personal-feedback">{feedback}</Text> : null}
        <Text style={styles.section}>Meus itens deste mês</Text>
        {(data?.items ?? []).map((item) => (
          <View key={item.item_id} style={styles.card} testID={`personal-item-${item.item_id}`}>
            <Text style={styles.itemName}>{item.name} · {KINDS.find((entry) => entry.value === item.kind)?.label}</Text>
            <View style={styles.valueRow}>
              <Text style={styles.currency}>R$</Text>
              <TextInput
                accessibilityLabel={`Valor pessoal de ${item.name}`}
                keyboardType="decimal-pad"
                value={drafts[item.item_id] ?? String(item.value).replace(".", ",")}
                onChangeText={(value) => setDrafts((current) => ({ ...current, [item.item_id]: value }))}
                style={styles.input}
              />
              <BigButton testID={`personal-save-${item.item_id}`} title="Salvar" icon="check-bold" variant="secondary" loading={busy} onPress={() => void saveValue(item)} />
            </View>
          </View>
        ))}
        {!query.isLoading && data?.items.length === 0 ? <Text style={styles.empty}>Você ainda não adicionou itens pessoais.</Text> : null}
        <Text style={styles.section}>Adicionar item pessoal</Text>
        <View style={styles.card}>
          <View style={styles.kindRow}>{KINDS.map((option) => <Tap key={option.value} onPress={() => setKind(option.value)} style={[styles.contextChip, kind === option.value && styles.contextSelected]}><Text style={kind === option.value ? styles.contextSelectedText : styles.contextText}>{option.label}</Text></Tap>)}</View>
          <TextInput accessibilityLabel="Nome do item pessoal" maxLength={100} value={name} onChangeText={setName} style={styles.input} placeholder="Ex.: salário, aluguel, mercado" placeholderTextColor={colors.muted} />
          <TextInput accessibilityLabel="Valor mensal do item pessoal" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} style={styles.input} placeholder="Valor mensal inicial (opcional)" placeholderTextColor={colors.muted} />
          <BigButton testID="personal-add-item" title="Adicionar à minha lista" icon="plus" onPress={() => void addItem()} loading={busy} />
          {error ? <Text style={styles.error} testID="personal-error">{error}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  title: { fontFamily: FONT.xbold, fontSize: 28, color: c.onSurface },
  subtitle: { fontFamily: FONT.regular, fontSize: 16, color: c.muted },
  contextRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  contextChip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.surfaceTertiary },
  contextSelected: { backgroundColor: c.brandPrimary },
  contextText: { fontFamily: FONT.bold, fontSize: 15, color: c.onSurface },
  contextSelectedText: { fontFamily: FONT.bold, fontSize: 15, color: c.onBrandPrimary },
  content: { paddingHorizontal: 16, gap: 12 },
  summary: { borderRadius: 20, backgroundColor: c.successSoft, padding: 16, gap: 5 },
  summaryLine: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  balance: { fontFamily: FONT.xbold, fontSize: 20, color: c.success, marginTop: 4 },
  section: { fontFamily: FONT.xbold, fontSize: 22, color: c.onSurface, marginTop: 8 },
  card: { borderRadius: 18, backgroundColor: c.surfaceSecondary, padding: 14, gap: 10, borderWidth: 1, borderColor: c.border },
  itemName: { fontFamily: FONT.bold, fontSize: 17, color: c.onSurface },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  currency: { fontFamily: FONT.bold, fontSize: 18, color: c.muted },
  input: { minHeight: 52, flex: 1, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, fontFamily: FONT.regular, fontSize: 17, color: c.onSurface },
  dayInput: { flex: 0, width: 92 },
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  checkText: { flex: 1, fontFamily: FONT.bold, fontSize: 16, color: c.onSurface },
  reimbursementRow: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
  reimbursementCopy: { flex: 1, gap: 3 },
  reimbursementDescription: { fontFamily: FONT.bold, fontSize: 17, color: c.onSurface },
  help: { fontFamily: FONT.regular, fontSize: 15, color: c.muted },
  feedback: { fontFamily: FONT.bold, fontSize: 16, color: c.success },
  empty: { fontFamily: FONT.regular, fontSize: 16, color: c.muted },
  error: { fontFamily: FONT.bold, fontSize: 16, color: c.error },
}));

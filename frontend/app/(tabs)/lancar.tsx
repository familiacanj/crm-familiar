import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Category } from "@/src/api";
import { useAuth } from "@/src/auth";
import { DatePickerField } from "@/src/components/date-picker-field";
import { brl } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, FONT, Tap } from "@/src/ui";

type FormKind = "income" | "expense";
type ExpenseScope = "personal" | "family" | "mixed";

function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function money(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : NaN;
}

export default function Accounts() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [kind, setKind] = useState<FormKind>(() => params.kind === "expense" ? "expense" : "income");
  const [transferMode, setTransferMode] = useState(false);
  const [date, setDate] = useState(localToday);
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [place, setPlace] = useState("");
  const [whatBought, setWhatBought] = useState("");
  const [scope, setScope] = useState<ExpenseScope | null>(null);
  const [houseAmount, setHouseAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const incomeKey = useRef<string | null>(null);
  const incomeFingerprint = useRef<string | null>(null);
  const expenseKey = useRef<string | null>(null);
  const expenseFingerprint = useRef<string | null>(null);
  const transferKey = useRef<string | null>(null);
  const transferFingerprint = useRef<string | null>(null);
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories"), enabled: !transferMode && kind === "expense" });

  const invalidate = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["personal-summary", user?.user_id] }),
    queryClient.invalidateQueries({ queryKey: ["family-financial-summary"] }),
  ]);

  const chooseKind = (next: FormKind) => {
    setKind(next);
    setTransferMode(false);
    setError(null);
    setFeedback(null);
  };

  const chooseTransfer = () => {
    setTransferMode(true);
    setError(null);
    setFeedback(null);
  };

  const submit = async () => {
    const value = money(amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) {
      setError("Informe uma data válida e o valor em reais.");
      return;
    }
    if (!transferMode && kind === "income" && !source.trim()) {
      setError("Informe de onde veio o dinheiro.");
      return;
    }
    if (!transferMode && kind === "expense" && (!place.trim() || !scope)) {
      setError("Informe onde gastou e escolha o tipo de despesa.");
      return;
    }

    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      if (transferMode) {
        const fingerprint = `${date}|${value.toFixed(2)}`;
        if (!transferKey.current || transferFingerprint.current !== fingerprint) {
          transferKey.current = `family-transfer:${user?.user_id}:${Date.now()}`;
          transferFingerprint.current = fingerprint;
        }
        await api("/family/transfers", { method: "POST", body: {
          direction: "personal_to_family",
          amount: value,
          occurred_on: date,
          description: "Transferência para o caixa familiar",
          idempotency_key: transferKey.current,
        } });
        transferKey.current = null;
        transferFingerprint.current = null;
        setFeedback("Transferência salva uma vez no seu saldo e no caixa familiar.");
      } else if (kind === "income") {
        const fingerprint = `${date}|${value.toFixed(2)}|${source.trim()}`;
        if (!incomeKey.current || incomeFingerprint.current !== fingerprint) {
          incomeKey.current = `income:${user?.user_id}:${Date.now()}`;
          incomeFingerprint.current = fingerprint;
        }
        await api("/personal/incomes", { method: "POST", body: {
          amount: value,
          description: source.trim(),
          occurred_on: date,
          category_id: null,
          idempotency_key: incomeKey.current,
        } });
        incomeKey.current = null;
        incomeFingerprint.current = null;
        setFeedback("Entrada salva.");
        setSource("");
      } else {
        const house = scope === "personal" ? 0 : scope === "family" ? value : money(houseAmount);
        if (!Number.isFinite(house) || house < 0 || house > value || (scope === "mixed" && (house === 0 || house === value))) {
          setError("Confira o valor destinado à casa.");
          return;
        }
        const description = `${place.trim()}${whatBought.trim() ? ` — ${whatBought.trim()}` : ""}`.slice(0, 240);
        const fingerprint = `${date}|${value.toFixed(2)}|${description}|${scope}|${house.toFixed(2)}|${categoryId ?? ""}`;
        if (!expenseKey.current || expenseFingerprint.current !== fingerprint) {
          expenseKey.current = `expense:${user?.user_id}:${Date.now()}`;
          expenseFingerprint.current = fingerprint;
        }
        await api("/personal/expenses", { method: "POST", body: {
          scope,
          total_amount: value,
          personal_amount: value - house,
          family_amount: house,
          occurred_on: date,
          description,
          category_id: categoryId,
          idempotency_key: expenseKey.current,
        } });
        expenseKey.current = null;
        expenseFingerprint.current = null;
        setFeedback(house > 0 ? `Saída salva uma vez. ${brl(house)} da casa foram refletidos automaticamente na família.` : "Saída pessoal salva.");
        setPlace("");
        setWhatBought("");
        setScope(null);
        setHouseAmount("");
        setCategoryId(null);
      }
      setAmount("");
      await invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o lançamento.");
    } finally {
      setBusy(false);
    }
  };

  const value = money(amount);
  const house = scope === "personal" ? 0 : scope === "family" ? value : money(houseAmount);
  const personal = Number.isFinite(value) && Number.isFinite(house) ? value - house : NaN;
  return <View style={styles.root} testID="accounts-screen">
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <Text style={styles.title}>Contas</Text>
      <View style={styles.kindRow} accessibilityRole="radiogroup" accessibilityLabel="Tipo de lançamento">
        <Tap testID="accounts-kind-income" onPress={() => chooseKind("income")} style={[styles.kindChip, kind === "income" && styles.kindSelected]}>
          <Text style={[styles.kindText, kind === "income" && styles.kindTextSelected]}>Entrada</Text>
        </Tap>
        <Tap testID="accounts-kind-expense" onPress={() => chooseKind("expense")} style={[styles.kindChip, kind === "expense" && styles.kindSelected]}>
          <Text style={[styles.kindText, kind === "expense" && styles.kindTextSelected]}>Saída</Text>
        </Tap>
      </View>
      <Tap testID="accounts-transfer-to-family" onPress={chooseTransfer} style={[styles.transferAction, transferMode && styles.transferActionSelected]}>
        <Text style={[styles.transferActionText, transferMode && styles.transferActionTextSelected]}>Transferir para a família</Text>
      </Tap>
    </View>

    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.card} testID={transferMode ? "account-form-transfer" : `account-form-${kind}`}>
        <Text style={styles.cardTitle}>{transferMode ? "Transferir para o caixa familiar" : kind === "income" ? "Nova entrada" : "Nova saída"}</Text>
        <Text style={styles.label}>Data</Text>
        <DatePickerField testID="account-date" label="Data" value={date} onChange={setDate} />
        <Text style={styles.label}>Valor em reais</Text>
        <TextInput testID="account-amount" accessibilityLabel="Valor em reais" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} style={styles.input} placeholder="0,00" placeholderTextColor={colors.muted} />

        {transferMode ? <Text style={styles.transferHint}>O valor será debitado uma vez das suas finanças e creditado uma vez no caixa da família.</Text> : kind === "income" ? <>
          <Text style={styles.label}>De onde veio o dinheiro?</Text>
          <TextInput testID="account-source" accessibilityLabel="De onde veio o dinheiro?" maxLength={240} value={source} onChangeText={setSource} style={styles.input} placeholder="Ex.: salário, faxina, serviço extra" placeholderTextColor={colors.muted} />
        </> : <>
          <Text style={styles.label}>Onde você gastou?</Text>
          <TextInput testID="account-place" accessibilityLabel="Onde você gastou?" maxLength={180} value={place} onChangeText={(text) => { setPlace(text); setCategoryId(null); }} style={styles.input} placeholder="Ex.: mercado, shopping, farmácia" placeholderTextColor={colors.muted} />
          {categories.data?.length ? <View style={styles.categoryRow} testID="expense-category-shortcuts">
            {categories.data.map((category) => <Tap key={category.category_id} testID={`expense-category-${category.category_id}`} onPress={() => { setPlace(category.name); setCategoryId(category.category_id); }} style={[styles.categoryChip, categoryId === category.category_id && styles.categorySelected]}>
              <Text style={[styles.categoryText, categoryId === category.category_id && styles.categoryTextSelected]}>{category.name}</Text>
            </Tap>)}
          </View> : null}
          <Text style={styles.label}>O que você comprou? <Text style={styles.optional}>(opcional)</Text></Text>
          <TextInput testID="account-what-bought" accessibilityLabel="O que você comprou? (opcional)" maxLength={180} value={whatBought} onChangeText={setWhatBought} style={styles.input} placeholder="Ex.: roupas e itens para casa" placeholderTextColor={colors.muted} />
          <Text style={styles.label}>Tipo de despesa</Text>
          <View style={styles.scopeList} accessibilityRole="radiogroup" accessibilityLabel="Tipo de despesa">
            {(["personal", "family", "mixed"] as ExpenseScope[]).map((item) => {
              const selected = scope === item;
              const label = item === "personal" ? "Despesa pessoal" : item === "family" ? "Despesa da casa" : "Parte pessoal e parte da casa";
              return <Tap key={item} testID={`expense-scope-${item}`} onPress={() => { setScope(item); setHouseAmount(""); }} style={[styles.scopeChoice, selected && styles.scopeChoiceSelected]}>
                <View style={[styles.radio, selected && styles.radioSelected]} />
                <Text style={[styles.scopeText, selected && styles.scopeTextSelected]}>{label}</Text>
              </Tap>;
            })}
          </View>
          {scope === "mixed" ? <>
            <Text style={styles.label}>Quanto desse valor foi para a casa?</Text>
            <TextInput testID="expense-house-amount" accessibilityLabel="Quanto desse valor foi para a casa?" keyboardType="decimal-pad" value={houseAmount} onChangeText={setHouseAmount} style={styles.input} placeholder="0,00" placeholderTextColor={colors.muted} />
          </> : null}
          {scope ? <View style={styles.splitSummary} testID="expense-split-summary">
            <Text style={styles.summaryTitle}>Resumo da saída</Text>
            <View style={styles.splitLine}><Text style={styles.splitLabel}>Pessoal</Text><Text style={styles.splitValue}>{Number.isFinite(personal) && personal >= 0 ? brl(personal) : "—"}</Text></View>
            <View style={styles.splitLine}><Text style={styles.splitLabel}>Casa</Text><Text style={styles.splitValue}>{Number.isFinite(house) ? brl(house) : "—"}</Text></View>
            <View style={[styles.splitLine, styles.splitTotal]}><Text style={styles.splitLabel}>Total lançado uma única vez</Text><Text style={styles.splitValue}>{Number.isFinite(value) ? brl(value) : "—"}</Text></View>
          </View> : null}
        </>}

        <BigButton testID="account-save" title={transferMode ? "Transferir para a família" : kind === "income" ? "Salvar entrada" : "Salvar saída"} icon={transferMode ? "bank-transfer" : kind === "income" ? "cash-plus" : "cash-minus"} onPress={() => void submit()} loading={busy} />
        {error ? <Text style={styles.error} testID="account-error">{error}</Text> : null}
        {feedback ? <Text style={styles.feedback} testID="account-feedback">{feedback}</Text> : null}
      </View>
    </ScrollView>
  </View>;
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 8, gap: 12, backgroundColor: c.surface },
  title: { fontFamily: FONT.xbold, fontSize: 28, color: c.onSurface },
  kindRow: { flexDirection: "row", gap: 10 },
  kindChip: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, borderRadius: 16, backgroundColor: c.surfaceTertiary, paddingHorizontal: 14 },
  kindSelected: { backgroundColor: c.brandPrimary },
  kindText: { fontFamily: FONT.bold, fontSize: 16, color: c.onSurface },
  kindTextSelected: { color: c.onBrandPrimary },
  transferAction: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: c.successSoft },
  transferActionSelected: { backgroundColor: c.brandPrimary },
  transferActionText: { fontFamily: FONT.bold, fontSize: 14, color: c.brandPrimary },
  transferActionTextSelected: { color: c.onBrandPrimary },
  transferHint: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: c.muted },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  card: { padding: 16, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 10 },
  cardTitle: { fontFamily: FONT.xbold, fontSize: 22, color: c.onSurface, marginBottom: 2 },
  label: { fontFamily: FONT.bold, fontSize: 15, color: c.onSurface },
  optional: { fontFamily: FONT.regular, fontSize: 14, color: c.muted },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 13, fontFamily: FONT.regular, fontSize: 16, color: c.onSurface },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  categoryChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: c.surfaceTertiary },
  categorySelected: { backgroundColor: c.brandPrimary },
  categoryText: { fontFamily: FONT.bold, fontSize: 13, color: c.onSurface },
  categoryTextSelected: { color: c.onBrandPrimary },
  scopeList: { gap: 7 },
  scopeChoice: { minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12 },
  scopeChoiceSelected: { borderColor: c.brandPrimary, backgroundColor: c.successSoft },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.muted },
  radioSelected: { borderColor: c.brandPrimary, backgroundColor: c.brandPrimary },
  scopeText: { flex: 1, fontFamily: FONT.bold, fontSize: 15, color: c.onSurface },
  scopeTextSelected: { color: c.brandPrimary },
  splitSummary: { borderRadius: 14, backgroundColor: c.successSoft, padding: 13, gap: 5 },
  summaryTitle: { fontFamily: FONT.xbold, fontSize: 16, color: c.onSurface, paddingBottom: 2 },
  splitLine: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  splitLabel: { fontFamily: FONT.regular, fontSize: 14, color: c.onSurface },
  splitValue: { fontFamily: FONT.bold, fontSize: 14, color: c.onSurface },
  splitTotal: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 5, marginTop: 2 },
  error: { fontFamily: FONT.bold, fontSize: 15, color: c.error },
  feedback: { fontFamily: FONT.bold, fontSize: 15, color: c.success },
}));

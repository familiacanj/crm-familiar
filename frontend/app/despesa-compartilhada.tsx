import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Category } from "@/src/api";
import { useMonth } from "@/src/month";
import { invalidateAll } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, FONT, Loading, Tap } from "@/src/ui";

export default function DespesaCompartilhada() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { year, month } = useMonth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Category[]>("/categories").then((all) => {
      const expenses = all.filter((item) => item.kind === "fixed" || item.kind === "variable");
      setCategories(expenses);
      setCategoryId(expenses[0]?.category_id ?? "");
    }).catch((e: any) => setError(e?.message ?? "Não foi possível carregar as contas.")).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    const value = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!categoryId || !Number.isFinite(value) || value <= 0) { setError("Escolha uma conta e informe um valor maior que zero."); return; }
    setBusy(true); setError(null);
    try {
      await api("/shared-expenses", { method: "POST", body: { category_id: categoryId, year, month, amount: value, description } });
      await invalidateAll();
      router.back();
    } catch (e: any) { setError(e?.message ?? "Não foi possível salvar a despesa."); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.root} testID="shared-expense-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Nova despesa compartilhada</Text>
        <Text style={styles.subtitle}>Depois de salvar, você não poderá editar ou excluir este lançamento. A solicitação de correção será adicionada em uma etapa futura.</Text>
      </View>
      {loading ? <Loading text="Carregando contas..." /> : categories.length === 0 ? (
        <View style={styles.content}><Text style={styles.error} testID="shared-expense-error">{error ?? "A família ainda não tem contas para registrar despesas."}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.label}>Conta</Text>
          <View style={styles.categories}>
            {categories.map((category) => (
              <Tap key={category.category_id} testID={`shared-category-${category.category_id}`} onPress={() => setCategoryId(category.category_id)} style={[styles.category, categoryId === category.category_id && styles.categorySelected]}>
                <Text style={[styles.categoryText, categoryId === category.category_id && styles.categoryTextSelected]}>{category.name}</Text>
              </Tap>
            ))}
          </View>
          <Text style={styles.label}>Valor</Text>
          <TextInput testID="shared-expense-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.input} placeholder="R$ 0,00" placeholderTextColor={colors.muted} />
          <Text style={styles.label}>Descrição (opcional)</Text>
          <TextInput testID="shared-expense-description" value={description} onChangeText={setDescription} maxLength={240} style={styles.input} placeholder="Ex.: compra do mercado" placeholderTextColor={colors.muted} />
          {error ? <Text style={styles.error} testID="shared-expense-error">{error}</Text> : null}
          <BigButton testID="shared-expense-save" title="Salvar lançamento compartilhado" icon="check-bold" onPress={() => void save()} loading={busy} />
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { padding: 18, gap: 8 },
  title: { fontFamily: FONT.xbold, fontSize: 25, color: c.onSurface },
  subtitle: { fontFamily: FONT.regular, fontSize: 16, color: c.muted },
  content: { padding: 18, gap: 10 },
  label: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface, marginTop: 8 },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  category: { borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, padding: 12 },
  categorySelected: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  categoryText: { fontFamily: FONT.bold, fontSize: 16, color: c.onSurface },
  categoryTextSelected: { color: c.onBrandPrimary },
  input: { minHeight: 56, borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, fontFamily: FONT.regular, fontSize: 18, color: c.onSurface },
  error: { fontFamily: FONT.bold, fontSize: 16, color: c.error },
}));

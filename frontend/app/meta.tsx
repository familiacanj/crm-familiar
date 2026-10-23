import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { brl, MONTHS, MONTHS_SHORT, parseMoney, toInput } from "@/src/format";
import { useMonth } from "@/src/month";
import { invalidateAll, useGoals } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, FONT, haptic, Icon, IconCircle, MonthSelector, Tap } from "@/src/ui";

const ICONS = ["airplane", "beach", "home-heart", "car", "school", "shield-check", "gift", "cellphone", "sofa", "ring", "hospital-box", "piggy-bank"];
const CHART_H = 110;

export default function Meta() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goals = useGoals();
  const goal = goals.data?.find((g) => g.goal_id === id);
  const { year, month, shift } = useMonth();
  const [editing, setEditing] = useState(!id);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [deposit, setDeposit] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = goal?.deposits.find((d) => d.year === year && d.month === month)?.amount ?? 0;

  useEffect(() => {
    if (goal) {
      setName(goal.name);
      setTarget(toInput(goal.target));
      setIcon(goal.icon);
    }
  }, [goal]);

  useEffect(() => setDeposit(toInput(current)), [current, year, month]);

  const run = async (key: string, fn: () => Promise<unknown>, close = false) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await invalidateAll();
      haptic("success");
      if (close) router.back();
    } catch (e: any) {
      haptic("error");
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const saveGoal = () => {
    const t = parseMoney(target);
    if (!name.trim()) return setError("Digite o nome da meta.");
    if (!t) return setError("Digite o valor da meta. Exemplo: 5000");
    run("goal", async () => {
      if (id) await api(`/goals/${id}`, { method: "PUT", body: { name, icon, target: t } });
      else await api("/goals", { method: "POST", body: { name, icon, target: t } });
      if (id) setEditing(false);
    }, !id);
  };

  const saveDeposit = () => {
    const v = deposit.trim() ? parseMoney(deposit) : 0;
    if (v === null) return setError("Digite só números. Exemplo: 300");
    run("deposit", () => api(`/goals/${id}/deposit`, { method: "PUT", body: { year, month, amount: v } }));
  };

  const remove = () => {
    if (!confirmDel) return setConfirmDel(true);
    run("delete", () => api(`/goals/${id}`, { method: "DELETE" }), true);
  };

  // Deposits of the selected year for the monthly chart
  const yearDeps = Array.from({ length: 12 }, (_, i) => goal?.deposits.find((d) => d.year === year && d.month === i + 1)?.amount ?? 0);
  const max = Math.max(1, ...yearDeps);

  return (
    <View style={styles.root} testID="meta-screen">
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title} numberOfLines={1}>{id ? goal?.name ?? "Meta" : "Nova meta"}</Text>
        <Tap testID="meta-close-button" onPress={() => router.back()} style={styles.close}>
          <Icon name="close" size={32} color={colors.onSurface} />
        </Tap>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        {goal && !editing ? (
          <>
            <View style={styles.hero} testID="meta-progress">
              <IconCircle name={goal.icon} size={72} color={colors.onBrandTertiary} bg={colors.surfaceSecondary} />
              <Text style={styles.heroValue} testID="meta-saved-value">{brl(goal.saved)}</Text>
              <Text style={styles.heroSub}>guardados de {brl(goal.target)}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(goal.pct, 1) * 100}%` }]} />
              </View>
              <Text style={styles.heroPct}>
                {goal.pct >= 1 ? "Meta alcançada! Parabéns!" : `${Math.round(goal.pct * 100)}% — faltam ${brl(goal.target - goal.saved)}`}
              </Text>
            </View>

            <Text style={styles.label}>Quanto guardaram neste mês?</Text>
            <MonthSelector year={year} month={month} onShift={shift} />
            <View style={styles.moneyWrap}>
              <Text style={styles.currency}>R$</Text>
              <TextInput testID="meta-deposit-input" value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.moneyInput} />
            </View>
            {error ? <Text style={styles.error} testID="meta-error">{error}</Text> : null}
            <BigButton testID="meta-deposit-save-button" title={`Salvar em ${MONTHS[month - 1]}`} icon="piggy-bank" onPress={saveDeposit} loading={busy === "deposit"} />

            <Text style={styles.label}>Guardado mês a mês em {year}</Text>
            <View style={styles.card} testID="meta-month-chart">
              <View style={styles.chart}>
                {yearDeps.map((v, i) => (
                  <View key={i} style={styles.col}>
                    <View style={[styles.bar, { height: Math.max(2, (v / max) * CHART_H), backgroundColor: v ? colors.brandPrimary : colors.border }]} />
                    <Text style={styles.colLabel}>{MONTHS_SHORT[i].charAt(0)}</Text>
                  </View>
                ))}
              </View>
            </View>

            <BigButton testID="meta-edit-button" title="Mudar meta" icon="pencil" variant="ghost" onPress={() => setEditing(true)} />
            <BigButton testID="meta-delete-button" title={confirmDel ? "Toque de novo para apagar" : "Apagar meta"} icon="delete" variant="danger" onPress={remove} loading={busy === "delete"} />
          </>
        ) : (
          <>
            <Text style={styles.label}>Qual é o sonho?</Text>
            <TextInput testID="meta-name-input" value={name} onChangeText={setName} placeholder="Ex: Viagem de férias" placeholderTextColor={colors.muted} style={styles.input} />
            <Text style={styles.label}>Quanto precisa juntar?</Text>
            <View style={styles.moneyWrap}>
              <Text style={styles.currency}>R$</Text>
              <TextInput testID="meta-target-input" value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.moneyInput} />
            </View>
            <Text style={styles.label}>Desenho</Text>
            <View style={styles.icons}>
              {ICONS.map((ic) => (
                <Tap key={ic} testID={`meta-icon-${ic}`} onPress={() => setIcon(ic)} style={[styles.iconBtn, icon === ic && styles.iconOn]}>
                  <Icon name={ic as any} size={28} color={icon === ic ? colors.onBrandPrimary : colors.onSurface} />
                </Tap>
              ))}
            </View>
            {error ? <Text style={styles.error} testID="meta-error">{error}</Text> : null}
            <BigButton testID="meta-save-button" title="Salvar meta" icon="check-bold" onPress={saveGoal} loading={busy === "goal"} />
            {id ? <BigButton testID="meta-cancel-edit-button" title="Cancelar" variant="ghost" onPress={() => setEditing(false)} /> : null}
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8, gap: 12 },
  title: { flex: 1, fontFamily: FONT.xbold, fontSize: 26, color: c.onSurface, paddingLeft: 8 },
  close: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24, gap: 12 },
  hero: { borderRadius: 28, padding: 20, backgroundColor: c.brandTertiary, alignItems: "center", gap: 6 },
  heroValue: { fontFamily: FONT.xbold, fontSize: 40, color: c.onBrandTertiary, marginTop: 4 },
  heroSub: { fontFamily: FONT.bold, fontSize: 18, color: c.onBrandTertiary },
  heroPct: { fontFamily: FONT.xbold, fontSize: 19, color: c.onBrandTertiary, textAlign: "center" },
  track: { alignSelf: "stretch", height: 26, borderRadius: 13, backgroundColor: c.surfaceSecondary, overflow: "hidden", marginTop: 8 },
  fill: { height: 26, borderRadius: 13, backgroundColor: c.brandPrimary },
  label: { fontFamily: FONT.bold, fontSize: 20, color: c.onSurface, marginTop: 8 },
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
  icons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  iconBtn: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  iconOn: { backgroundColor: c.brandPrimary },
  card: { borderRadius: 20, backgroundColor: c.surfaceSecondary, padding: 16, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  chart: { flexDirection: "row", alignItems: "flex-end", height: CHART_H + 24 },
  col: { flex: 1, alignItems: "center", gap: 4 },
  bar: { width: 14, borderRadius: 7 },
  colLabel: { fontFamily: FONT.bold, fontSize: 15, color: c.muted },
  error: { fontFamily: FONT.bold, fontSize: 18, color: c.error },
}));

import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { brl, MONTHS } from "@/src/format";
import { useMonth } from "@/src/month";
import { usesNativeTabs } from "@/src/navigation";
import { useMonthData } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { ErrorState, FONT, Icon, IconCircle, Loading, MonthSelector, Tap, haptic } from "@/src/ui";

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { year, month, shift } = useMonth();
  const q = useMonthData(year, month);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const t = q.data?.totals;

  const empty = t && t.status === "";
  const positive = t?.status === "POSITIVO";
  const heroBg = empty ? colors.surfaceTertiary : positive ? colors.successSoft : colors.errorSoft;
  const heroFg = empty ? colors.muted : positive ? colors.success : colors.error;

  const spending = q.data
    ? [...q.data.sections.fixed, ...q.data.sections.variable].filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 6)
    : [];

  const goTo = (section: string) => router.push({ pathname: "/lancar", params: { section } });

  return (
    <View style={styles.root} testID="home-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.hello} testID="home-greeting">Olá, {user?.name?.split(" ")[0]}</Text>
        <MonthSelector year={year} month={month} onShift={shift} />
      </View>

      {q.isLoading ? (
        <Loading text="Carregando resumo..." />
      ) : q.isError || !t ? (
        <ErrorState text="Não conseguimos carregar os dados" onRetry={() => q.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 112 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brandPrimary} />}
        >
          <View style={[styles.hero, { backgroundColor: heroBg }]} testID="balance-card">
            <View style={styles.heroTop}>
              <Icon name={empty ? "help-circle" : positive ? "thumb-up" : "alert-circle"} size={40} color={heroFg} />
              <Text style={[styles.heroLabel, { color: heroFg }]} testID="balance-status">
                {empty ? "Nada anotado ainda" : positive ? "SOBROU DINHEIRO" : "FALTOU DINHEIRO"}
              </Text>
            </View>
            <Text style={[styles.heroValue, { color: heroFg }]} testID="balance-value">{brl(t.balance)}</Text>
            <Text style={styles.heroSub}>Saldo de {MONTHS[month - 1]}</Text>
            {t.pct !== null ? (
              <View style={styles.pctWrap}>
                <View style={styles.pctTrack}>
                  <View style={[styles.pctFill, { width: `${Math.min(t.pct, 1) * 100}%`, backgroundColor: t.pct > 1 ? colors.error : t.pct > 0.9 ? colors.warning : colors.success }]} />
                </View>
                <Text style={styles.pctText} testID="balance-pct">Gastaram {Math.round(t.pct * 100)}% do que ganharam</Text>
              </View>
            ) : null}
          </View>

          <SummaryRow testID="summary-income" icon="arrow-up-bold-circle" label="Dinheiro que entrou" value={t.income} fg={colors.success} bg={colors.successSoft} onPress={() => goTo("income")} />
          <SummaryRow testID="summary-fixed" icon="home-city" label="Contas da casa" value={t.fixed} fg={colors.error} bg={colors.errorSoft} onPress={() => goTo("fixed")} />
          <SummaryRow testID="summary-variable" icon="cart" label="Gastos do mês" value={t.variable} fg={colors.error} bg={colors.errorSoft} onPress={() => goTo("variable")} />

          <View style={styles.shortcuts}>
            <Tap testID="home-people-button" onPress={() => router.push("/pessoas")} style={styles.shortcut}>
              <Icon name="account-cash" size={40} color={colors.onBrandSecondary} />
              <Text style={styles.shortcutText}>Gastos por pessoa</Text>
            </Tap>
            <Tap testID="home-goals-button" onPress={() => router.push("/metas")} style={styles.shortcut}>
              <Icon name="piggy-bank" size={40} color={colors.onBrandSecondary} />
              <Text style={styles.shortcutText}>Nossas metas</Text>
            </Tap>
          </View>

          <Text style={styles.section}>Para onde vai o dinheiro</Text>
          {spending.length === 0 ? (
            <View style={styles.emptyBox} testID="spending-empty">
              <Icon name="piggy-bank-outline" size={56} color={colors.brandPrimary} />
              <Text style={styles.emptyText}>Nenhum gasto anotado neste mês.</Text>
            </View>
          ) : (
            <View style={styles.card} testID="spending-list">
              {spending.map((r) => {
                const pct = t.expenses ? r.value / t.expenses : 0;
                return (
                  <View key={r.id} style={styles.spRow}>
                    <View style={styles.spTop}>
                      <Icon name={r.icon as any} size={26} color={colors.onSurface} />
                      <Text style={styles.spName} numberOfLines={1}>{r.name}</Text>
                      <Text style={styles.spValue}>{brl(r.value)}</Text>
                    </View>
                    <View style={styles.pctTrack}>
                      <View style={[styles.pctFill, { width: `${pct * 100}%`, backgroundColor: colors.brandPrimary }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      <Tap
        testID="home-fab-add"
        onPress={() => {
          haptic("medium");
          goTo("variable");
        }}
        style={[styles.fab, { bottom: bottomChrome + 16 }]}
      >
        <Icon name="plus-thick" size={30} color={colors.onBrandPrimary} />
        <Text style={styles.fabText}>Anotar</Text>
      </Tap>
    </View>
  );
}

function SummaryRow({ icon, label, value, fg, bg, onPress, testID }: { icon: string; label: string; value: number; fg: string; bg: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Tap testID={testID} onPress={onPress} style={styles.sumRow}>
      <IconCircle name={icon} color={fg} bg={bg} />
      <View style={{ flex: 1 }}>
        <Text style={styles.sumLabel}>{label}</Text>
        <Text style={[styles.sumValue, { color: fg }]}>{brl(value)}</Text>
      </View>
      <Icon name="chevron-right" size={32} color={colors.muted} />
    </Tap>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 12, gap: 12, backgroundColor: c.surface },
  hello: { fontFamily: FONT.xbold, fontSize: 28, color: c.onSurface },
  content: { paddingHorizontal: 16, gap: 12 },
  hero: { borderRadius: 28, padding: 24, gap: 4 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroLabel: { fontFamily: FONT.xbold, fontSize: 22 },
  heroValue: { fontFamily: FONT.xbold, fontSize: 44, marginTop: 8 },
  heroSub: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  pctWrap: { marginTop: 12, gap: 8 },
  pctTrack: { height: 14, borderRadius: 7, backgroundColor: c.surfaceSecondary, overflow: "hidden" },
  pctFill: { height: 14, borderRadius: 7 },
  pctText: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  sumRow: {
    flexDirection: "row", alignItems: "center", gap: 16, minHeight: 88, borderRadius: 20, backgroundColor: c.surfaceSecondary,
    paddingHorizontal: 16, borderWidth: 1, borderColor: c.border,
    shadowColor: c.onSurface, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  sumLabel: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  sumValue: { fontFamily: FONT.xbold, fontSize: 26 },
  section: { fontFamily: FONT.xbold, fontSize: 24, color: c.onSurface, marginTop: 12 },
  shortcuts: { flexDirection: "row", gap: 12 },
  shortcut: {
    flex: 1, minHeight: 116, borderRadius: 20, backgroundColor: c.brandSecondary, padding: 16, gap: 8, justifyContent: "center",
  },
  shortcutText: { fontFamily: FONT.xbold, fontSize: 19, color: c.onBrandSecondary },
  card: { borderRadius: 20, backgroundColor: c.surfaceSecondary, padding: 16, gap: 16, borderWidth: 1, borderColor: c.border },
  spRow: { gap: 8 },
  spTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  spName: { flex: 1, fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  spValue: { fontFamily: FONT.xbold, fontSize: 18, color: c.onSurface },
  emptyBox: { alignItems: "center", gap: 8, padding: 24, borderRadius: 20, backgroundColor: c.brandSecondary },
  emptyText: { fontFamily: FONT.bold, fontSize: 18, color: c.onBrandSecondary, textAlign: "center" },
  fab: {
    position: "absolute", right: 16, height: 68, borderRadius: 34, paddingHorizontal: 24, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: c.brandPrimary, shadowColor: c.onSurface, shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  fabText: { fontFamily: FONT.xbold, fontSize: 22, color: c.onBrandPrimary },
}));

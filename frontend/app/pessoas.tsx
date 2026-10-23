import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/screen-header";
import { brl, MONTHS, MONTHS_SHORT } from "@/src/format";
import { useMonth } from "@/src/month";
import { usePeople } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, BigButton, ErrorState, FONT, Icon, Loading, MonthSelector } from "@/src/ui";

const CHART_H = 120;

export default function Pessoas() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { year, month, shift } = useMonth();
  const q = usePeople(year);
  const people = q.data?.members ?? [];
  const monthMax = Math.max(1, ...people.map((p) => p.months[month - 1]));
  const noOwners = q.data && people.every((p) => p.categories.length === 0);

  return (
    <View style={styles.root} testID="pessoas-screen">
      <ScreenHeader title="Gastos por pessoa" testID="pessoas" />
      <View style={styles.monthWrap}>
        <MonthSelector year={year} month={month} onShift={shift} />
      </View>
      {q.isLoading ? (
        <Loading text="Carregando gastos..." />
      ) : q.isError ? (
        <ErrorState text="Não conseguimos carregar os gastos." onRetry={() => q.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brandPrimary} />}
        >
          <Text style={styles.help}>Quanto cada um gastou no cartão e nas contas que são dele em {MONTHS[month - 1]}.</Text>

          {noOwners ? (
            <View style={styles.empty} testID="pessoas-empty">
              <Icon name="credit-card-outline" size={56} color={colors.brandPrimary} />
              <Text style={styles.emptyText}>Nenhum gasto está ligado a uma pessoa. Abra uma conta e escolha “De quem é este gasto?”.</Text>
              <BigButton testID="pessoas-go-contas" title="Ir para as contas" icon="pencil" onPress={() => router.navigate({ pathname: "/lancar", params: { section: "variable" } })} />
            </View>
          ) : (
            <View style={styles.card} testID="pessoas-month-chart">
              {people.map((p) => {
                const v = p.months[month - 1];
                return (
                  <View key={p.member_id} style={styles.pRow} testID={`pessoa-month-${p.member_id}`}>
                    <View style={styles.pTop}>
                      <Avatar name={p.name} color={p.color} size={48} />
                      <Text style={styles.pName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.pValue}>{brl(v)}</Text>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${(v / monthMax) * 100}%`, backgroundColor: p.color }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {!noOwners
            ? people.map((p) => {
                const max = Math.max(1, ...p.months);
                return (
                  <View key={p.member_id} style={styles.card} testID={`pessoa-year-${p.member_id}`}>
                    <View style={styles.pTop}>
                      <Avatar name={p.name} color={p.color} size={40} />
                      <Text style={styles.pName}>{p.name} no ano</Text>
                    </View>
                    <Text style={styles.yearTotal}>Total: {brl(p.total)}</Text>
                    <View style={styles.chart}>
                      {p.months.map((v, i) => (
                        <View key={i} style={styles.col}>
                          <View style={[styles.bar, { height: Math.max(2, (v / max) * CHART_H), backgroundColor: i === month - 1 ? p.color : colors.borderStrong }]} />
                          <Text style={[styles.colLabel, i === month - 1 && { color: colors.onSurface }]}>{MONTHS_SHORT[i].charAt(0)}</Text>
                        </View>
                      ))}
                    </View>
                    {p.categories.length ? (
                      <Text style={styles.cats} numberOfLines={2}>Conta: {p.categories.map((c) => c.name).join(", ")}</Text>
                    ) : (
                      <Text style={styles.cats}>Nenhuma conta ligada a {p.name}.</Text>
                    )}
                  </View>
                );
              })
            : null}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  monthWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  content: { paddingHorizontal: 16, gap: 12 },
  help: { fontFamily: FONT.regular, fontSize: 18, color: c.muted },
  card: { borderRadius: 20, backgroundColor: c.surfaceSecondary, padding: 16, gap: 14, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  pRow: { gap: 8 },
  pTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  pName: { flex: 1, fontFamily: FONT.xbold, fontSize: 20, color: c.onSurface },
  pValue: { fontFamily: FONT.xbold, fontSize: 20, color: c.error },
  track: { height: 22, borderRadius: 11, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: 22, borderRadius: 11 },
  yearTotal: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  chart: { flexDirection: "row", alignItems: "flex-end", height: CHART_H + 24 },
  col: { flex: 1, alignItems: "center", gap: 4 },
  bar: { width: 14, borderRadius: 7 },
  colLabel: { fontFamily: FONT.bold, fontSize: 15, color: c.muted },
  cats: { fontFamily: FONT.regular, fontSize: 15, color: c.muted },
  empty: { alignItems: "center", gap: 12, padding: 24, borderRadius: 20, backgroundColor: c.brandSecondary },
  emptyText: { fontFamily: FONT.bold, fontSize: 18, color: c.onBrandSecondary, textAlign: "center" },
}));

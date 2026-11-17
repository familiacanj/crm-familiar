import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";

import { api, FamilyFinancialSummary } from "@/src/api";
import { useAuth } from "@/src/auth";
import { brl, MONTHS } from "@/src/format";
import { useMonth } from "@/src/month";
import { useFamilyFinancialSummary } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, ErrorState, FONT, Loading, MonthSelector, Tap } from "@/src/ui";

type PersonalSummary = { income: number; expenses: number; personal_expenses: number; family_paid_expenses: number; cash_transfers_out: number; balance: number };
type Area = "family" | "personal";

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ area?: string }>();
  const { user } = useAuth();
  const { year, month, shift } = useMonth();
  const [area, setArea] = useState<Area>(() => params.area === "personal" ? "personal" : "family");
  useEffect(() => {
    // Router params can change when the user returns from Contas or Ano.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.area === "personal" || params.area === "family") setArea(params.area);
  }, [params.area]);
  const family = useFamilyFinancialSummary(year, month);
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
        <View style={styles.switchRow}>
          <Tap testID="family-context-selected" onPress={() => setArea("family")} style={[styles.switchButton, area === "family" && styles.selected]}><Text style={[styles.switchText, area === "family" && styles.selectedText]}>Finanças da Família</Text></Tap>
          <Tap testID="switch-to-personal-finances" onPress={() => setArea("personal")} style={[styles.switchButton, area === "personal" && styles.selected]}><Text style={[styles.switchText, area === "personal" && styles.selectedText]}>Minhas Finanças</Text></Tap>
        </View>
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
  const contributions = data.contribution_breakdown ?? [];
  const maximumContribution = Math.max(1, ...contributions.map((item) => item.total));
  return <>
    <View style={styles.balanceCard} testID="family-summary-cash">
      <Text style={styles.cardHeading}>Saldo disponível no caixa</Text>
      <Text style={styles.balanceValue}>{brl(data.cash_delta)}</Text>
      <View style={styles.cashRow}><Text style={styles.cashLabel}>Entrou neste mês</Text><Text style={styles.cashValue}>{brl(data.cash_in)}</Text></View>
      <View style={styles.cashRow}><Text style={styles.cashLabel}>Saiu neste mês</Text><Text style={styles.cashValue}>{brl(cashOut)}</Text></View>
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
  const styles = useStyles();
  const personalExpenses = data.personal_expenses ?? ((data.expenses ?? 0) - (data.family_paid_expenses ?? 0));
  const totalOut = data.expenses ?? (personalExpenses + data.family_paid_expenses);
  return <View style={styles.balanceCard} testID="personal-summary">
    <Text style={styles.cardHeading}>Saldo do mês</Text>
    <Text style={styles.balanceValue}>{brl(data.balance)}</Text>
    <View style={styles.personalTotals}>
      <View style={styles.personalTotal}><Text style={styles.totalLabel}>Entrou</Text><Text style={styles.totalValue}>{brl(data.income)}</Text></View>
      <View style={styles.personalTotal}><Text style={styles.totalLabel}>Saiu</Text><Text style={styles.totalValue}>{brl(totalOut)}</Text></View>
    </View>
    <View style={styles.personalBreakdown}>
      <Text style={styles.breakdownTitle}>Despesas pessoais</Text><Text style={styles.breakdownValue}>{brl(personalExpenses)}</Text>
      <Text style={styles.breakdownTitle}>Despesas da casa pagas por você</Text><Text style={styles.breakdownValue}>{brl(data.family_paid_expenses)}</Text>
    </View>
  </View>;
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
  breakdownTitle: { fontFamily: FONT.regular, fontSize: 14, color: c.muted },
  breakdownValue: { fontFamily: FONT.bold, fontSize: 16, color: c.onSurface },
  note: { fontFamily: FONT.regular, fontSize: 14, color: c.muted },
}));

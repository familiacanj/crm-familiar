import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Row } from "@/src/api";
import { brl, MONTHS } from "@/src/format";
import { useMonth } from "@/src/month";
import { usesNativeTabs } from "@/src/navigation";
import { invalidateAll, useMonthData } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, ErrorState, FONT, haptic, Icon, IconCircle, Loading, MonthSelector, Tap } from "@/src/ui";

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
  const params = useLocalSearchParams<{ section?: Section }>();
  const [section, setSection] = useState<Section>(params.section ?? "income");
  const { year, month, shift } = useMonth();
  const q = useMonthData(year, month);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  useEffect(() => {
    if (params.section) setSection(params.section);
  }, [params.section]);

  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  useEffect(() => setCopyMsg(null), [year, month]);

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

  const rows = q.data?.sections[section] ?? [];
  const total = rows.reduce((s, r) => s + r.value, 0);
  const isIncome = section === "income";

  const openRow = (r: Row) =>
    router.push({
      pathname: "/editar",
      params: { refType: r.ref_type, id: r.id, name: r.name, icon: r.icon, color: r.color ?? "", kind: r.kind, value: String(r.value), def: String(r.default_value), overridden: r.overridden ? "1" : "0" },
    });

  return (
    <View style={styles.root} testID="lancar-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
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
                  <View style={[styles.avatar, { backgroundColor: item.color ?? colors.brandPrimary }]}>
                    <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                  </View>
                ) : (
                  <IconCircle name={item.icon} color={fg} bg={isIncome ? colors.successSoft : colors.surfaceTertiary} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.rowSub}>{sub}</Text>
                </View>
                <Text style={[styles.rowValue, { color: item.value ? fg : colors.muted }]}>{brl(item.value)}</Text>
              </Tap>
            );
          }}
          ListFooterComponent={
            <View style={{ marginTop: 8 }}>
              <BigButton
                testID="add-item-button"
                variant="secondary"
                icon="plus"
                title={isIncome ? "Adicionar pessoa ou renda" : "Adicionar nova conta"}
                onPress={() =>
                  isIncome ? router.push("/membro") : router.push({ pathname: "/categoria", params: { kind: section } })
                }
              />
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, gap: 12, backgroundColor: c.surface },
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
}));

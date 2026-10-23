import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { brl, MONTHS, MONTHS_SHORT } from "@/src/format";
import { useMonth } from "@/src/month";
import { usesNativeTabs } from "@/src/navigation";
import { useYearData } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { exportExcel, exportPdf } from "@/src/export";
import { BigButton, ErrorState, FONT, Icon, Loading, MonthSelector, Tap } from "@/src/ui";

const CHART_H = 160;

export default function Ano() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { year: curYear, setYM } = useMonth();
  const [year, setYear] = useState(curYear);
  const q = useYearData(year);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const d = q.data;
  const max = d ? Math.max(1, ...d.months.map((m) => Math.max(m.income, m.expenses))) : 1;
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const runExport = async (kind: "xlsx" | "pdf") => {
    setExporting(kind);
    setExportError(null);
    try {
      await (kind === "xlsx" ? exportExcel(year) : exportPdf(year));
    } catch (e: any) {
      setExportError(e.message ?? "Não foi possível gerar o arquivo.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <View style={styles.root} testID="ano-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Resumo do ano</Text>
        <MonthSelector year={year} month={1} label={String(year)} onShift={(x) => setYear((y) => y + x)} />
      </View>
      {q.isLoading ? (
        <Loading text="Carregando o ano..." />
      ) : q.isError || !d ? (
        <ErrorState text="Não conseguimos carregar o ano." onRetry={() => q.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brandPrimary} />}
        >
          <View style={styles.kpis}>
            <Kpi testID="year-income" label="Entrou" value={d.totals.income} color={colors.success} icon="arrow-up-bold" />
            <Kpi testID="year-expenses" label="Saiu" value={d.totals.expenses} color={colors.error} icon="arrow-down-bold" />
          </View>
          <View style={[styles.balance, { backgroundColor: d.totals.balance >= 0 ? colors.successSoft : colors.errorSoft }]} testID="year-balance">
            <Icon name={d.totals.balance >= 0 ? "thumb-up" : "alert-circle"} size={36} color={d.totals.balance >= 0 ? colors.success : colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.balLabel}>{d.totals.balance >= 0 ? "Sobrou no ano" : "Faltou no ano"}</Text>
              <Text style={[styles.balValue, { color: d.totals.balance >= 0 ? colors.success : colors.error }]}>{brl(d.totals.balance)}</Text>
              {d.totals.pct !== null ? <Text style={styles.balSub}>Gastaram {Math.round(d.totals.pct * 100)}% da renda</Text> : null}
            </View>
          </View>

          <Text style={styles.section}>Mês a mês</Text>
          <View style={styles.card} testID="year-chart">
            <View style={styles.legend}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <Text style={styles.legendText}>Entrou</Text>
              <View style={[styles.dot, { backgroundColor: colors.error }]} />
              <Text style={styles.legendText}>Saiu</Text>
            </View>
            <View style={styles.chart}>
              {d.months.map((m) => (
                <View key={m.month} style={styles.col}>
                  <View style={styles.bars}>
                    <View style={[styles.bar, { height: (m.income / max) * CHART_H, backgroundColor: colors.success }]} />
                    <View style={[styles.bar, { height: (m.expenses / max) * CHART_H, backgroundColor: colors.error }]} />
                  </View>
                  <Text style={styles.colLabel}>{MONTHS_SHORT[m.month - 1].charAt(0)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            {d.months.map((m) => {
              const pos = m.balance >= 0;
              const has = m.status !== "";
              return (
                <Tap
                  key={m.month}
                  testID={`year-month-row-${m.month}`}
                  onPress={() => {
                    setYM(year, m.month);
                    router.navigate("/");
                  }}
                  style={styles.mRow}
                >
                  <Text style={styles.mName}>{MONTHS[m.month - 1]}</Text>
                  {has ? <Icon name={pos ? "arrow-up-bold-circle" : "arrow-down-bold-circle"} size={24} color={pos ? colors.success : colors.error} /> : null}
                  <Text style={[styles.mValue, { color: !has ? colors.muted : pos ? colors.success : colors.error }]}>{has ? brl(m.balance) : "—"}</Text>
                </Tap>
              );
            })}
          </View>

          <Text style={styles.section}>Guardar ou imprimir</Text>
          <View style={styles.card} testID="export-card">
            <Text style={styles.legendText}>Baixe o ano {year} completo, igual à planilha.</Text>
            <BigButton testID="export-excel-button" title="Baixar Excel" icon="microsoft-excel" onPress={() => runExport("xlsx")} loading={exporting === "xlsx"} />
            <BigButton testID="export-pdf-button" title="Gerar PDF para imprimir" icon="file-pdf-box" variant="secondary" onPress={() => runExport("pdf")} loading={exporting === "pdf"} />
            {exportError ? <Text style={styles.exportError} testID="export-error">{exportError}</Text> : null}
          </View>

          <Text style={styles.section}>Para onde foi o dinheiro</Text>
          <View style={styles.card} testID="year-breakdown">
            {d.breakdown.length === 0 ? (
              <Text style={styles.legendText}>Nenhum gasto anotado neste ano.</Text>
            ) : (
              d.breakdown.map((b) => (
                <View key={b.id} style={{ gap: 6 }}>
                  <View style={styles.bTop}>
                    <Icon name={b.icon as any} size={24} color={colors.onSurface} />
                    <Text style={styles.bName} numberOfLines={1}>{b.name}</Text>
                    <Text style={styles.bPct}>{Math.round(b.pct * 100)}%</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${b.pct * 100}%` }]} />
                  </View>
                  <Text style={styles.bValue}>{brl(b.value)}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Kpi({ label, value, color, icon, testID }: { label: string; value: number; color: string; icon: string; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.kpi} testID={testID}>
      <Icon name={icon as any} size={28} color={color} />
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>{brl(value)}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  title: { fontFamily: FONT.xbold, fontSize: 28, color: c.onSurface },
  content: { paddingHorizontal: 16, gap: 12 },
  kpis: { flexDirection: "row", gap: 12 },
  kpi: { flex: 1, borderRadius: 20, padding: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, gap: 2 },
  kpiLabel: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  kpiValue: { fontFamily: FONT.xbold, fontSize: 22 },
  balance: { borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  balLabel: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  balValue: { fontFamily: FONT.xbold, fontSize: 30 },
  balSub: { fontFamily: FONT.regular, fontSize: 16, color: c.onSurface },
  section: { fontFamily: FONT.xbold, fontSize: 24, color: c.onSurface, marginTop: 12 },
  card: { borderRadius: 20, backgroundColor: c.surfaceSecondary, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  legend: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  legendText: { fontFamily: FONT.bold, fontSize: 17, color: c.onSurface, marginRight: 8 },
  exportError: { fontFamily: FONT.bold, fontSize: 17, color: c.error },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: CHART_H + 28 },
  col: { flex: 1, alignItems: "center", gap: 4 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: CHART_H },
  bar: { width: 8, borderRadius: 4, minHeight: 2 },
  colLabel: { fontFamily: FONT.bold, fontSize: 15, color: c.muted },
  mRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52, borderBottomWidth: 1, borderBottomColor: c.divider },
  mName: { flex: 1, fontFamily: FONT.bold, fontSize: 19, color: c.onSurface },
  mValue: { fontFamily: FONT.xbold, fontSize: 19 },
  bTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  bName: { flex: 1, fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  bPct: { fontFamily: FONT.xbold, fontSize: 18, color: c.onSurface },
  bValue: { fontFamily: FONT.regular, fontSize: 16, color: c.muted },
  track: { height: 12, borderRadius: 6, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: 12, borderRadius: 6, backgroundColor: c.brandPrimary },
}));

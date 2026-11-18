import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { brl, MONTHS, MONTHS_SHORT } from "@/src/format";
import { useMonth } from "@/src/month";
import { usesNativeTabs } from "@/src/navigation";
import { PersonalYearData, useYearData } from "@/src/queries";
import { api, setReportSessionToken } from "@/src/api";
import { useAuth } from "@/src/auth";
import { makeStyles, useTheme } from "@/src/theme";
import { exportExcel, exportPdf } from "@/src/export";
import { BigButton, ErrorState, FONT, Icon, Loading, MonthSelector, Tap } from "@/src/ui";

const CHART_H = 160;

export default function Ano() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ scope?: string }>();
  const { user } = useAuth();
  const { year: curYear, setYM } = useMonth();
  const [year, setYear] = useState(curYear);
  const [manualScope, setManualScope] = useState<"family" | "personal">("family");
  const scope = params.scope === "personal" || params.scope === "family" ? params.scope : manualScope;
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [selectedReportMember, setSelectedReportMember] = useState<string | null>(null);
  const status = useQuery({ queryKey: ["report-password-status"], queryFn: () => api<{ configured: boolean }>("/reports/password/status") });
  const q = useYearData(year, unlocked && scope === "family");
  const personalQuery = useQuery({ queryKey: ["personal-year", user?.user_id, year], queryFn: () => api<PersonalYearData>(`/personal/year/${year}`), enabled: unlocked && scope === "personal" });
  const eligibleQuery = useQuery({ queryKey: ["report-eligible-members"], queryFn: () => api<{ user_id: string; name: string; age_group: "adult" | "minor" }[]>("/reports/eligible-members"), enabled: unlocked });
  const targetReport = useQuery({ queryKey: ["authorized-member-report", selectedReportMember, year], queryFn: () => api<PersonalYearData & { member_name: string }>(`/reports/member/${encodeURIComponent(selectedReportMember!)}/${year}`), enabled: unlocked && !!selectedReportMember });
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const activeQuery = selectedReportMember ? targetReport : scope === "family" ? q : personalQuery;
  const d = selectedReportMember ? targetReport.data : scope === "family" ? q.data : personalQuery.data;
  const familyFinancials = scope === "family" && !selectedReportMember ? d?.family_financials : undefined;
  const displayMonths = familyFinancials?.months.map((month) => ({
    month: month.month, income: month.cash_in, expenses: month.cash_out, balance: month.cash_balance,
    status: month.cash_balance >= 0 ? "POSITIVO" : "NEGATIVO",
  })) ?? d?.months ?? [];
  const max = displayMonths.length ? Math.max(1, ...displayMonths.map((m) => Math.max(m.income, m.expenses))) : 1;
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => () => {
    setReportSessionToken(null);
    setUnlocked(false);
  }, []));

  const unlockReports = async () => {
    setGateBusy(true); setGateError(null);
    try {
      if (!status.data?.configured && password !== confirmation) throw new Error("As duas senhas precisam ser iguais.");
      const result = await api<{ report_session: string }>(status.data?.configured ? "/reports/password/verify" : "/reports/password", {
        method: "POST", body: { password },
      });
      setReportSessionToken(result.report_session);
      setUnlocked(true); setPassword(""); setConfirmation("");
    } catch (e) { setGateError(e instanceof Error ? e.message : "Não foi possível desbloquear os relatórios."); }
    finally { setGateBusy(false); }
  };

  const sendRecovery = async () => {
    setGateBusy(true); setGateError(null);
    try { await api("/reports/password/recovery-email", { method: "POST" }); setRecoverySent(true); }
    catch (e) { setGateError(e instanceof Error ? e.message : "Não foi possível iniciar a recuperação."); }
    finally { setGateBusy(false); }
  };

  const runExport = async (kind: "xlsx" | "pdf") => {
    setExporting(kind);
    setExportError(null);
    try {
      await (kind === "xlsx" ? exportExcel(year, scope) : exportPdf(year, scope));
    } catch (e: any) {
      setExportError(e.message ?? "Não foi possível gerar o arquivo.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <View style={styles.root} testID="ano-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Text style={styles.title}>{selectedReportMember ? `Relatório de ${targetReport.data?.member_name ?? "integrante"}` : "Resumo do ano"}</Text>
        <View style={styles.scopeRow}>
          <Tap testID="year-family-scope" onPress={() => setManualScope("family")} style={[styles.scopeChip, scope === "family" && styles.scopeChipOn]}>
            <Text style={scope === "family" ? styles.scopeTextOn : styles.scopeText}>Finanças da Família</Text>
          </Tap>
          <Tap testID="year-personal-scope" onPress={() => setManualScope("personal")} style={[styles.scopeChip, scope === "personal" && styles.scopeChipOn]}>
            <Text style={scope === "personal" ? styles.scopeTextOn : styles.scopeText}>Minhas Finanças</Text>
          </Tap>
        </View>
        <MonthSelector year={year} month={1} label={String(year)} onShift={(x) => setYear((y) => y + x)} />
      </View>
      {!unlocked ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 24 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.card} testID="report-password-gate">
            <Text style={styles.section}>{status.data?.configured ? "Confirme sua senha de relatórios" : "Crie sua senha de relatórios"}</Text>
            <Text style={styles.legendText}>Esta proteção é exclusiva da aba Ano. Ao sair, será necessário desbloquear novamente.</Text>
            <TextInput testID="report-password-input" accessibilityLabel="Senha de relatórios" secureTextEntry value={password} onChangeText={setPassword} autoCapitalize="none" style={styles.input} placeholder="Senha (mínimo 8 caracteres)" placeholderTextColor={colors.muted} />
            {!status.data?.configured ? <TextInput testID="report-password-confirm" accessibilityLabel="Confirme a senha de relatórios" secureTextEntry value={confirmation} onChangeText={setConfirmation} autoCapitalize="none" style={styles.input} placeholder="Confirme a senha" placeholderTextColor={colors.muted} /> : null}
            <BigButton testID="report-password-submit" title={status.data?.configured ? "Desbloquear relatórios" : "Criar senha e continuar"} icon="lock-open" onPress={() => void unlockReports()} loading={gateBusy} disabled={status.isLoading || !password} />
            {status.data?.configured ? <BigButton testID="report-password-recovery" title="Esqueci a senha" icon="email-lock" variant="secondary" onPress={() => void sendRecovery()} loading={gateBusy} /> : null}
            {recoverySent ? <Text style={styles.legendText}>Se o e-mail puder receber mensagens, enviaremos as instruções de recuperação.</Text> : null}
            {gateError ? <Text style={styles.exportError} testID="report-password-error">{gateError}</Text> : null}
          </View>
        </ScrollView>
      ) : activeQuery.isLoading ? (
        <Loading text="Carregando o ano..." />
      ) : activeQuery.isError || !d ? (
        <ErrorState text="Não conseguimos carregar o ano." onRetry={() => activeQuery.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 24 }]}
          refreshControl={<RefreshControl refreshing={activeQuery.isRefetching} onRefresh={() => { void activeQuery.refetch(); }} tintColor={colors.brandPrimary} />}
        >
          {scope === "personal" && eligibleQuery.data?.length ? <View style={styles.card} testID="authorized-family-reports"><Text style={styles.legendText}>Relatórios autorizados</Text>{eligibleQuery.data.map((member) => <Tap key={member.user_id} testID={`authorized-report-${member.user_id}`} onPress={() => setSelectedReportMember(selectedReportMember === member.user_id ? null : member.user_id)} style={styles.mRow}><Text style={styles.mName}>{member.name} · {member.age_group === "minor" ? "menor com responsável autorizado" : "autorizado"}</Text><Icon name={selectedReportMember === member.user_id ? "close" : "chevron-right"} size={22} color={colors.muted} /></Tap>)}</View> : null}
          {selectedReportMember ? <BigButton testID="authorized-report-back" title="Voltar ao meu relatório" icon="arrow-left" variant="secondary" onPress={() => setSelectedReportMember(null)} /> : null}
          <View style={styles.kpis}>
            <Kpi testID="year-income" label={familyFinancials ? "Entrou no caixa" : "Entrou"} value={familyFinancials?.totals.cash_in ?? d.totals.income} color={colors.success} icon="arrow-up-bold" />
            <Kpi testID="year-expenses" label={familyFinancials ? "Saiu do caixa" : "Saiu"} value={familyFinancials?.totals.cash_out ?? d.totals.expenses} color={colors.error} icon="arrow-down-bold" />
          </View>
          <View style={[styles.balance, { backgroundColor: d.totals.balance >= 0 ? colors.successSoft : colors.errorSoft }]} testID="year-balance">
            <Icon name={(familyFinancials?.totals.closing_balance ?? d.totals.balance) >= 0 ? "thumb-up" : "alert-circle"} size={36} color={(familyFinancials?.totals.closing_balance ?? d.totals.balance) >= 0 ? colors.success : colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.balLabel}>{familyFinancials ? "Saldo final do caixa" : d.totals.balance >= 0 ? "Sobrou no ano" : "Faltou no ano"}</Text>
              <Text style={[styles.balValue, { color: (familyFinancials?.totals.closing_balance ?? d.totals.balance) >= 0 ? colors.success : colors.error }]}>{brl(familyFinancials?.totals.closing_balance ?? d.totals.balance)}</Text>
              {familyFinancials ? <Text style={styles.balSub}>Saldo inicial transportado: {brl(familyFinancials.totals.opening_balance)}</Text> : d.totals.pct !== null ? <Text style={styles.balSub}>Gastaram {Math.round(d.totals.pct * 100)}% da renda</Text> : null}
            </View>
          </View>

          {familyFinancials ? <>
            <Text style={styles.section}>Contribuições e compromissos</Text>
            <View style={styles.card} testID="annual-family-financials">
              <Text style={styles.legendText}>Despesas da casa pagas diretamente pelos integrantes: {brl(familyFinancials.totals.direct_family_expenses)}. Esse valor não entra nem sai do caixa.</Text>
              <Text style={styles.legendText}>Compromissos no ano: {brl(familyFinancials.totals.commitments)} · Créditos: {brl(familyFinancials.totals.credits)} · Pendências: {brl(familyFinancials.totals.pending)}</Text>
              {familyFinancials.members.map((member) => <View key={member.member_id} style={styles.memberAnnualRow} testID={`annual-family-member-${member.member_id}`}>
                <Text style={styles.mName}>{member.name}</Text>
                <Text style={styles.legendText}>Transferido {brl(member.cash_contributions)} · Casa paga diretamente {brl(member.direct_family_expenses)}</Text>
                <Text style={styles.legendText}>Total {brl(member.total_contributed)} · Compromisso {brl(member.commitment_total)} · Crédito {brl(member.credit_balance)} · Pendência {brl(member.pending_balance)}</Text>
              </View>)}
            </View>
          </> : null}

          <Text style={styles.section}>Mês a mês</Text>
          <View style={styles.card} testID="year-chart">
            <View style={styles.legend}>
              <View style={[styles.dot, { backgroundColor: colors.success }]} />
              <Text style={styles.legendText}>{familyFinancials ? "Entrou no caixa" : "Entrou"}</Text>
              <View style={[styles.dot, { backgroundColor: colors.error }]} />
              <Text style={styles.legendText}>{familyFinancials ? "Saiu do caixa" : "Saiu"}</Text>
            </View>
            <View style={styles.chart}>
              {displayMonths.map((m) => (
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
            {displayMonths.map((m) => {
              const pos = m.balance >= 0;
              const has = m.status !== "";
              return (
                <Tap
                  key={m.month}
                  testID={`year-month-row-${m.month}`}
                  onPress={() => {
                    setYM(year, m.month);
                    router.navigate(scope === "personal" ? "/pessoal" : "/");
                  }}
                  style={styles.mRow}
                >
                  <Text style={styles.mName}>{MONTHS[m.month - 1]}{familyFinancials ? " · saldo do caixa" : ""}</Text>
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
  scopeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scopeChip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.surfaceTertiary },
  scopeChipOn: { backgroundColor: c.brandPrimary },
  scopeText: { fontFamily: FONT.bold, fontSize: 15, color: c.onSurface },
  scopeTextOn: { fontFamily: FONT.bold, fontSize: 15, color: c.onBrandPrimary },
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
  memberAnnualRow: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
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
  input: { minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 14, fontFamily: FONT.regular, fontSize: 17, color: c.onSurface },
}));

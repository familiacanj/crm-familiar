import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { FONT, Icon, Tap } from "@/src/ui";
import { makeStyles, useTheme } from "@/src/theme";

type Overview = {
  status: string;
  families_count: number;
  users_count: number;
  users_without_family_count: number;
  families_without_members_count: number;
  pending_invites_count: number;
};
type FamilyRow = {
  family_id: string;
  family_name: string;
  created_at: string;
  member_count: number;
  active_invites_count: number;
  status: "active" | "without_members";
};
type AuditRow = {
  audit_id: string;
  actor_user_id: string | null;
  action: string;
  target_family_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export default function PlatformAdmin() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const overview = useQuery({
    queryKey: ["platform-admin", "overview"],
    queryFn: () => api<Overview>("/platform-admin/overview"),
    enabled: !!user?.is_superadmin,
  });
  const families = useQuery({
    queryKey: ["platform-admin", "families", appliedSearch, page],
    queryFn: () => api<{ items: FamilyRow[]; has_more: boolean }>(
      `/platform-admin/families?q=${encodeURIComponent(appliedSearch)}&page=${page}&per_page=25`,
    ),
    enabled: !!user?.is_superadmin,
  });
  const audit = useQuery({
    queryKey: ["platform-admin", "audit"],
    queryFn: () => api<{ items: AuditRow[] }>("/platform-admin/audit"),
    enabled: !!user?.is_superadmin,
  });

  const openCrm = () => router.replace(user?.family_id ? "/(tabs)" : "/onboarding");

  return (
    <View style={styles.root} testID="platform-admin-screen">
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.header}>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>CRM FAMILIAR · PLATAFORMA</Text>
            <Text style={styles.title}>Painel Administrativo</Text>
            <Text style={styles.subtitle}>Acesso global restrito ao Superadministrador.</Text>
          </View>
          <Tap testID="platform-admin-open-crm" onPress={openCrm} style={styles.crmButton}>
            <Icon name="arrow-left" size={24} color={colors.onBrandSecondary} />
            <Text style={styles.crmButtonText}>Abrir CRM Familiar</Text>
          </Tap>
        </View>

        {overview.isLoading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color={colors.brandPrimary} /></View>
        ) : overview.isError || !overview.data ? (
          <Tap testID="platform-admin-retry" onPress={() => { void overview.refetch(); void families.refetch(); void audit.refetch(); }} style={styles.errorCard}>
            <Icon name="alert-circle" size={28} color={colors.error} />
            <Text style={styles.errorText}>Não foi possível carregar os dados administrativos. Toque para tentar novamente.</Text>
          </Tap>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Visão geral</Text>
            <View style={styles.metrics}>
              <Metric label="Famílias" value={overview.data.families_count} icon="home-group" />
              <Metric label="Usuários cadastrados" value={overview.data.users_count} icon="account-group" />
              <Metric label="Usuários sem família" value={overview.data.users_without_family_count} icon="account-question" />
              <Metric label="Famílias sem integrantes" value={overview.data.families_without_members_count} icon="home-alert" />
              <Metric label="Convites ativos" value={overview.data.pending_invites_count} icon="email-outline" />
            </View>
            <Text style={styles.statusNote}>Situação dos cadastros disponível. Os indicadores são agregados e não incluem lançamentos, receitas, despesas ou saldos privados.</Text>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Famílias</Text>
              <Text style={styles.sectionHint}>Somente informações administrativas básicas</Text>
            </View>
            <View style={styles.searchRow}>
              <TextInput
                testID="platform-admin-family-search"
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={() => { setPage(1); setAppliedSearch(search.trim()); }}
                placeholder="Buscar pelo nome da família"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                returnKeyType="search"
                maxLength={80}
              />
              <Tap testID="platform-admin-search-button" onPress={() => { setPage(1); setAppliedSearch(search.trim()); }} style={styles.searchButton}>
                <Icon name="magnify" size={24} color={colors.onBrandPrimary} />
              </Tap>
            </View>
            {families.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : families.isError ? (
              <Text style={styles.errorText}>Não foi possível carregar a lista de famílias.</Text>
            ) : families.data?.items.length ? (
              <View style={styles.listCard}>
                {families.data.items.map((family) => (
                  <View key={family.family_id} style={styles.familyRow} testID={`admin-family-${family.family_id}`}>
                    <View style={styles.familyIcon}><Icon name="home-group" size={25} color={colors.onBrandSecondary} /></View>
                    <View style={styles.familyCopy}>
                      <Text style={styles.familyName}>{family.family_name}</Text>
                      <Text style={styles.familyMeta}>{family.member_count} integrantes · {family.active_invites_count} convites ativos</Text>
                      <Text style={styles.familyMeta}>{family.status === "active" ? "Cadastro ativo" : "Sem integrantes"} · Criada em {new Date(family.created_at).toLocaleDateString("pt-BR")}</Text>
                    </View>
                  </View>
                ))}
                <View style={styles.pagination}>
                  <Tap testID="platform-admin-page-previous" disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} style={styles.pageButton}>
                    <Text style={styles.pageButtonText}>Anterior</Text>
                  </Tap>
                  <Text style={styles.pageNumber}>Página {page}</Text>
                  <Tap testID="platform-admin-page-next" disabled={!families.data.has_more} onPress={() => setPage((p) => p + 1)} style={styles.pageButton}>
                    <Text style={styles.pageButtonText}>Próxima</Text>
                  </Tap>
                </View>
              </View>
            ) : <Text style={styles.emptyText}>Nenhuma família encontrada.</Text>}

            <Text style={styles.sectionTitle}>Suporte e comunicados</Text>
            <View style={styles.futureCard} testID="platform-admin-support-placeholder">
              <Icon name="lifebuoy" size={28} color={colors.onBrandSecondary} />
              <View style={styles.futureCopy}>
                <Text style={styles.futureTitle}>Solicitações de suporte</Text>
                <Text style={styles.futureText}>Área reservada para uma etapa futura. Nenhum acesso a dados de famílias é aberto por este painel.</Text>
              </View>
            </View>
            <View style={styles.futureCard} testID="platform-admin-announcements-placeholder">
              <Icon name="bullhorn-outline" size={28} color={colors.onBrandSecondary} />
              <View style={styles.futureCopy}>
                <Text style={styles.futureTitle}>Comunicados gerais</Text>
                <Text style={styles.futureText}>Estrutura preparada para rascunhos. O envio e a publicação de comunicados não estão habilitados.</Text>
              </View>
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Auditoria administrativa</Text>
              <Text style={styles.sectionHint}>Últimas 50 ações de consulta</Text>
            </View>
            {audit.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : audit.data?.items.length ? (
              <View style={styles.listCard}>
                {audit.data.items.map((item) => (
                  <View key={item.audit_id} style={styles.auditRow}>
                    <Icon name="clipboard-text-clock-outline" size={22} color={colors.onBrandSecondary} />
                    <View style={styles.familyCopy}>
                      <Text style={styles.auditAction}>{item.action}</Text>
                      <Text style={styles.familyMeta}>{new Date(item.created_at).toLocaleString("pt-BR")}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : <Text style={styles.emptyText}>Ainda não há ações registradas.</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.metric}>
      <Icon name={icon as any} size={25} color={colors.onBrandSecondary} />
      <Text style={styles.metricValue}>{value.toLocaleString("pt-BR")}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { width: "100%", maxWidth: 960, alignSelf: "center", paddingHorizontal: 18, gap: 16 },
  header: { gap: 14, paddingBottom: 6 },
  headingCopy: { gap: 4 },
  eyebrow: { color: c.muted, fontFamily: FONT.xbold, fontSize: 13, letterSpacing: 1 },
  title: { color: c.onSurface, fontFamily: FONT.xbold, fontSize: 30 },
  subtitle: { color: c.muted, fontFamily: FONT.regular, fontSize: 17 },
  crmButton: { minHeight: 52, paddingHorizontal: 18, borderRadius: 18, backgroundColor: c.brandSecondary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "flex-start" },
  crmButtonText: { color: c.onBrandSecondary, fontFamily: FONT.xbold, fontSize: 16 },
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  errorCard: { padding: 18, backgroundColor: c.errorSoft, borderRadius: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  errorText: { flex: 1, color: c.error, fontFamily: FONT.bold, fontSize: 16 },
  sectionTitle: { color: c.onSurface, fontFamily: FONT.xbold, fontSize: 23, marginTop: 4 },
  sectionHeading: { gap: 2, marginTop: 4 },
  sectionHint: { color: c.muted, fontFamily: FONT.regular, fontSize: 15 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexGrow: 1, flexBasis: 145, minHeight: 112, padding: 14, borderRadius: 18, backgroundColor: c.brandSecondary, gap: 3 },
  metricValue: { color: c.onBrandSecondary, fontFamily: FONT.xbold, fontSize: 25 },
  metricLabel: { color: c.onBrandSecondary, fontFamily: FONT.bold, fontSize: 14 },
  statusNote: { color: c.muted, fontFamily: FONT.regular, fontSize: 14, lineHeight: 20 },
  searchRow: { flexDirection: "row", gap: 8 },
  searchInput: { flex: 1, minWidth: 0, height: 52, paddingHorizontal: 15, borderRadius: 14, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary, color: c.onSurface, fontFamily: FONT.regular, fontSize: 16 },
  searchButton: { width: 54, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.brandPrimary },
  listCard: { paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  familyRow: { minHeight: 80, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
  familyIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.brandSecondary },
  familyCopy: { flex: 1, minWidth: 0, gap: 2 },
  familyName: { color: c.onSurface, fontFamily: FONT.xbold, fontSize: 17 },
  familyMeta: { color: c.muted, fontFamily: FONT.regular, fontSize: 14 },
  pagination: { minHeight: 58, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pageButton: { paddingVertical: 10, paddingHorizontal: 12 },
  pageButtonText: { color: c.onBrandSecondary, fontFamily: FONT.bold, fontSize: 15 },
  pageNumber: { color: c.muted, fontFamily: FONT.regular, fontSize: 14 },
  emptyText: { color: c.muted, fontFamily: FONT.regular, fontSize: 16, padding: 8 },
  futureCard: { flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 16, borderRadius: 18, backgroundColor: c.brandSecondary },
  futureCopy: { flex: 1, gap: 3 },
  futureTitle: { color: c.onBrandSecondary, fontFamily: FONT.xbold, fontSize: 17 },
  futureText: { color: c.onBrandSecondary, fontFamily: FONT.regular, fontSize: 15, lineHeight: 21 },
  auditRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: c.divider },
  auditAction: { color: c.onSurface, fontFamily: FONT.bold, fontSize: 15 },
}));

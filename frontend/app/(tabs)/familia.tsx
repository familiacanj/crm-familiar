import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Platform, RefreshControl, ScrollView, Share, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { brl, parseMoney, toInput } from "@/src/format";
import { usesNativeTabs } from "@/src/navigation";
import { api, InviteCreated } from "@/src/api";
import { invalidateAll, useFamily, useFamilyFinancialSummary, useMyFamilies } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, BigButton, ErrorState, FONT, Icon, Loading, Tap } from "@/src/ui";

export default function Familia() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout, user, refreshUser } = useAuth();
  const routeParams = useLocalSearchParams<{ welcome?: string }>();
  const q = useFamily();
  const familyList = useMyFamilies();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const f = q.data;
  const canManageFamily = user?.family_role === "owner" || user?.family_role === "admin";
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const commitments = useFamilyFinancialSummary(currentYear, currentMonth);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(routeParams.welcome === "1");
  const [familyActionError, setFamilyActionError] = useState<string | null>(null);
  const [commitmentTarget, setCommitmentTarget] = useState<{ memberId: string; name: string; amount: number } | null>(null);
  const [commitmentInput, setCommitmentInput] = useState("");
  const [commitmentBusy, setCommitmentBusy] = useState(false);
  const [commitmentError, setCommitmentError] = useState<string | null>(null);
  const [removalTarget, setRemovalTarget] = useState<{ userId: string; name: string } | null>(null);
  const [removalBusy, setRemovalBusy] = useState(false);

  useEffect(() => {
    if (routeParams.welcome === "1") router.replace("/(tabs)/familia");
  }, [routeParams.welcome, router]);

  const switchFamily = async (familyId: string) => {
    setFamilyActionError(null);
    try {
      await api(`/family/switch/${encodeURIComponent(familyId)}`, { method: "POST" });
      await refreshUser();
      await invalidateAll();
      router.replace("/(tabs)");
    } catch (e: any) { setFamilyActionError(e.message); }
  };

  const changeRole = async (userId: string, role: "admin" | "member") => {
    setFamilyActionError(null);
    try {
      await api(`/family/users/${encodeURIComponent(userId)}/role`, { method: "PUT", body: { role } });
      await invalidateAll();
    } catch (e: any) { setFamilyActionError(e.message); }
  };

  const canRemoveUser = (target: NonNullable<typeof f>['users'][number]) => {
    if (!user || target.user_id === user.user_id || target.family_role === "owner") return false;
    if (user.family_role === "owner") return true;
    return user.family_role === "admin" && target.family_role === "member";
  };

  const confirmRemoveUser = async () => {
    if (!removalTarget) return;
    setRemovalBusy(true);
    setFamilyActionError(null);
    try {
      await api(`/family/users/${encodeURIComponent(removalTarget.userId)}/remove`, { method: "POST" });
      setRemovalTarget(null);
      await invalidateAll();
    } catch (e: any) {
      setFamilyActionError(e?.message ?? "Não foi possível remover o integrante agora.");
    } finally {
      setRemovalBusy(false);
    }
  };

  const formatLastAccess = (date?: string | null) => date
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(date))
    : "Ainda não registrado";

  const shareInvite = async (url: string) => {
    const message = `Convite — Família ${f?.name}\n\nVocê recebeu um convite para participar do CRM da Família ${f?.name}.\n\nPara entrar, acesse o link abaixo e faça login com sua conta Google:\n\n${url}\n\nEste convite é válido por 24 horas e pode ser utilizado apenas uma vez.`;
    if (Platform.OS === "web") {
      const browser = globalThis.navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> };
      if (browser.share) {
        await browser.share({ title: `Convite — Família ${f?.name}`, text: message, url });
      } else if (browser.clipboard?.writeText) {
        await browser.clipboard.writeText(message);
      } else {
        throw new Error("Copie o link exibido para compartilhar o convite.");
      }
      return;
    }
    await Share.share({ message });
  };

  const copyInvite = async (url: string) => {
    const browser = globalThis.navigator as Navigator;
    if (!browser.clipboard?.writeText) throw new Error("Seu navegador não permite copiar o convite automaticamente.");
    await browser.clipboard.writeText(url);
  };

  const generateInvite = async () => {
    setInviteBusy(true);
    setInviteError(null);
    try {
      const created = await api<InviteCreated>("/family/invites", { method: "POST" });
      setInviteUrl(created.invite_url);
      await shareInvite(created.invite_url);
    } catch (e: any) {
      setInviteError(e?.message ?? "Não foi possível gerar o convite agora.");
    } finally {
      setInviteBusy(false);
    }
  };

  const editCommitment = (member: NonNullable<typeof f>["members"][number]) => {
    const summary = commitments.data?.commitment_breakdown.find((row) => row.member_id === member.member_id);
    setCommitmentTarget({ memberId: member.member_id, name: member.name, amount: summary?.commitment ?? 0 });
    setCommitmentInput(toInput(summary?.commitment ?? 0));
    setCommitmentError(null);
  };

  const saveCommitment = async () => {
    if (!commitmentTarget) return;
    const amount = parseMoney(commitmentInput);
    if (amount === null) { setCommitmentError("Digite um valor válido em reais."); return; }
    setCommitmentBusy(true);
    setCommitmentError(null);
    try {
      await api(`/family/commitments/${encodeURIComponent(commitmentTarget.memberId)}/${currentYear}/${currentMonth}`, {
        method: "PUT", body: { amount },
      });
      await invalidateAll();
      setCommitmentTarget(null);
    } catch (e: any) { setCommitmentError(e?.message ?? "Não foi possível salvar o compromisso."); }
    finally { setCommitmentBusy(false); }
  };

  return (
    <View style={styles.root} testID="familia-screen">
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title} numberOfLines={1}>{f?.name ?? "Família"}</Text>
      </View>
      {q.isLoading ? (
        <Loading text="Carregando família..." />
      ) : q.isError || !f ? (
        <ErrorState text="Não conseguimos carregar a família." onRetry={() => q.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brandPrimary} />}
        >
          {user?.is_superadmin ? (
            <BigButton testID="family-platform-admin-button" title="Painel Administrativo" icon="shield-account" variant="secondary" onPress={() => router.push("/platform-admin")} />
          ) : null}
          {welcomeVisible ? (
            <View style={styles.welcome} testID="family-created-welcome">
              <Text style={styles.welcomeTitle}>Sua família foi criada com sucesso!</Text>
              <Text style={styles.welcomeText}>Agora você pode cadastrar as pessoas que participam do orçamento ou convidar integrantes para usar o CRM Familiar.</Text>
              <Text style={styles.welcomeText}>Seus dados básicos já vieram da conta. Revise seu perfil se quiser acrescentar uma fotografia ou ajustar seu nome de exibição.</Text>
              <BigButton testID="welcome-profile" title="Revisar meu perfil" icon="account-edit" variant="secondary" onPress={() => { setWelcomeVisible(false); router.push("/perfil"); }} />
              <BigButton testID="welcome-add-person" title="Adicionar pessoa" icon="account-plus" variant="secondary" onPress={() => { setWelcomeVisible(false); router.push("/membro"); }} />
              <BigButton testID="welcome-invite" title="Gerar convite" icon="share-variant" variant="secondary" onPress={() => { setWelcomeVisible(false); void generateInvite(); }} />
              <BigButton testID="welcome-budget" title="Ir para meu orçamento" icon="arrow-right" onPress={() => { setWelcomeVisible(false); router.replace("/(tabs)"); }} />
              <Text style={styles.welcomeFoot}>Essas opções são opcionais. Você também pode continuar depois.</Text>
            </View>
          ) : null}

          {familyList.data && familyList.data.length > 1 ? (
            <View style={styles.card} testID="family-switcher">
              <Text style={styles.section}>Minhas famílias</Text>
              {familyList.data.map((family) => (
                <BigButton key={family.family_id} testID={`switch-family-${family.family_id}`} title={`${family.name} · ${family.role === "owner" ? "proprietário" : family.role === "admin" ? "administrador" : "integrante"}${family.active ? " · atual" : ""}`} icon={family.active ? "check-circle" : "swap-horizontal"} variant={family.active ? "ghost" : "secondary"} disabled={family.active} onPress={() => void switchFamily(family.family_id)} />
              ))}
            </View>
          ) : null}
          {familyActionError ? <Text style={styles.inviteError} testID="family-action-error">{familyActionError}</Text> : null}

          {canManageFamily ? (
            <View style={styles.invite} testID="invite-card">
              <Text style={styles.inviteLabel}>Convidar integrante</Text>
              <Text style={styles.inviteHint}>Gere um link individual válido por 24 horas e compartilhe com uma pessoa da família.</Text>
              {inviteUrl ? <Text style={styles.inviteUrl} selectable testID="invite-url">{inviteUrl}</Text> : null}
              {inviteError ? <Text style={styles.inviteError} testID="invite-error">{inviteError}</Text> : null}
              <BigButton
                testID="share-invite-button"
                title={inviteUrl ? "Compartilhar convite" : "Gerar convite"}
                icon="share-variant"
                variant="secondary"
                loading={inviteBusy}
                onPress={() => inviteUrl ? shareInvite(inviteUrl).catch((e: any) => setInviteError(e?.message ?? "Não foi possível compartilhar o convite.")) : generateInvite()}
              />
              {inviteUrl && Platform.OS === "web" ? (
                <BigButton
                  testID="copy-invite-button"
                  title="Copiar convite"
                  icon="content-copy"
                  variant="ghost"
                  onPress={() => copyInvite(inviteUrl).catch((e: any) => setInviteError(e?.message ?? "Não foi possível copiar o convite."))}
                />
              ) : null}
            </View>
          ) : null}

          <Text style={styles.section}>Compromissos familiares deste mês</Text>
          <Text style={styles.sectionHint}>O salário é privado. Compromisso, transferências e despesas da casa pagas diretamente ajudam a acompanhar a contribuição sem aumentar o saldo do caixa.</Text>
          {f.members.map((m) => (
            <View key={m.member_id} testID={`member-card-${m.member_id}`} style={styles.member}>
              <Avatar name={m.name} color={m.color} size={64} photoUrl={m.photo_url} />
              <View style={{ flex: 1 }}>
                <Text style={styles.mName}>{m.name}</Text>
                <Text style={styles.mSub}>Compromisso: {brl(commitments.data?.commitment_breakdown.find((row) => row.member_id === m.member_id)?.commitment ?? 0)}</Text>
                <Text style={styles.mSub}>Contribuído: {brl(commitments.data?.commitment_breakdown.find((row) => row.member_id === m.member_id)?.total ?? 0)}</Text>
                <Text style={styles.mSub}>Crédito: {brl(commitments.data?.commitment_breakdown.find((row) => row.member_id === m.member_id)?.credit_balance ?? 0)} · Pendente: {brl(commitments.data?.commitment_breakdown.find((row) => row.member_id === m.member_id)?.pending_balance ?? 0)}</Text>
              </View>
              {(canManageFamily || m.linked_user_id === user?.user_id) ? (
                <Tap testID={`commitment-edit-${m.member_id}`} onPress={() => editCommitment(m)} style={styles.editPill}>
                  <Icon name="pencil" size={22} color={colors.onBrandSecondary} />
                  <Text style={styles.editText}>Definir</Text>
                </Tap>
              ) : null}
            </View>
          ))}
          {canManageFamily ? <BigButton testID="add-member-button" title="Adicionar pessoa" icon="account-plus" variant="secondary" onPress={() => router.push("/membro")} /> : null}

          <Text style={styles.section}>Quem usa o app</Text>
          <View style={styles.card}>
            {f.users.map((u) => (
              <View key={u.user_id} style={{ gap: 4 }}>
                <View style={styles.userRow} testID={`app-user-${u.user_id}`}>
                  {u.picture ? <Image source={{ uri: u.picture }} style={styles.userPic} /> : <Avatar name={u.name ?? "?"} color={colors.brandPrimary} size={44} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.uName}>{u.name}</Text>
                    <Text style={styles.uMail} numberOfLines={1}>{u.email}</Text>
                    <Text style={styles.uMail}>Perfil: {u.family_role === "owner" ? "Proprietário" : u.family_role === "admin" ? "Administrador" : "Integrante"}</Text>
                    {u.relationship ? <Text style={styles.uMail}>Parentesco: {u.relationship}</Text> : null}
                    {u.financial_member_name ? <Text style={styles.uMail}>Pessoa no orçamento: {u.financial_member_name}</Text> : null}
                    {u.last_access_at !== undefined ? <Text style={styles.uMail}>Último acesso: {formatLastAccess(u.last_access_at)}</Text> : null}
                  </View>
                </View>
                {user?.family_role === "owner" && u.user_id !== user.user_id && u.family_role !== "owner" ? (
                  <BigButton testID={`role-toggle-${u.user_id}`} title={u.family_role === "admin" ? "Tornar integrante" : "Promover a administrador"} icon="account-cog" variant="ghost" onPress={() => void changeRole(u.user_id, u.family_role === "admin" ? "member" : "admin")} />
                ) : null}
                {canRemoveUser(u) ? (
                  <BigButton testID={`remove-family-user-${u.user_id}`} title="Remover integrante da família" icon="account-remove" variant="danger" onPress={() => setRemovalTarget({ userId: u.user_id, name: u.name })} />
                ) : null}
              </View>
            ))}
          </View>

          {canManageFamily ? (
            <View style={styles.card} testID="family-administration">
              <Text style={styles.section}>Administração financeira</Text>
              <Text style={styles.sectionHint}>Gerencie as contas compartilhadas separadamente dos seus lançamentos pessoais.</Text>
              <BigButton testID="family-budget-admin-open" title="Gerenciar orçamento familiar" icon="home-edit" variant="secondary" onPress={() => router.push("/family-budget-admin")} />
              {user?.family_role === "owner" ? <BigButton testID="family-minor-guardians-open" title="Responsáveis por menores" icon="account-child" variant="secondary" onPress={() => router.push("/minor-guardians")} /> : null}
            </View>
          ) : null}

          <View style={{ marginTop: 12 }}>
            <BigButton testID="logout-button" title="Sair do app" icon="logout" variant="danger" onPress={logout} />
          </View>
        </ScrollView>
      )}
      <Modal transparent visible={!!commitmentTarget} animationType="fade" onRequestClose={() => { if (!commitmentBusy) setCommitmentTarget(null); }}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.commitmentModal, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>Compromisso mensal</Text>
            <Text style={styles.sectionHint}>{commitmentTarget?.name} · {currentMonth}/{currentYear}. O salário pessoal não é exibido.</Text>
            <Text style={styles.mSub}>Valor combinado para contribuir com a família</Text>
            <View style={styles.commitmentInputWrap}>
              <Text style={styles.currency}>R$</Text>
              <TextInput testID="family-commitment-input" value={commitmentInput} onChangeText={setCommitmentInput} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={colors.muted} style={styles.commitmentInput} />
            </View>
            {commitmentError ? <Text style={styles.inviteError} testID="family-commitment-error">{commitmentError}</Text> : null}
            <BigButton testID="family-commitment-save" title="Salvar compromisso" icon="check-bold" onPress={() => void saveCommitment()} loading={commitmentBusy} />
            <BigButton testID="family-commitment-cancel" title="Cancelar" variant="ghost" onPress={() => setCommitmentTarget(null)} disabled={commitmentBusy} />
          </View>
        </View>
      </Modal>
      <Modal transparent visible={!!removalTarget} animationType="fade" onRequestClose={() => { if (!removalBusy) setRemovalTarget(null); }}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.commitmentModal, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>Remover integrante?</Text>
            <Text style={styles.sectionHint}>{removalTarget?.name} perderá o acesso aos dados compartilhados desta família, mesmo que continue conectado ao Google.</Text>
            <Text style={styles.sectionHint}>O histórico financeiro familiar será preservado. As finanças pessoais da pessoa não serão apagadas. Para voltar, será necessário receber um novo convite.</Text>
            {familyActionError ? <Text style={styles.inviteError} testID="family-action-error">{familyActionError}</Text> : null}
            <BigButton testID="confirm-remove-family-user" title="Confirmar remoção" icon="account-remove" variant="danger" onPress={() => void confirmRemoveUser()} loading={removalBusy} />
            <BigButton testID="cancel-remove-family-user" title="Cancelar" variant="ghost" onPress={() => setRemovalTarget(null)} disabled={removalBusy} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: { fontFamily: FONT.xbold, fontSize: 28, color: c.onSurface },
  content: { paddingHorizontal: 16, gap: 12 },
  invite: { borderRadius: 28, padding: 20, backgroundColor: c.brandTertiary, gap: 8 },
  welcome: { borderRadius: 28, padding: 20, backgroundColor: c.successSoft, gap: 10, borderWidth: 1, borderColor: c.brandPrimary },
  welcomeTitle: { fontFamily: FONT.xbold, fontSize: 24, color: c.onSurface },
  welcomeText: { fontFamily: FONT.regular, fontSize: 17, color: c.onSurface },
  welcomeFoot: { fontFamily: FONT.regular, fontSize: 14, color: c.muted },
  inviteLabel: { fontFamily: FONT.bold, fontSize: 18, color: c.onBrandTertiary },
  inviteHint: { fontFamily: FONT.regular, fontSize: 17, color: c.onBrandTertiary, marginBottom: 4 },
  inviteUrl: { fontFamily: FONT.mono, fontSize: 13, color: c.onBrandTertiary, backgroundColor: c.surface, borderRadius: 12, padding: 10 },
  inviteError: { fontFamily: FONT.bold, fontSize: 16, color: c.error },
  section: { fontFamily: FONT.xbold, fontSize: 24, color: c.onSurface, marginTop: 12 },
  sectionHint: { fontFamily: FONT.regular, fontSize: 16, color: c.muted, marginTop: -6 },
  member: {
    flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 20, backgroundColor: c.surfaceSecondary,
    borderWidth: 1, borderColor: c.border, minHeight: 96,
  },
  mName: { fontFamily: FONT.xbold, fontSize: 22, color: c.onSurface },
  mSub: { fontFamily: FONT.regular, fontSize: 15, color: c.muted },
  mValue: { fontFamily: FONT.xbold, fontSize: 20, color: c.success },
  editPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.brandSecondary, borderRadius: 999, paddingHorizontal: 12, height: 44 },
  editText: { fontFamily: FONT.bold, fontSize: 16, color: c.onBrandSecondary },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.45)" },
  commitmentModal: { borderRadius: 24, padding: 20, gap: 12 },
  modalTitle: { fontFamily: FONT.xbold, fontSize: 24, color: c.onSurface },
  commitmentInputWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: c.borderStrong, borderRadius: 16, paddingHorizontal: 14, minHeight: 62, gap: 8 },
  currency: { fontFamily: FONT.xbold, fontSize: 22, color: c.muted },
  commitmentInput: { flex: 1, minWidth: 0, height: 58, fontFamily: FONT.xbold, fontSize: 24, color: c.onSurface },
  card: { borderRadius: 20, backgroundColor: c.surfaceSecondary, padding: 12, gap: 8, borderWidth: 1, borderColor: c.border },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  userPic: { width: 44, height: 44, borderRadius: 22 },
  uName: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  uMail: { fontFamily: FONT.regular, fontSize: 15, color: c.muted },
}));

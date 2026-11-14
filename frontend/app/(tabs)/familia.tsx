import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { brl } from "@/src/format";
import { usesNativeTabs } from "@/src/navigation";
import { api, InviteCreated } from "@/src/api";
import { invalidateAll, useFamily, useMyFamilies } from "@/src/queries";
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
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [welcomeVisible, setWelcomeVisible] = useState(routeParams.welcome === "1");
  const [familyActionError, setFamilyActionError] = useState<string | null>(null);

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

          <Text style={styles.section}>Quem tem renda</Text>
          <Text style={styles.sectionHint}>Cadastre as pessoas que contribuem com o orçamento. Elas não precisam utilizar o aplicativo.</Text>
          {f.members.map((m) => (
            <Tap key={m.member_id} testID={`member-card-${m.member_id}`} disabled={!canManageFamily} onPress={canManageFamily ? () => router.push({ pathname: "/membro", params: { id: m.member_id } }) : undefined} style={styles.member}>
              <Avatar name={m.name} color={m.color} size={64} photoUrl={m.photo_url} />
              <View style={{ flex: 1 }}>
                <Text style={styles.mName}>{m.name}</Text>
                <Text style={styles.mSub}>Ganha por mês</Text>
                <Text style={styles.mValue}>{brl(m.default_income)}</Text>
              </View>
              {canManageFamily ? (
                <View style={styles.editPill}>
                  <Icon name="pencil" size={22} color={colors.onBrandSecondary} />
                  <Text style={styles.editText}>Mudar</Text>
                </View>
              ) : null}
            </Tap>
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
                    {u.last_access_at !== undefined ? <Text style={styles.uMail}>Último acesso: {formatLastAccess(u.last_access_at)}</Text> : null}
                  </View>
                </View>
                {user?.family_role === "owner" && u.user_id !== user.user_id && u.family_role !== "owner" ? (
                  <BigButton testID={`role-toggle-${u.user_id}`} title={u.family_role === "admin" ? "Tornar integrante" : "Promover a administrador"} icon="account-cog" variant="ghost" onPress={() => void changeRole(u.user_id, u.family_role === "admin" ? "member" : "admin")} />
                ) : null}
              </View>
            ))}
          </View>

          <View style={{ marginTop: 12 }}>
            <BigButton testID="logout-button" title="Sair do app" icon="logout" variant="danger" onPress={logout} />
          </View>
        </ScrollView>
      )}
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
  card: { borderRadius: 20, backgroundColor: c.surfaceSecondary, padding: 12, gap: 8, borderWidth: 1, borderColor: c.border },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  userPic: { width: 44, height: 44, borderRadius: 22 },
  uName: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  uMail: { fontFamily: FONT.regular, fontSize: 15, color: c.muted },
}));

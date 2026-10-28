import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { brl } from "@/src/format";
import { usesNativeTabs } from "@/src/navigation";
import { api, InviteCreated } from "@/src/api";
import { useFamily } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, BigButton, ErrorState, FONT, Icon, Loading, Tap } from "@/src/ui";

export default function Familia() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout, user } = useAuth();
  const q = useFamily();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const f = q.data;
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

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
          {user?.family_role === "owner" || user?.family_role === "admin" ? (
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
          {f.members.map((m) => (
            <Tap key={m.member_id} testID={`member-card-${m.member_id}`} onPress={() => router.push({ pathname: "/membro", params: { id: m.member_id } })} style={styles.member}>
              <Avatar name={m.name} color={m.color} size={64} />
              <View style={{ flex: 1 }}>
                <Text style={styles.mName}>{m.name}</Text>
                <Text style={styles.mSub}>Ganha por mês</Text>
                <Text style={styles.mValue}>{brl(m.default_income)}</Text>
              </View>
              <View style={styles.editPill}>
                <Icon name="pencil" size={22} color={colors.onBrandSecondary} />
                <Text style={styles.editText}>Mudar</Text>
              </View>
            </Tap>
          ))}
          <BigButton testID="add-member-button" title="Adicionar pessoa" icon="account-plus" variant="secondary" onPress={() => router.push("/membro")} />

          <Text style={styles.section}>Quem usa o app</Text>
          <View style={styles.card}>
            {f.users.map((u) => (
              <View key={u.user_id} style={styles.userRow} testID={`app-user-${u.user_id}`}>
                {u.picture ? <Image source={{ uri: u.picture }} style={styles.userPic} /> : <Avatar name={u.name ?? "?"} color={colors.brandPrimary} size={44} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.uName}>{u.name}</Text>
                  <Text style={styles.uMail} numberOfLines={1}>{u.email}</Text>
                </View>
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
  inviteLabel: { fontFamily: FONT.bold, fontSize: 18, color: c.onBrandTertiary },
  inviteHint: { fontFamily: FONT.regular, fontSize: 17, color: c.onBrandTertiary, marginBottom: 4 },
  inviteUrl: { fontFamily: FONT.mono, fontSize: 13, color: c.onBrandTertiary, backgroundColor: c.surface, borderRadius: 12, padding: 10 },
  inviteError: { fontFamily: FONT.bold, fontSize: 16, color: c.error },
  section: { fontFamily: FONT.xbold, fontSize: 24, color: c.onSurface, marginTop: 12 },
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

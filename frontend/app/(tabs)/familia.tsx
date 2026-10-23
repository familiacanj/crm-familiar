import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { brl } from "@/src/format";
import { usesNativeTabs } from "@/src/navigation";
import { useFamily } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, BigButton, ErrorState, FONT, Icon, Loading, Tap } from "@/src/ui";

export default function Familia() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();
  const q = useFamily();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const f = q.data;

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
          <View style={styles.invite} testID="invite-card">
            <Text style={styles.inviteLabel}>Código para convidar a família</Text>
            <Text style={styles.code} testID="invite-code">{f.invite_code}</Text>
            <Text style={styles.inviteHint}>Quem tiver este código entra no mesmo orçamento.</Text>
            <BigButton
              testID="share-invite-button"
              title="Enviar código"
              icon="share-variant"
              variant="secondary"
              onPress={() => Share.share({ message: `Entre no orçamento da ${f.name}! Use o código: ${f.invite_code}` })}
            />
          </View>

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
  code: { fontFamily: FONT.mono, fontSize: 44, letterSpacing: 8, color: c.onBrandTertiary, textAlign: "center", marginVertical: 4 },
  inviteHint: { fontFamily: FONT.regular, fontSize: 17, color: c.onBrandTertiary, marginBottom: 4 },
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

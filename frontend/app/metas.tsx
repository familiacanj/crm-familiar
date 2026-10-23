import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/screen-header";
import { brl } from "@/src/format";
import { useGoals } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { BigButton, ErrorState, FONT, Icon, IconCircle, Loading, Tap } from "@/src/ui";

export default function Metas() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useGoals();

  return (
    <View style={styles.root} testID="metas-screen">
      <ScreenHeader title="Nossas metas" testID="metas" />
      {q.isLoading ? (
        <Loading text="Carregando metas..." />
      ) : q.isError ? (
        <ErrorState text="Não conseguimos carregar as metas." onRetry={() => q.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brandPrimary} />}
        >
          <Text style={styles.help}>Juntem dinheiro para um sonho: uma viagem, uma reforma, uma reserva.</Text>
          {q.data?.length === 0 ? (
            <View style={styles.empty} testID="metas-empty">
              <Icon name="piggy-bank-outline" size={64} color={colors.brandPrimary} />
              <Text style={styles.emptyText}>Nenhuma meta ainda. Vamos criar a primeira?</Text>
            </View>
          ) : (
            q.data?.map((g) => {
              const done = g.pct >= 1;
              return (
                <Tap key={g.goal_id} testID={`goal-card-${g.goal_id}`} onPress={() => router.push({ pathname: "/meta", params: { id: g.goal_id } })} style={styles.card}>
                  <View style={styles.top}>
                    <IconCircle name={g.icon} color={colors.onBrandSecondary} bg={colors.brandSecondary} size={56} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{g.name}</Text>
                      <Text style={styles.sub}>Meta: {brl(g.target)}</Text>
                    </View>
                    {done ? <Icon name="trophy" size={36} color={colors.warning} /> : <Icon name="chevron-right" size={32} color={colors.muted} />}
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.min(g.pct, 1) * 100}%` }]} />
                  </View>
                  <Text style={styles.saved} testID={`goal-saved-${g.goal_id}`}>
                    {done ? "Meta alcançada! " : ""}Guardado {brl(g.saved)} ({Math.round(g.pct * 100)}%)
                  </Text>
                </Tap>
              );
            })
          )}
          <BigButton testID="add-goal-button" title="Criar nova meta" icon="plus" onPress={() => router.push("/meta")} />
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { paddingHorizontal: 16, gap: 12 },
  help: { fontFamily: FONT.regular, fontSize: 18, color: c.muted },
  card: { borderRadius: 20, backgroundColor: c.surfaceSecondary, padding: 16, gap: 12, borderWidth: 1, borderColor: c.border },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { fontFamily: FONT.xbold, fontSize: 22, color: c.onSurface },
  sub: { fontFamily: FONT.bold, fontSize: 17, color: c.muted },
  track: { height: 24, borderRadius: 12, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  fill: { height: 24, borderRadius: 12, backgroundColor: c.brandPrimary },
  saved: { fontFamily: FONT.xbold, fontSize: 19, color: c.success },
  empty: { alignItems: "center", gap: 12, padding: 24, borderRadius: 20, backgroundColor: c.brandSecondary },
  emptyText: { fontFamily: FONT.bold, fontSize: 18, color: c.onBrandSecondary, textAlign: "center" },
}));

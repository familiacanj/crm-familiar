import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";
import { FONT, Icon, Tap } from "@/src/ui";

export function ScreenHeader({ title, testID }: { title: string; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Tap testID={`${testID}-back-button`} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.back}>
        <Icon name="arrow-left" size={30} color={colors.onSurface} />
      </Tap>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: c.surface },
  back: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: FONT.xbold, fontSize: 26, color: c.onSurface },
}));

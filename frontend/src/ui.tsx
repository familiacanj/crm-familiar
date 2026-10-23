import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";
import { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { MONTHS } from "@/src/format";
import { makeStyles, useTheme } from "@/src/theme";

export const Icon = MaterialDesignIcons;
export const FONT = { regular: "Nunito-Regular", bold: "Nunito-Bold", xbold: "Nunito-ExtraBold", mono: "SpaceMono" };

export function haptic(kind: "light" | "medium" | "success" | "error" | "selection" = "light") {
  if (Platform.OS === "web") return;
  if (kind === "success" || kind === "error")
    Haptics.notificationAsync(kind === "success" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
  else if (kind === "selection") Haptics.selectionAsync();
  else Haptics.impactAsync(kind === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Tap({
  children, onPress, style, testID, disabled,
}: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; testID?: string; disabled?: boolean }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      testID={testID}
      disabled={disabled}
      accessibilityRole="button"
      onPressIn={() => (s.value = withSpring(0.96))}
      onPressOut={() => (s.value = withSpring(1))}
      onPress={() => {
        haptic("light");
        onPress?.();
      }}
      style={[style, a, disabled && { opacity: 0.5 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function BigButton({
  title, icon, onPress, variant = "primary", testID, loading, disabled,
}: {
  title: string; icon?: string; onPress: () => void; variant?: "primary" | "secondary" | "danger" | "ghost";
  testID: string; loading?: boolean; disabled?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const fg = { primary: colors.onBrandPrimary, secondary: colors.onBrandSecondary, danger: colors.error, ghost: colors.onSurface }[variant];
  return (
    <Tap testID={testID} onPress={onPress} disabled={disabled || loading} style={[styles.btn, styles[`btn_${variant}`]]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon as any} size={26} color={fg} /> : null}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Tap>
  );
}

export function MonthSelector({ year, month, onShift, label }: { year: number; month: number; onShift: (d: number) => void; label?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.monthBar} testID="month-selector">
      <Tap testID="month-prev-button" onPress={() => onShift(-1)} style={styles.monthArrow}>
        <Icon name="chevron-left" size={36} color={colors.onBrandSecondary} />
      </Tap>
      <View style={styles.monthCenter}>
        <Icon name="calendar-month" size={22} color={colors.onBrandSecondary} />
        <Text style={styles.monthText} testID="month-selector-label">
          {label ?? `${MONTHS[month - 1]} ${year}`}
        </Text>
      </View>
      <Tap testID="month-next-button" onPress={() => onShift(1)} style={styles.monthArrow}>
        <Icon name="chevron-right" size={36} color={colors.onBrandSecondary} />
      </Tap>
    </View>
  );
}

export function IconCircle({ name, color, bg, size = 56 }: { name: string; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={name as any} size={size * 0.5} color={color} />
    </View>
  );
}

export function Avatar({ name, color, size = 56 }: { name: string; color: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: FONT.xbold, fontSize: size * 0.42, color: colors.onBrand }}>{name.trim().charAt(0).toUpperCase() || "?"}</Text>
    </View>
  );
}

export function Loading({ text }: { text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.center} testID="loading-state">
      <ActivityIndicator size="large" color={colors.brandPrimary} />
      <Text style={styles.centerText}>{text}</Text>
    </View>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.center} testID="error-state">
      <Icon name="wifi-off" size={64} color={colors.error} />
      <Text style={styles.centerText}>{text}</Text>
      <BigButton testID="retry-button" title="Tentar de novo" icon="refresh" onPress={onRetry} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  btn: {
    minHeight: 60, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 12, paddingHorizontal: 24,
  },
  btn_primary: { backgroundColor: c.brandPrimary },
  btn_secondary: { backgroundColor: c.brandSecondary },
  btn_danger: { backgroundColor: c.errorSoft },
  btn_ghost: { backgroundColor: c.surfaceTertiary },
  btnText: { fontFamily: FONT.xbold, fontSize: 20 },
  monthBar: {
    flexDirection: "row", alignItems: "center", backgroundColor: c.brandSecondary, borderRadius: 999,
    height: 64, paddingHorizontal: 4,
  },
  monthArrow: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  monthCenter: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  monthText: { fontFamily: FONT.xbold, fontSize: 22, color: c.onBrandSecondary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  centerText: { fontFamily: FONT.bold, fontSize: 20, color: c.onSurface, textAlign: "center" },
}));

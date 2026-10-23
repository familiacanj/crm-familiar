import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { Platform } from "react-native";

import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

const TABS = [
  { name: "index", label: "Início", icon: "home", sf: "house.fill" },
  { name: "lancar", label: "Contas", icon: "pencil-box-multiple", sf: "square.and.pencil" },
  { name: "ano", label: "Ano", icon: "chart-bar", sf: "chart.bar.fill" },
  { name: "familia", label: "Família", icon: "account-group", sf: "person.3.fill" },
] as const;

export default function TabsLayout() {
  const { colors } = useTheme();

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        {TABS.map((t) => (
          <NativeTabs.Trigger key={t.name} name={t.name}>
            <NativeTabs.Trigger.Icon sf={t.sf} />
            <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: "Nunito-Bold", fontSize: 14 },
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.label,
            tabBarButtonTestID: `tab-${t.name}`,
            tabBarIcon: ({ color, focused }) => (
              <MaterialDesignIcons name={(focused || t.name === "ano" ? t.icon : `${t.icon}-outline`) as any} size={28} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

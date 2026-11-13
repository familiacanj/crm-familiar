import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, LogBox, Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AuthProvider, useAuth } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { MonthProvider } from "@/src/month";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";
import { getFirstFamilyWelcomeRoute, isFirstFamilyWelcomeRouteActive } from "@/src/first-family-flow";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

function Gate() {
  const { user, createdFamilyId, consumeCreatedFamily } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { colors } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    "Nunito-Regular": require("../assets/fonts/Nunito-Regular.ttf"),
    "Nunito-Bold": require("../assets/fonts/Nunito-Bold.ttf"),
    "Nunito-ExtraBold": require("../assets/fonts/Nunito-ExtraBold.ttf"),
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (Platform.OS !== "web" || user === undefined || (!fontsLoaded && !fontError)) return;
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event("crm-app-ready")));
    return () => cancelAnimationFrame(frame);
  }, [user, fontsLoaded, fontError]);

  useEffect(() => {
    const destination = getFirstFamilyWelcomeRoute(createdFamilyId, user?.family_id);
    if (!destination) return;
    // Protected-route reconciliation can still select the default Home tab.
    // Keep the intent until the router reports Família as the active route.
    if (isFirstFamilyWelcomeRouteActive(createdFamilyId, user?.family_id, segments)) {
      consumeCreatedFamily();
      return;
    }
    router.replace(destination);
  }, [createdFamilyId, user?.family_id, consumeCreatedFamily, router, segments]);

  if (user === undefined || (!fontsLoaded && !fontError)) {
    return (
      <View style={[styles.splash, { backgroundColor: colors.surface }]} testID="app-loading">
        {Platform.OS === "web" ? null : <ActivityIndicator size="large" color={colors.brandPrimary} />}
      </View>
    );
  }

  const hasFamily = !!user?.family_id;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="politica-de-privacidade" />
      <Stack.Screen name="termos-de-uso" />
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !hasFamily}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={hasFamily}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="editar" options={{ presentation: "modal" }} />
        <Stack.Screen name="membro" options={{ presentation: "modal" }} />
        <Stack.Screen name="categoria" options={{ presentation: "modal" }} />
        <Stack.Screen name="pessoas" />
        <Stack.Screen name="metas" />
        <Stack.Screen name="meta" options={{ presentation: "modal" }} />
      </Stack.Protected>
      {/* Keep the invite route deep-linkable without making it the default root route. */}
      <Stack.Screen name="invite" />
    </Stack>
  );
}

export default function RootLayout() {
  // One app level ErrorBoundary; a render crash shows a reload screen
  // instead of a blank app. GestureHandlerRootView must wrap the whole tree
  // or any gesture/swipe/drawer screen crashes in Expo Go.
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <AuthProvider>
              <MonthProvider>
                <StatusBar style="dark" />
                <Gate />
              </MonthProvider>
            </AuthProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { flex: 1, alignItems: "center", justifyContent: "center" },
});

import { Redirect } from "expo-router";

import { useAuth } from "@/src/auth";

export default function Index() {
  const { user } = useAuth();

  if (user?.family_id) return <Redirect href="/(tabs)" />;
  if (user) return <Redirect href="/onboarding" />;
  return <Redirect href="/login" />;
}

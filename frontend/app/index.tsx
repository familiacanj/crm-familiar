import { Redirect } from "expo-router";

import { useAuth } from "@/src/auth";
import { getPlatformAdminInitialRoute } from "@/src/platform-admin-routing";

export default function Index() {
  const { user } = useAuth();

  return <Redirect href={getPlatformAdminInitialRoute(user)} />;
}

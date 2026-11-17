import { Redirect } from "expo-router";

import { useAuth } from "@/src/auth";
import { getPlatformAdminInitialRoute } from "@/src/platform-admin-routing";

export default function Index() {
  const { user } = useAuth();

  if (user?.profile_completion_required) {
    return <Redirect href={{ pathname: "/perfil", params: { inviteStep: "1" } }} />;
  }

  return <Redirect href={getPlatformAdminInitialRoute(user)} />;
}

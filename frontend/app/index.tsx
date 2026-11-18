import { Redirect, useLocalSearchParams } from "expo-router";

import { useAuth } from "@/src/auth";
import { getPlatformAdminInitialRoute } from "@/src/platform-admin-routing";

export default function Index() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ report_recovery?: string | string[] }>();
  const recoveryNonce = Array.isArray(params.report_recovery) ? params.report_recovery[0] : params.report_recovery;

  if (recoveryNonce) {
    return <Redirect href={{ pathname: "/report-password-reset", params: { report_recovery: recoveryNonce } }} />;
  }

  if (user?.profile_completion_required) {
    return <Redirect href={{ pathname: "/perfil", params: { inviteStep: "1" } }} />;
  }

  return <Redirect href={getPlatformAdminInitialRoute(user)} />;
}

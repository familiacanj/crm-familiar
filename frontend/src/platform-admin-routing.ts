export type PlatformAdminRouteUser = {
  is_superadmin?: boolean;
  family_id?: string | null;
} | null | undefined;

/** Initial destination only; family members can switch between CRM and platform admin explicitly. */
export function getPlatformAdminInitialRoute(user: PlatformAdminRouteUser) {
  if (!user) return "/login" as const;
  if (user.is_superadmin) return "/platform-admin" as const;
  if (user.family_id) return "/(tabs)" as const;
  return "/onboarding" as const;
}

export const FIRST_FAMILY_WELCOME_ROUTE = "/(tabs)/familia?welcome=1";

/**
 * Keeps the first-family transition in one place. The route is emitted only
 * after the authenticated profile already points to the family just created.
 */
export function getFirstFamilyWelcomeRoute(
  createdFamilyId: string | null,
  activeFamilyId: string | null | undefined,
): string | null {
  if (!createdFamilyId || createdFamilyId !== activeFamilyId) return null;
  return FIRST_FAMILY_WELCOME_ROUTE;
}

/** Keep the creation intent until Expo Router confirms the Família tab is active. */
export function isFirstFamilyWelcomeRouteActive(
  createdFamilyId: string | null,
  activeFamilyId: string | null | undefined,
  segments: readonly string[],
): boolean {
  return Boolean(
    createdFamilyId &&
    createdFamilyId === activeFamilyId &&
    segments.length >= 2 &&
    segments[segments.length - 2] === "(tabs)" &&
    segments[segments.length - 1] === "familia",
  );
}

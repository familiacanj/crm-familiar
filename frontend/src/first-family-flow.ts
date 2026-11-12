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

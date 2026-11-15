export const HOMOLOGATION_SUPABASE_URL = "https://bnsfkddqdcjctcjllkxc.supabase.co";

export function isHomologationAuthEnabled() {
  const configured = process.env.EXPO_PUBLIC_HOMOLOGATION_AUTH?.trim().toLowerCase() === "true";
  const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return configured && configuredUrl === HOMOLOGATION_SUPABASE_URL;
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ScreenHeader } from "@/src/components/screen-header";
import { makeStyles } from "@/src/theme";
import { BigButton, FONT, Tap } from "@/src/ui";

type Options = { minors: { user_id: string; name: string }[]; adults: { user_id: string; name: string }[] };
type Guardian = { minor_user_id: string; minor_name: string; guardian_user_id: string; guardian_name: string };

export default function MinorGuardians() {
  const styles = useStyles(); const insets = useSafeAreaInsets(); const client = useQueryClient(); const { user } = useAuth();
  const [minorId, setMinorId] = useState<string | null>(null); const [guardianId, setGuardianId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const options = useQuery({ queryKey: ["minor-guardian-options"], queryFn: () => api<Options>("/family/minor-guardians/options"), enabled: user?.family_role === "owner" });
  const guardians = useQuery({ queryKey: ["minor-guardians"], queryFn: () => api<Guardian[]>("/family/minors/guardians"), enabled: user?.family_role === "owner" });
  const refresh = async () => { await client.invalidateQueries({ queryKey: ["minor-guardians"] }); await client.invalidateQueries({ queryKey: ["minor-guardian-options"] }); };
  const grant = async () => {
    if (!minorId || !guardianId) { setError("Escolha o menor e o responsável."); return; }
    setBusy(true); setError(null); setMessage(null);
    try { await api(`/family/minors/${encodeURIComponent(minorId)}/guardians`, { method: "POST", body: { guardian_user_id: guardianId } }); setMessage("Responsável autorizado. O acesso termina automaticamente aos 18 anos."); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível autorizar o responsável."); }
    finally { setBusy(false); }
  };
  const revoke = async (row: Guardian) => {
    setBusy(true); setError(null); setMessage(null);
    try { await api(`/family/minors/${encodeURIComponent(row.minor_user_id)}/guardians/${encodeURIComponent(row.guardian_user_id)}`, { method: "DELETE" }); setMessage("A autorização foi revogada."); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível revogar a autorização."); }
    finally { setBusy(false); }
  };
  return <View style={styles.root}><ScreenHeader title="Responsáveis por menores" testID="minor-guardians" /><ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
    {user?.family_role !== "owner" ? <Text style={styles.helper}>Somente o proprietário pode administrar estas autorizações.</Text> : <>
      <Text style={styles.helper}>O acesso exige uma designação explícita. Administradores não recebem acesso automático. A autorização expira no aniversário de 18 anos.</Text>
      <View style={styles.card}><Text style={styles.heading}>Escolha o integrante menor</Text><View style={styles.chips}>{(options.data?.minors ?? []).map((item) => <Tap key={item.user_id} onPress={() => setMinorId(item.user_id)} style={[styles.chip, minorId === item.user_id && styles.chipOn]}><Text style={minorId === item.user_id ? styles.chipTextOn : styles.chipText}>{item.name}</Text></Tap>)}</View><Text style={styles.heading}>Escolha o responsável adulto</Text><View style={styles.chips}>{(options.data?.adults ?? []).map((item) => <Tap key={item.user_id} onPress={() => setGuardianId(item.user_id)} style={[styles.chip, guardianId === item.user_id && styles.chipOn]}><Text style={guardianId === item.user_id ? styles.chipTextOn : styles.chipText}>{item.name}</Text></Tap>)}</View><BigButton testID="minor-guardian-grant" title="Autorizar acesso" icon="account-check" onPress={() => void grant()} loading={busy} /></View>
      <View style={styles.card}><Text style={styles.heading}>Autorizações atuais</Text>{(guardians.data ?? []).map((row) => <View key={`${row.minor_user_id}:${row.guardian_user_id}`} style={styles.row}><View style={{ flex: 1 }}><Text style={styles.person}>{row.guardian_name} → {row.minor_name}</Text><Text style={styles.helper}>Acesso aos dados pessoais do menor até completar 18 anos</Text></View><BigButton testID={`revoke-${row.minor_user_id}-${row.guardian_user_id}`} title="Revogar" icon="account-cancel" variant="secondary" onPress={() => void revoke(row)} loading={busy} /></View>)}{!guardians.data?.length ? <Text style={styles.helper}>Nenhuma autorização ativa.</Text> : null}</View>
      {error ? <Text style={styles.error}>{error}</Text> : null}{message ? <Text style={styles.message}>{message}</Text> : null}
    </>}
  </ScrollView></View>;
}

const useStyles = makeStyles((c) => ({ root: { flex: 1, backgroundColor: c.surface }, content: { width: "100%", maxWidth: 700, alignSelf: "center", padding: 16, gap: 12 }, card: { borderRadius: 18, backgroundColor: c.surfaceSecondary, padding: 14, gap: 10, borderWidth: 1, borderColor: c.border }, heading: { fontFamily: FONT.xbold, fontSize: 18, color: c.onSurface }, helper: { fontFamily: FONT.regular, fontSize: 14, color: c.muted }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, chip: { borderRadius: 999, backgroundColor: c.surfaceTertiary, paddingHorizontal: 12, paddingVertical: 9 }, chipOn: { backgroundColor: c.brandPrimary }, chipText: { fontFamily: FONT.bold, color: c.onSurface, fontSize: 15 }, chipTextOn: { fontFamily: FONT.bold, color: c.onBrandPrimary, fontSize: 15 }, row: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 8 }, person: { fontFamily: FONT.bold, fontSize: 15, color: c.onSurface }, error: { fontFamily: FONT.bold, color: c.error, fontSize: 15 }, message: { fontFamily: FONT.bold, color: c.success, fontSize: 15 } }));

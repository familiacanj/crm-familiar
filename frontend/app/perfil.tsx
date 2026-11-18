import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, uploadOwnProfilePhoto } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ScreenHeader } from "@/src/components/screen-header";
import { ageFromBirthDate, FAMILY_RELATIONSHIPS, formatBirthDate, maskBirthDate, parseBrazilianBirthDate } from "@/src/profile-fields";
import { invalidateAll } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, BigButton, FONT, haptic, Icon, Tap } from "@/src/ui";

export default function MeuPerfil() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ inviteStep?: string }>();
  const { user, refreshUser } = useAuth();
  const inviteStep = params.inviteStep === "1" || !!user?.profile_completion_required;
  const savedRelationship = user?.relationship?.trim() ?? "";
  const savedRelationshipIsOption = (FAMILY_RELATIONSHIPS as readonly string[]).includes(savedRelationship)
    && savedRelationship !== "Outros";
  const [name, setName] = useState(user?.name ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(formatBirthDate(user?.date_of_birth));
  const [relationship, setRelationship] = useState(savedRelationshipIsOption ? savedRelationship : savedRelationship ? "Outros" : "");
  const [customRelationship, setCustomRelationship] = useState(savedRelationshipIsOption ? "" : savedRelationship);
  const [reportSharing, setReportSharing] = useState(!!user?.report_sharing_authorized);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [deletionRequest, setDeletionRequest] = useState<{ request_id: string; status: string; requested_at: string } | null>(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const photoUri = photo?.uri ?? user?.picture;
  const dateOfBirthIso = parseBrazilianBirthDate(dateOfBirth);
  const profileAge = dateOfBirthIso ? ageFromBirthDate(dateOfBirthIso) : null;
  const effectiveRelationship = relationship === "Outros" ? customRelationship.trim() : relationship.trim();

  useEffect(() => {
    let active = true;
    void api<{ request: typeof deletionRequest }>("/account/deletion-request")
      .then((result) => { if (active) setDeletionRequest(result.request); })
      .catch(() => { if (active) setDeletionError("Não foi possível consultar suas solicitações de exclusão agora."); });
    return () => { active = false; };
  }, []);

  const requestAccountDeletion = async () => {
    if (deletionConfirmation.trim() !== "EXCLUIR MINHA CONTA") {
      setDeletionError("Digite EXCLUIR MINHA CONTA para confirmar.");
      return;
    }
    setDeletionBusy(true);
    setDeletionError(null);
    try {
      const result = await api<{ request_id: string; status: string }>("/account/deletion-request", {
        method: "POST", body: { confirmation: deletionConfirmation },
      });
      setDeletionRequest({ ...result, requested_at: new Date().toISOString() });
      setDeletionConfirmation("");
    } catch (e) {
      setDeletionError(e instanceof Error ? e.message : "Não foi possível registrar a solicitação.");
    } finally {
      setDeletionBusy(false);
    }
  };

  const withdrawAccountDeletion = async () => {
    if (!deletionRequest) return;
    setDeletionBusy(true);
    setDeletionError(null);
    try {
      await api(`/account/deletion-request/${encodeURIComponent(deletionRequest.request_id)}`, { method: "DELETE" });
      setDeletionRequest(null);
    } catch (e) {
      setDeletionError(e instanceof Error ? e.message : "Não foi possível cancelar a solicitação.");
    } finally {
      setDeletionBusy(false);
    }
  };

  const choosePhoto = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
      if (!result.canceled && result.assets[0]) setPhoto(result.assets[0]);
    } catch (e: any) {
      setError(e?.message ?? "Não foi possível abrir suas fotografias.");
    }
  };

  const continueHome = () => router.replace("/(tabs)");
  const save = async () => {
    const displayName = name.trim();
    if (!displayName) return setError("Digite seu nome de exibição.");
    if (dateOfBirth && !dateOfBirthIso) return setError("Informe uma data real no formato DD/MM/AAAA, sem data futura.");
    if (user?.date_of_birth && !dateOfBirthIso) return setError("A data de nascimento não pode ser removida.");
    if (inviteStep && !dateOfBirthIso) return setError("Informe sua data de nascimento para concluir o cadastro.");
    if (inviteStep && !effectiveRelationship) return setError("Informe seu parentesco ou vínculo familiar.");
    setBusy(true);
    setError(null);
    try {
      await api("/auth/profile", { method: "PATCH", body: {
        display_name: displayName,
        date_of_birth: dateOfBirthIso,
        relationship: effectiveRelationship || null,
        report_sharing_authorized: reportSharing,
      } });
      if (photo) await uploadOwnProfilePhoto({ uri: photo.uri, name: photo.fileName ?? undefined, mimeType: photo.mimeType ?? undefined });
      await refreshUser();
      await invalidateAll();
      haptic("success");
      if (inviteStep) continueHome();
      else router.back();
    } catch (e: any) {
      setError(e?.message ?? "Não foi possível salvar seu perfil.");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!user?.picture || photo) { setPhoto(null); return; }
    setBusy(true);
    setError(null);
    try {
      await api("/auth/profile/photo", { method: "DELETE" });
      await refreshUser();
      await invalidateAll();
    } catch (e: any) {
      setError(e?.message ?? "Não foi possível remover a fotografia.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="profile-screen">
      <ScreenHeader title="Meu perfil" testID="profile" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {inviteStep ? <Text style={styles.intro}>Complete estes dados para entrar no CRM da família. A fotografia é opcional.</Text> : null}
        <View style={styles.photoBlock}>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" /> : <Avatar name={name || "?"} color={colors.brandPrimary} size={112} />}
          <BigButton testID="profile-photo-select" title={photoUri ? "Trocar fotografia" : "Adicionar fotografia"} icon="image-plus" variant="secondary" onPress={() => void choosePhoto()} disabled={busy} />
          {photoUri ? <BigButton testID="profile-photo-remove" title="Remover fotografia" icon="image-remove" variant="ghost" onPress={() => void removePhoto()} disabled={busy} /> : null}
        </View>

        <Text style={styles.label}>Nome de exibição na família</Text>
        <TextInput testID="profile-name-input" value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor={colors.muted} maxLength={80} style={styles.input} />

        <Text style={styles.label}>E-mail da conta</Text>
        <View style={styles.readonly}><Text style={styles.readonlyText} selectable>{user?.email ?? ""}</Text></View>
        <Text style={styles.label}>Família</Text>
        <View style={styles.readonly}><Text style={styles.readonlyText}>{user?.family_name ?? "—"}</Text></View>
        <Text style={styles.label}>Papel na família</Text>
        <View style={styles.readonly}><Text style={styles.readonlyText}>{user?.family_role === "owner" ? "Proprietário" : user?.family_role === "admin" ? "Administrador" : "Integrante"}</Text></View>

        <Text style={styles.sectionTitle}>Privacidade e autorizações</Text>
        <Text style={styles.label}>Data de nascimento{inviteStep ? " (obrigatória)" : ""}</Text>
        <TextInput
          testID="profile-date-of-birth"
          accessibilityLabel="Data de nascimento"
          value={dateOfBirth}
          onChangeText={(value) => { setDateOfBirth(maskBirthDate(value)); setError(null); }}
          placeholder="DD/MM/AAAA"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={10}
          style={styles.input}
        />
        {profileAge !== null ? <Text style={styles.helper}>Idade calculada: {profileAge} anos</Text> : null}

        <Text style={styles.label}>Parentesco ou vínculo familiar{inviteStep ? " (obrigatório)" : ""}</Text>
        <View style={styles.relationshipOptions}>
          {FAMILY_RELATIONSHIPS.map((option) => {
            const selected = relationship === option;
            return (
              <Tap
                key={option}
                testID={`profile-relationship-${option.toLowerCase()}`}
                onPress={() => { setRelationship(option); setError(null); }}
                style={[styles.relationshipOption, selected && styles.relationshipOptionSelected]}
              >
                <Text style={[styles.relationshipOptionText, selected && styles.relationshipOptionTextSelected]}>{option}</Text>
              </Tap>
            );
          })}
        </View>
        {relationship === "Outros" ? (
          <TextInput
            testID="profile-relationship-custom"
            accessibilityLabel="Outro parentesco ou vínculo familiar"
            value={customRelationship}
            onChangeText={(value) => { setCustomRelationship(value); setError(null); }}
            placeholder="Informe o vínculo"
            placeholderTextColor={colors.muted}
            maxLength={80}
            style={styles.input}
          />
        ) : null}
        {!inviteStep ? <Text style={styles.helper}>Este vínculo vale somente para esta família e não muda suas permissões.</Text> : null}
        {profileAge !== null && profileAge >= 18 ? (
          <Tap testID="profile-report-sharing-consent" onPress={() => setReportSharing((value) => !value)} style={styles.consentRow}>
            <Icon name={reportSharing ? "checkbox-marked" : "checkbox-blank-outline"} size={26} color={colors.brandPrimary} />
            <Text style={styles.consentText}>Autorizo o proprietário da família a consultar meus relatórios financeiros pessoais.</Text>
          </Tap>
        ) : <Text style={styles.helper}>Se você for menor de 18 anos, o acesso aos seus dados exige autorização de um responsável designado. Proprietário e Administrador não recebem acesso automático.</Text>}

        {error ? <Text style={styles.error} testID="profile-error">{error}</Text> : null}
        <BigButton testID="profile-save-button" title="Salvar alterações" icon="check-bold" onPress={() => void save()} loading={busy} disabled={!name.trim()} />

        {!inviteStep ? <View style={styles.deletionSection} testID="account-deletion-section">
          <Text style={styles.sectionTitle}>Saída e exclusão de dados</Text>
          <Text style={styles.helper}>
            Sair da família remove o vínculo familiar; sair do aplicativo apenas encerra a sessão. O CRM ainda não oferece desativação temporária. Uma solicitação de exclusão definitiva fica pendente de análise e não apaga nem desativa sua conta imediatamente.
          </Text>
          <Text style={styles.helper}>
            Na análise, dados do perfil e finanças pessoais serão avaliados para exclusão ou anonimização. O histórico compartilhado da família poderá ser mantido somente no mínimo necessário para preservar os registros dos demais integrantes, sujeito à confirmação do responsável e da base aplicável. Nenhum prazo legal de retenção foi presumido.
          </Text>
          {deletionRequest ? <>
            <Text style={styles.deletionStatus} testID="account-deletion-pending">Solicitação pendente de análise ({deletionRequest.request_id}). Sua conta segue ativa e o aplicativo não envia e-mail automaticamente. Envie o protocolo a ajudapopular@gmail.com para iniciar o atendimento.</Text>
            <BigButton testID="account-deletion-cancel" title="Cancelar solicitação" icon="close-circle-outline" variant="secondary" onPress={() => void withdrawAccountDeletion()} loading={deletionBusy} />
          </> : <>
            <Text style={styles.label}>Para solicitar exclusão definitiva, digite EXCLUIR MINHA CONTA</Text>
            <TextInput testID="account-deletion-confirmation" accessibilityLabel="Confirmação de exclusão da conta" value={deletionConfirmation} onChangeText={(value) => { setDeletionConfirmation(value); setDeletionError(null); }} autoCapitalize="characters" maxLength={40} style={styles.input} placeholder="EXCLUIR MINHA CONTA" placeholderTextColor={colors.muted} />
            <BigButton testID="account-deletion-submit" title="Solicitar exclusão da conta" icon="account-remove-outline" variant="danger" onPress={() => void requestAccountDeletion()} loading={deletionBusy} />
          </>}
          {deletionError ? <Text style={styles.error} testID="account-deletion-error">{deletionError}</Text> : null}
          <Tap testID="profile-privacy-policy-link" onPress={() => router.push("/politica-de-privacidade")} style={styles.legalLink}><Text style={styles.legalLinkText}>Política de Privacidade</Text></Tap>
          <Tap testID="profile-terms-link" onPress={() => router.push("/termos-de-uso")} style={styles.legalLink}><Text style={styles.legalLinkText}>Termos de Uso</Text></Tap>
        </View> : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", paddingHorizontal: 20, gap: 12 },
  intro: { fontFamily: FONT.regular, fontSize: 18, color: c.muted, textAlign: "center", marginBottom: 4 },
  photoBlock: { alignItems: "center", gap: 10, paddingVertical: 12 },
  photo: { width: 112, height: 112, borderRadius: 56 },
  label: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface, marginTop: 4 },
  input: { minHeight: 58, borderRadius: 16, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.borderStrong, paddingHorizontal: 16, fontFamily: FONT.bold, fontSize: 19, color: c.onSurface },
  readonly: { minHeight: 54, justifyContent: "center", borderRadius: 16, backgroundColor: c.surfaceTertiary, paddingHorizontal: 16 },
  readonlyText: { fontFamily: FONT.regular, fontSize: 18, color: c.onSurface },
  sectionTitle: { fontFamily: FONT.xbold, fontSize: 22, color: c.onSurface, marginTop: 14 },
  helper: { fontFamily: FONT.regular, fontSize: 15, color: c.muted },
  deletionSection: { gap: 10, paddingTop: 14, marginTop: 10, borderTopWidth: 1, borderTopColor: c.divider },
  deletionStatus: { fontFamily: FONT.bold, fontSize: 15, lineHeight: 22, color: c.onBrandSecondary, backgroundColor: c.brandSecondary, borderRadius: 12, padding: 12 },
  legalLink: { paddingVertical: 8 },
  legalLinkText: { fontFamily: FONT.bold, fontSize: 16, color: c.brandPrimary, textDecorationLine: "underline" },
  relationshipOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  relationshipOption: { borderRadius: 18, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary, paddingVertical: 10, paddingHorizontal: 14 },
  relationshipOptionSelected: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  relationshipOptionText: { fontFamily: FONT.bold, fontSize: 15, color: c.onSurface },
  relationshipOptionTextSelected: { color: c.onBrandPrimary },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, backgroundColor: c.surfaceSecondary, padding: 12 },
  consentText: { flex: 1, fontFamily: FONT.bold, fontSize: 15, color: c.onSurface },
  error: { fontFamily: FONT.bold, fontSize: 16, color: c.error, textAlign: "center" },
}));

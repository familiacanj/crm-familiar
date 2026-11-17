import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
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
  const photoUri = photo?.uri ?? user?.picture;
  const dateOfBirthIso = parseBrazilianBirthDate(dateOfBirth);
  const profileAge = dateOfBirthIso ? ageFromBirthDate(dateOfBirthIso) : null;
  const effectiveRelationship = relationship === "Outros" ? customRelationship.trim() : relationship.trim();

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
  relationshipOptions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  relationshipOption: { borderRadius: 18, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary, paddingVertical: 10, paddingHorizontal: 14 },
  relationshipOptionSelected: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  relationshipOptionText: { fontFamily: FONT.bold, fontSize: 15, color: c.onSurface },
  relationshipOptionTextSelected: { color: c.onBrandPrimary },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, backgroundColor: c.surfaceSecondary, padding: 12 },
  consentText: { flex: 1, fontFamily: FONT.bold, fontSize: 15, color: c.onSurface },
  error: { fontFamily: FONT.bold, fontSize: 16, color: c.error, textAlign: "center" },
}));

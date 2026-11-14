import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, uploadOwnProfilePhoto } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ScreenHeader } from "@/src/components/screen-header";
import { invalidateAll } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, BigButton, FONT, haptic } from "@/src/ui";

export default function MeuPerfil() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ inviteStep?: string }>();
  const inviteStep = params.inviteStep === "1";
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoUri = photo?.uri ?? user?.picture;

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
    setBusy(true);
    setError(null);
    try {
      await api("/auth/profile", { method: "PATCH", body: { display_name: displayName } });
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
        {inviteStep ? <Text style={styles.intro}>Complete seu perfil para aparecer para sua família. Esta etapa é opcional.</Text> : null}
        <View style={styles.photoBlock}>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" /> : <Avatar name={name || "?"} color={colors.brandPrimary} size={112} />}
          <BigButton testID="profile-photo-select" title={photoUri ? "Trocar fotografia" : "Adicionar fotografia"} icon="image-plus" variant="secondary" onPress={() => void choosePhoto()} disabled={busy} />
          {photoUri ? <BigButton testID="profile-photo-remove" title="Remover fotografia" icon="image-remove" variant="ghost" onPress={() => void removePhoto()} disabled={busy} /> : null}
        </View>

        <Text style={styles.label}>Nome de exibição na família</Text>
        <TextInput testID="profile-name-input" value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor={colors.muted} maxLength={80} style={styles.input} />

        <Text style={styles.label}>E-mail da conta Google</Text>
        <View style={styles.readonly}><Text style={styles.readonlyText} selectable>{user?.email ?? ""}</Text></View>
        <Text style={styles.label}>Família</Text>
        <View style={styles.readonly}><Text style={styles.readonlyText}>{user?.family_name ?? "—"}</Text></View>
        <Text style={styles.label}>Papel na família</Text>
        <View style={styles.readonly}><Text style={styles.readonlyText}>{user?.family_role === "owner" ? "Proprietário" : user?.family_role === "admin" ? "Administrador" : "Integrante"}</Text></View>

        {error ? <Text style={styles.error} testID="profile-error">{error}</Text> : null}
        <BigButton testID="profile-save-button" title="Salvar alterações" icon="check-bold" onPress={() => void save()} loading={busy} disabled={!name.trim()} />
        {inviteStep ? <BigButton testID="profile-skip-button" title="Fazer depois" variant="ghost" onPress={continueHome} disabled={busy} /> : null}
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
  error: { fontFamily: FONT.bold, fontSize: 16, color: c.error, textAlign: "center" },
}));

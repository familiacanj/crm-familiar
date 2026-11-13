import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Modal, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Member, uploadMemberPhoto } from "@/src/api";
import { useAuth } from "@/src/auth";
import { parseMoney, toInput } from "@/src/format";
import { invalidateAll, useFamily } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { Avatar, BigButton, FONT, haptic, Icon, Tap } from "@/src/ui";

// Member avatar colors are user data, identical in any theme.
const COLORS = ["#3B825C", "#C2185B", "#F57C00", "#6D4C41", "#1565C0", "#00838F", "#7B1FA2", "#455A64"];
const RELATIONSHIPS = ["Mãe", "Pai", "Esposa", "Esposo", "Filha", "Filho", "Avó", "Avô", "Irmã", "Irmão", "Neta", "Neto", "Tia", "Tio", "Sogra", "Sogro", "Outros"];

export default function Membro() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const fam = useFamily();
  const { user } = useAuth();
  const existing = fam.data?.members.find((m) => m.member_id === id);
  const [name, setName] = useState(existing?.name ?? "");
  const [relationshipDraft, setRelationshipDraft] = useState<{ key: string; value: string; custom: string } | null>(null);
  const [relationshipOptionsOpen, setRelationshipOptionsOpen] = useState(false);
  const formKey = id ?? "__new__";
  const savedRelationship = existing?.relationship?.trim() ?? "";
  const savedRelationshipIsKnown = RELATIONSHIPS.includes(savedRelationship) && savedRelationship !== "Outros";
  const relationship = relationshipDraft?.key === formKey
    ? relationshipDraft.value
    : savedRelationshipIsKnown ? savedRelationship : savedRelationship ? "Outros" : "";
  const customRelationship = relationshipDraft?.key === formKey
    ? relationshipDraft.custom
    : savedRelationship && !savedRelationshipIsKnown ? savedRelationship : "";
  const [income, setIncome] = useState(toInput(existing?.default_income ?? 0));
  const [color, setColor] = useState(existing?.color ?? COLORS[4]);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [createdMemberId, setCreatedMemberId] = useState<string | null>(null);
  const canManagePhoto = user?.family_role === "owner" || user?.family_role === "admin";
  const photoPreview = photoFile?.uri ?? existing?.photo_url;

  const choosePhoto = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.85 });
      if (!result.canceled && result.assets[0]) setPhotoFile(result.assets[0]);
    } catch (e: any) {
      setError(e?.message ?? "Não foi possível abrir suas fotografias.");
    }
  };

  const removePhoto = async () => {
    if (!id) { setPhotoFile(null); return; }
    setPhotoBusy(true);
    setError(null);
    try {
      await api(`/members/${id}/photo`, { method: "DELETE" });
      setPhotoFile(null);
      await invalidateAll();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async () => {
    const v = income.trim() ? parseMoney(income) : 0;
    if (!name.trim()) return setError("Digite o nome.");
    if (v === null) return setError("Digite só números. Exemplo: 2500,00");
    setBusy(true);
    try {
      const relationshipValue = relationship === "Outros" ? customRelationship.trim() || null : relationship || null;
      const body = { name, relationship: relationshipValue, color, default_income: v };
      const targetId = id ?? createdMemberId;
      const saved = targetId
        ? await api<Member>(`/members/${targetId}`, { method: "PUT", body })
        : await api<Member>("/members", { method: "POST", body });
      if (!targetId) setCreatedMemberId(saved.member_id);
      if (photoFile && canManagePhoto) {
        await uploadMemberPhoto(saved.member_id, { uri: photoFile.uri, name: photoFile.fileName ?? undefined, mimeType: photoFile.mimeType ?? undefined });
      }
      await invalidateAll();
      haptic("success");
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDel) return setConfirmDel(true);
    setBusy(true);
    try {
      await api(`/members/${id}`, { method: "DELETE" });
      await invalidateAll();
      router.back();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="membro-screen">
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>{id ? "Mudar pessoa" : "Nova pessoa"}</Text>
        <Tap testID="membro-close-button" onPress={() => router.back()} style={styles.close}>
          <Icon name="close" size={32} color={colors.onSurface} />
        </Tap>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} bottomOffset={24} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", gap: 10 }}>
          {photoPreview ? <Image source={{ uri: photoPreview }} style={{ width: 96, height: 96, borderRadius: 48 }} /> : <Avatar name={name || "?"} color={color} size={96} />}
          {canManagePhoto ? (
            <View style={styles.photoActions}>
              <BigButton testID="membro-photo-select" title={photoPreview ? "Trocar fotografia" : "Escolher fotografia"} icon="image-plus" variant="secondary" onPress={choosePhoto} disabled={photoBusy} />
              {photoPreview ? <BigButton testID="membro-photo-remove" title="Remover fotografia" icon="image-remove" variant="ghost" onPress={removePhoto} loading={photoBusy} /> : null}
            </View>
          ) : null}
          {photoFile ? <Text style={styles.photoHint}>A nova fotografia será salva ao tocar em Salvar.</Text> : null}
        </View>
        <Text style={styles.label}>Nome</Text>
        <TextInput testID="membro-name-input" value={name} onChangeText={setName} placeholder="Digite o nome da pessoa" placeholderTextColor={colors.muted} style={styles.input} />
        <Text style={styles.label}>Parentesco</Text>
        <Tap testID="membro-relationship-select" onPress={() => setRelationshipOptionsOpen(true)} style={styles.relationshipSelect}>
          <Text style={[styles.relationshipText, !relationship && { color: colors.muted }]}>{relationship || "Selecione o parentesco"}</Text>
          <Icon name="chevron-down" size={26} color={colors.onSurface} />
        </Tap>
        {relationship === "Outros" ? (
          <TextInput
            testID="membro-relationship-other-input"
            value={customRelationship}
            onChangeText={(value) => setRelationshipDraft({ key: formKey, value: "Outros", custom: value })}
            placeholder="Digite o parentesco ou vínculo"
            placeholderTextColor={colors.muted}
            maxLength={80}
            style={styles.input}
          />
        ) : null}
        <Text style={styles.label}>Quanto ganha por mês?</Text>
        <View style={styles.moneyWrap}>
          <Text style={styles.currency}>R$</Text>
          <TextInput testID="membro-income-input" value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.moneyInput} />
        </View>
        <Text style={styles.label}>Cor</Text>
        <View style={styles.colors}>
          {COLORS.map((c) => (
            <Tap key={c} testID={`membro-color-${c.slice(1)}`} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}>
              {color === c ? <Icon name="check-bold" size={26} color={colors.onBrand} /> : null}
            </Tap>
          ))}
        </View>
        {error ? <Text style={styles.error} testID="membro-error">{error}</Text> : null}
        <BigButton testID="membro-save-button" title="Salvar" icon="check-bold" onPress={save} loading={busy && !confirmDel} />
        {id ? (
          <BigButton testID="membro-delete-button" title={confirmDel ? "Toque de novo para remover" : "Remover pessoa"} icon="delete" variant="danger" onPress={remove} />
        ) : null}
      </KeyboardAwareScrollView>
      <Modal transparent visible={relationshipOptionsOpen} animationType="fade" onRequestClose={() => setRelationshipOptionsOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.relationshipModal, { backgroundColor: colors.surface }]}>
            <Text style={styles.modalTitle}>Selecione o parentesco</Text>
            <ScrollView style={styles.relationshipOptions} keyboardShouldPersistTaps="handled">
              {RELATIONSHIPS.map((option) => (
                <Tap
                  key={option}
                  testID={`membro-relationship-${option.toLowerCase().replaceAll(" ", "-")}`}
                  onPress={() => {
                    setRelationshipDraft({ key: formKey, value: option, custom: option === "Outros" ? customRelationship : "" });
                    setRelationshipOptionsOpen(false);
                  }}
                  style={[styles.relationshipOption, relationship === option && { backgroundColor: colors.surfaceTertiary }]}
                >
                  <Text style={styles.relationshipText}>{option}</Text>
                </Tap>
              ))}
            </ScrollView>
            <BigButton testID="membro-relationship-cancel" title="Cancelar" variant="secondary" onPress={() => setRelationshipOptionsOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 },
  title: { fontFamily: FONT.xbold, fontSize: 26, color: c.onSurface, paddingLeft: 8 },
  close: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 24, gap: 12 },
  label: { fontFamily: FONT.bold, fontSize: 20, color: c.onSurface, marginTop: 4 },
  input: {
    height: 64, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.borderStrong,
    paddingHorizontal: 16, fontFamily: FONT.bold, fontSize: 22, color: c.onSurface,
  },
  relationshipSelect: {
    minHeight: 64, borderRadius: 20, backgroundColor: c.surfaceSecondary, borderWidth: 1.5,
    borderColor: c.borderStrong, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  relationshipText: { fontFamily: FONT.bold, fontSize: 20, color: c.onSurface },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  relationshipModal: { borderRadius: 24, maxHeight: "85%", padding: 20, gap: 12 },
  modalTitle: { fontFamily: FONT.xbold, fontSize: 24, color: c.onSurface },
  relationshipOptions: { flexShrink: 1 },
  relationshipOption: { minHeight: 52, justifyContent: "center", paddingHorizontal: 14, borderRadius: 14 },
  moneyWrap: {
    flexDirection: "row", alignItems: "center", height: 72, borderRadius: 20, backgroundColor: c.surfaceSecondary,
    borderWidth: 1.5, borderColor: c.borderStrong, paddingHorizontal: 16, gap: 8,
  },
  currency: { fontFamily: FONT.xbold, fontSize: 26, color: c.muted },
  moneyInput: { flex: 1, height: 68, fontFamily: FONT.xbold, fontSize: 30, color: c.onSurface },
  colors: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  photoActions: { width: "100%", gap: 8 },
  photoHint: { fontFamily: FONT.regular, fontSize: 15, color: c.muted, textAlign: "center" },
  swatch: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 4, borderColor: c.onSurface },
  error: { fontFamily: FONT.bold, fontSize: 18, color: c.error },
}));

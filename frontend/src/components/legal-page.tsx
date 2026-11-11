import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles } from "@/src/theme";
import { FONT, Icon } from "@/src/ui";

export type LegalSection = { title: string; paragraphs: string[] };

export function LegalPage({ title, updatedAt, sections }: {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]}
      testID="legal-document"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voltar ao CRM Familiar"
        onPress={() => router.replace("/")}
        style={styles.back}
        testID="legal-back-button"
      >
        <Icon name="arrow-left" size={24} color="#2C6345" />
        <Text style={styles.backText}>Voltar ao CRM Familiar</Text>
      </Pressable>

      <View style={styles.document}>
        <Text style={styles.eyebrow}>CRM Familiar</Text>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.updated}>Versão preliminar para revisão · Atualizada em {updatedAt}</Text>

        <View style={styles.notice} testID="legal-review-notice">
          <Text style={styles.noticeTitle}>Revisão necessária antes da publicação</Text>
          <Text style={styles.noticeText}>
            O responsável pelo serviço, o canal de contato para pedidos de privacidade, a política de retenção e o procedimento de exclusão de conta ainda precisam ser definidos e confirmados.
          </Text>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((paragraph, index) => (
              <Text key={`${section.title}-${index}`} style={styles.paragraph}>{paragraph}</Text>
            ))}
          </View>
        ))}

        <Text style={styles.footer}>
          Este texto é uma versão preliminar baseada no código analisado. Ele não representa certificação de conformidade nem substitui revisão jurídica e confirmação das práticas operacionais.
        </Text>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { width: "100%", alignItems: "center", paddingHorizontal: 18 },
  back: { width: "100%", maxWidth: 820, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 },
  backText: { fontFamily: FONT.bold, fontSize: 16, color: c.onBrandSecondary },
  document: { width: "100%", maxWidth: 820, gap: 16, paddingBottom: 12 },
  eyebrow: { fontFamily: FONT.xbold, fontSize: 14, color: c.brandPrimary, textTransform: "uppercase", letterSpacing: 1 },
  title: { fontFamily: FONT.xbold, fontSize: 32, lineHeight: 38, color: c.onSurface },
  updated: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: c.muted },
  notice: { gap: 6, padding: 16, borderRadius: 16, backgroundColor: c.brandSecondary, borderWidth: 1, borderColor: c.brandTertiary },
  noticeTitle: { fontFamily: FONT.xbold, fontSize: 16, color: c.onBrandSecondary },
  noticeText: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.onBrandSecondary },
  section: { gap: 8, paddingTop: 4 },
  sectionTitle: { fontFamily: FONT.xbold, fontSize: 20, lineHeight: 26, color: c.onSurface },
  paragraph: { fontFamily: FONT.regular, fontSize: 16, lineHeight: 25, color: c.onSurface },
  footer: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.border, fontFamily: FONT.regular, fontSize: 13, lineHeight: 20, color: c.muted },
}));

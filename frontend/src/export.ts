import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { api } from "@/src/api";
import { supabase } from "@/src/supabase";

export async function exportExcel(year: number) {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/export/${year}.xlsx?token=${encodeURIComponent(session?.access_token ?? "")}`;
  if (Platform.OS === "web") {
    window.open(url, "_blank");
    return;
  }
  const file = new File(Paths.cache, `orcamento_familia_${year}.xlsx`);
  if (file.exists) file.delete();
  const downloaded = await File.downloadFileAsync(url, file);
  await Sharing.shareAsync(downloaded.uri, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    UTI: "org.openxmlformats.spreadsheetml.sheet",
    dialogTitle: "Planilha do orçamento",
  });
}

export async function exportPdf(year: number) {
  const { html } = await api<{ html: string }>(`/export/${year}/html`);
  if (Platform.OS === "web") {
    const w = window.open("", "_blank");
    if (!w) throw new Error("Permita janelas pop-up para gerar o PDF.");
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "PDF do orçamento" });
}
